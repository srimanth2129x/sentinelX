"""
Comprehensive Security Test Suite: Authentication, Authorization & RBAC Enforcement
=====================================================================================
Verifies that:
1. Unauthenticated requests to protected endpoints return HTTP 401 Unauthorized.
2. Authenticated Administrator JWT can execute all administrative actions.
3. Authenticated Viewer JWT can read telemetry/status but is strictly rejected (HTTP 403) on writes.
4. Sensor tokens are device-bound; tokens issued for Device A cannot impersonate Device B.
5. Revoked/Pending devices are blocked from ingesting telemetry (HTTP 403).
6. Network monitoring start/stop routes enforce admin auth and validate inputs.
7. Incident patch and retrieval routes work correctly with RBAC.
"""
import os
import json
import pytest
import tempfile
from pathlib import Path
from datetime import datetime, timezone
from backend.app import create_app
from backend.database.db import get_conn, init_db
from backend.config import config
from backend.api.auth import generate_jwt


@pytest.fixture
def auth_test_env():
    """Sets up an isolated test database and configured Flask test client."""
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tmp_db:
        db_path = tmp_db.name
    init_db(db_path)

    app = create_app(db_path=db_path)
    app.config["TESTING"] = True

    admin_jwt = generate_jwt(1, "admin_user", "Administrator")
    viewer_jwt = generate_jwt(2, "viewer_user", "Viewer")

    admin_headers = {"Authorization": f"Bearer {admin_jwt}"}
    viewer_headers = {"Authorization": f"Bearer {viewer_jwt}"}

    with app.test_client() as client:
        yield {
            "client": client,
            "db_path": db_path,
            "admin_headers": admin_headers,
            "viewer_headers": viewer_headers,
            "admin_jwt": admin_jwt,
            "viewer_jwt": viewer_jwt,
        }

    try:
        os.unlink(db_path)
    except Exception:
        pass


def test_unauthenticated_requests_rejected(auth_test_env):
    """Verifies that all protected endpoints reject requests without Authorization header (HTTP 401)."""
    client = auth_test_env["client"]

    protected_get_routes = [
        "/api/devices",
        "/api/network/devices",
        "/api/events",
        "/api/alerts",
        "/api/incidents",
        "/api/dashboard/summary",
        "/api/risk/summary",
        "/api/risk/devices",
        "/api/network/topology",
        "/api/cyber_twin/topology",
        "/api/cyberdna/entities",
        "/api/cyberdna/users",
        "/api/network/interfaces",
        "/api/simulation/results",
        "/api/network/monitoring/status",
        "/api/network/discover/stream",
    ]

    for route in protected_get_routes:
        res = client.get(route)
        assert res.status_code == 401, f"Expected 401 for GET {route}, got {res.status_code}"
        assert "Unauthorized" in res.get_json().get("error", "")

    protected_post_routes = [
        ("/api/network/discover", {}),
        ("/api/network/monitoring/start", {"interval": 30}),
        ("/api/network/monitoring/stop", {}),
        ("/api/network/clear", {}),
        ("/api/network/devices/clear", {}),
        ("/api/events/clear", {}),
        ("/api/drive/sync", {}),
        ("/api/simulation/run", {"source_node_id": "dev-test", "source_risk": 50}),
        ("/api/cyber_twin/propagate", {"source_node_id": "dev-test", "source_risk": 50}),
        ("/api/cyberdna/simulate", {"entity_id": "dev-test", "observation": 1.0}),
        ("/api/devices/DEV-001/authorize", {}),
        ("/api/devices/DEV-001/revoke", {}),
    ]

    for route, payload in protected_post_routes:
        res = client.post(route, json=payload)
        assert res.status_code == 401, f"Expected 401 for POST {route}, got {res.status_code}"
        assert "Unauthorized" in res.get_json().get("error", "")

    # DELETE route
    res_del = client.delete("/api/devices/DEV-001")
    assert res_del.status_code == 401


def test_admin_jwt_authorized_calls_succeed(auth_test_env):
    """Verifies that valid Administrator credentials allow execution of admin operations."""
    client = auth_test_env["client"]
    admin_headers = auth_test_env["admin_headers"]

    # Dashboard summary
    res_dash = client.get("/api/dashboard/summary", headers=admin_headers)
    assert res_dash.status_code == 200

    # Device list
    res_dev = client.get("/api/devices", headers=admin_headers)
    assert res_dev.status_code == 200

    # Monitoring start and stop
    res_start = client.post("/api/network/monitoring/start", json={"interval": 15}, headers=admin_headers)
    assert res_start.status_code == 200
    assert res_start.get_json()["is_monitoring"] is True

    res_stop = client.post("/api/network/monitoring/stop", headers=admin_headers)
    assert res_stop.status_code == 200
    assert res_stop.get_json()["is_monitoring"] is False

    # Event clear
    res_clear = client.post("/api/events/clear", headers=admin_headers)
    assert res_clear.status_code == 200


def test_viewer_access_is_limited_to_read_only(auth_test_env):
    """Verifies that Viewer role can read protected resources but is rejected (HTTP 403) on writes."""
    client = auth_test_env["client"]
    viewer_headers = auth_test_env["viewer_headers"]

    # Allowed reads
    read_routes = [
        "/api/devices",
        "/api/events",
        "/api/alerts",
        "/api/dashboard/summary",
        "/api/risk/summary",
        "/api/network/topology",
        "/api/cyberdna/entities",
        "/api/simulation/results",
    ]
    for route in read_routes:
        res = client.get(route, headers=viewer_headers)
        assert res.status_code == 200, f"Viewer expected 200 on {route}, got {res.status_code}"

    # Forbidden writes
    write_routes = [
        ("/api/network/discover", {}),
        ("/api/network/monitoring/start", {"interval": 30}),
        ("/api/network/monitoring/stop", {}),
        ("/api/network/clear", {}),
        ("/api/events/clear", {}),
        ("/api/drive/sync", {}),
        ("/api/devices/DEV-001/authorize", {}),
        ("/api/devices/DEV-001/revoke", {}),
        ("/api/simulation/run", {"source_node_id": "dev-test"}),
    ]
    for route, payload in write_routes:
        res = client.post(route, json=payload, headers=viewer_headers)
        assert res.status_code == 403, f"Viewer expected 403 on {route}, got {res.status_code}"
        assert "Forbidden" in res.get_json().get("error", "")

    # Forbidden delete
    res_del = client.delete("/api/devices/DEV-001", headers=viewer_headers)
    assert res_del.status_code == 403

    # Forbidden stream (requires Administrator)
    res_stream = client.get("/api/network/discover/stream", headers=viewer_headers)
    assert res_stream.status_code == 403


def test_sensor_token_cannot_impersonate_another_device(auth_test_env):
    """
    CRITICAL SECURITY CHECK:
    Proves that a token issued to Device Alpha cannot be used to submit telemetry
    for Device Beta (anti-spoofing / anti-impersonation).
    """
    client = auth_test_env["client"]

    # 1. Register Device Alpha (local) -> AUTHORIZED with Token Alpha
    res_a = client.post(
        "/api/sensor/register",
        json={"device_id": "DEV-ALPHA", "hostname": "HOST-ALPHA"},
        environ_base={"REMOTE_ADDR": "127.0.0.1"}
    )
    assert res_a.status_code == 201
    token_alpha = res_a.get_json()["token"]

    # 2. Register Device Beta (local) -> AUTHORIZED with Token Beta
    res_b = client.post(
        "/api/sensor/register",
        json={"device_id": "DEV-BETA", "hostname": "HOST-BETA"},
        environ_base={"REMOTE_ADDR": "127.0.0.1"}
    )
    assert res_b.status_code == 201
    token_beta = res_b.get_json()["token"]

    assert token_alpha != token_beta

    # 3. Legitimate submissions succeed
    payload_alpha = {
        "device_id": "DEV-ALPHA",
        "channel": "Security",
        "event_id": 4624,
        "record_id": 101,
        "user": "alice"
    }
    res_legit_a = client.post("/api/events", json=payload_alpha, headers={"X-Sensor-Token": token_alpha, "X-Device-Id": "DEV-ALPHA"})
    assert res_legit_a.status_code == 201

    payload_beta = {
        "device_id": "DEV-BETA",
        "channel": "Security",
        "event_id": 4624,
        "record_id": 201,
        "user": "bob"
    }
    res_legit_b = client.post("/api/events", json=payload_beta, headers={"X-Sensor-Token": token_beta, "X-Device-Id": "DEV-BETA"})
    assert res_legit_b.status_code == 201

    # 4. Impersonation attack: Token Alpha attempts to submit events claiming to be DEV-BETA
    res_impersonate = client.post(
        "/api/events",
        json=payload_beta,
        headers={"X-Sensor-Token": token_alpha, "X-Device-Id": "DEV-BETA"}
    )
    assert res_impersonate.status_code == 401
    assert "Invalid sensor token for this device" in res_impersonate.get_json().get("error", "")

    # 5. Reverse impersonation: Token Beta attempts to submit events claiming to be DEV-ALPHA
    res_impersonate_rev = client.post(
        "/api/events",
        json=payload_alpha,
        headers={"X-Sensor-Token": token_beta, "X-Device-Id": "DEV-ALPHA"}
    )
    assert res_impersonate_rev.status_code == 401
    assert "Invalid sensor token for this device" in res_impersonate_rev.get_json().get("error", "")

    # 6. Bogus token rejected
    res_bogus = client.post(
        "/api/events",
        json=payload_alpha,
        headers={"X-Sensor-Token": "st-tok-fabricated-token-1234567890", "X-Device-Id": "DEV-ALPHA"}
    )
    assert res_bogus.status_code == 401


def test_revoked_device_blocked_from_ingestion(auth_test_env):
    """Verifies that revoking a device immediately prevents telemetry submission even with valid token."""
    client = auth_test_env["client"]
    admin_headers = auth_test_env["admin_headers"]

    reg = client.post(
        "/api/sensor/register",
        json={"device_id": "DEV-REVOKE-TEST", "hostname": "REVOKE-HOST"},
        environ_base={"REMOTE_ADDR": "127.0.0.1"}
    )
    token = reg.get_json()["token"]

    payload = {"device_id": "DEV-REVOKE-TEST", "channel": "Security", "event_id": 4624, "record_id": 301}

    # Before revoke -> 201
    res_ok = client.post("/api/events", json=payload, headers={"X-Sensor-Token": token, "X-Device-Id": "DEV-REVOKE-TEST"})
    assert res_ok.status_code == 201

    # Revoke via Admin
    res_rev = client.post("/api/devices/DEV-REVOKE-TEST/revoke", headers=admin_headers)
    assert res_rev.status_code == 200

    # After revoke -> 403
    payload["record_id"] = 302
    res_blocked = client.post("/api/events", json=payload, headers={"X-Sensor-Token": token, "X-Device-Id": "DEV-REVOKE-TEST"})
    assert res_blocked.status_code == 403
    assert "REVOKED" in res_blocked.get_json().get("error", "")


def test_network_monitoring_routes(auth_test_env):
    """Verifies network monitoring start, stop, and status routes."""
    client = auth_test_env["client"]
    admin_headers = auth_test_env["admin_headers"]

    # Start with valid params
    res_start = client.post("/api/network/monitoring/start", json={"interface": "Ethernet0", "interval": 20}, headers=admin_headers)
    assert res_start.status_code == 200
    data = res_start.get_json()
    assert data["status"] == "monitoring_started"
    assert data["is_monitoring"] is True
    assert data["interval"] == 20

    # Status check
    res_stat = client.get("/api/network/monitoring/status", headers=admin_headers)
    assert res_stat.status_code == 200
    assert res_stat.get_json()["is_monitoring"] is True

    # Start with invalid interval (out of bounds)
    res_bad = client.post("/api/network/monitoring/start", json={"interval": 1}, headers=admin_headers)
    assert res_bad.status_code == 400

    # Stop
    res_stop = client.post("/api/network/monitoring/stop", headers=admin_headers)
    assert res_stop.status_code == 200
    assert res_stop.get_json()["is_monitoring"] is False


def test_incident_status_update_and_retrieval(auth_test_env):
    """Verifies incident retrieval and status patching with RBAC."""
    client = auth_test_env["client"]
    db_path = auth_test_env["db_path"]
    admin_headers = auth_test_env["admin_headers"]
    viewer_headers = auth_test_env["viewer_headers"]

    # Insert test alert
    with get_conn(db_path) as conn:
        conn.execute("""
            INSERT INTO alerts (id, device_id, title, severity, status, description, created_at, timestamp, risk_points)
            VALUES (901, 'DEV-TEST', 'Suspicious PowerShell Execution', 'HIGH', 'Open', 'Encoded command', '2026-08-17', '2026-08-17', 75)
        """)

    # Viewer can read incident
    res_get = client.get("/api/incidents/901", headers=viewer_headers)
    assert res_get.status_code == 200
    assert res_get.get_json()["status"] == "Open"

    # Viewer cannot patch incident
    res_viewer_patch = client.patch("/api/incidents/901", json={"status": "Resolved"}, headers=viewer_headers)
    assert res_viewer_patch.status_code == 403

    # Admin can patch incident
    res_admin_patch = client.patch("/api/incidents/901", json={"status": "Resolved"}, headers=admin_headers)
    assert res_admin_patch.status_code == 200
    assert res_admin_patch.get_json()["new_status"] == "Resolved"

    # Verify updated status
    res_get_updated = client.get("/api/incidents/901", headers=viewer_headers)
    assert res_get_updated.status_code == 200
    assert res_get_updated.get_json()["status"] == "Resolved"


def test_network_discover_stream_admin(auth_test_env):
    """Verifies that an Admin can stream progressive device discoveries via SSE."""
    client = auth_test_env["client"]
    admin_headers = auth_test_env["admin_headers"]

    res = client.get("/api/network/discover/stream?interface_ip=127.0.0.1", headers=admin_headers)
    assert res.status_code == 200
    assert "text/event-stream" in res.content_type
    data = res.get_data(as_text=True)
    assert "data: " in data
    assert '"type":' in data
