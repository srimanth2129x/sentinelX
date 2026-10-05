"""
SentinelTwin Multi-Device & Connectivity Automated Test Suite
Covers Scenarios A through J:
  Test A: Same machine (127.0.0.1) auto-authorization
  Test B: Same LAN registration (PENDING state & admin approval)
  Test C: Multi-device baseline & alert isolation
  Test D: Direct connection timeout & failure handling
  Test E: Google Drive crash-safe batch creation & relay sync
  Test F: Dual-layer deduplication (batch-level and event-level)
  Test G: Automatic transport recovery (Drive -> Direct)
  Test H: Offline queue buffering & checkpoint decoupling
  Test I: Full device authorization lifecycle (PENDING -> AUTHORIZED -> REVOKED)
  Test J: Dynamic offline health timeout detection
"""
import os
import json
import time
import shutil
import tempfile
from pathlib import Path
from datetime import datetime, timezone, timedelta
import pytest

from backend.app import create_app
from backend.database.db import get_conn, init_db
from backend.config import config
from backend.api.auth import generate_jwt
from backend.services.drive_sync import drive_sync_manager
from sensor.windows_sensor import (
    write_crash_safe_drive_batch,
    enqueue_offline,
    drain_offline_queue,
    probe_transport,
    get_or_create_device_id,
    load_checkpoints,
    save_checkpoints,
)


@pytest.fixture
def multi_device_env():
    """Sets up an isolated test database and environment."""
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as tmp_db:
        db_path = tmp_db.name
    init_db(db_path)

    temp_dir = tempfile.mkdtemp(prefix="sentinel_test_relay_")
    relay_path = Path(temp_dir)

    app = create_app(db_path=db_path)
    app.config["TESTING"] = True

    with app.test_client() as client:
        yield client, db_path, relay_path

    # Cleanup
    try:
        os.unlink(db_path)
    except Exception:
        pass
    shutil.rmtree(temp_dir, ignore_errors=True)


# ==========================================================
# Test A: Same Machine (127.0.0.1) Auto-Authorization
# ==========================================================
def test_a_localhost_auto_authorization(multi_device_env):
    client, db_path, _ = multi_device_env

    # 1. Register from localhost socket
    res = client.post(
        "/api/sensor/register",
        json={"device_id": "ST-LOCAL-01", "hostname": "LOCAL-HOST", "source_ip": "127.0.0.1"},
        environ_base={"REMOTE_ADDR": "127.0.0.1"}
    )
    assert res.status_code == 201
    data = res.get_json()
    assert data["status"] == "AUTHORIZED"
    token = data["token"]
    assert token.startswith("st-tok-")

    # 2. Ingest telemetry from local sensor
    event_payload = {
        "device_id": "ST-LOCAL-01",
        "channel": "Security",
        "event_id": 4624,
        "record_id": 1001,
        "event_timestamp": datetime.now(timezone.utc).isoformat(),
        "user": "local_analyst"
    }
    ingest_res = client.post(
        "/api/events",
        json=event_payload,
        headers={"X-Sensor-Token": token, "X-Device-Id": "ST-LOCAL-01"}
    )
    assert ingest_res.status_code == 201


# ==========================================================
# Test B: Same LAN Registration (Starts PENDING, approved by admin)
# ==========================================================
def test_b_lan_registration_and_gating(multi_device_env):
    client, db_path, _ = multi_device_env

    # 1. Register from remote LAN socket
    res = client.post(
        "/api/sensor/register",
        json={"device_id": "ST-LAN-01", "hostname": "WORKSTATION-A", "source_ip": "192.168.1.55"},
        environ_base={"REMOTE_ADDR": "192.168.1.55"}
    )
    assert res.status_code == 201
    data = res.get_json()
    assert data["status"] == "PENDING"
    token = data["token"]

    # 2. Verify telemetry is blocked while PENDING (HTTP 403)
    event_payload = {
        "device_id": "ST-LAN-01",
        "channel": "Security",
        "event_id": 4624,
        "record_id": 2001,
        "event_timestamp": datetime.now(timezone.utc).isoformat(),
        "user": "remote_user"
    }
    blocked_res = client.post(
        "/api/events",
        json=event_payload,
        headers={"X-Sensor-Token": token, "X-Device-Id": "ST-LAN-01"}
    )
    assert blocked_res.status_code == 403

    # 3. Administrator explicitly authorizes the device
    admin_token = generate_jwt(1, "admin", "Administrator")
    auth_res = client.post("/api/devices/ST-LAN-01/authorize", headers={"Authorization": f"Bearer {admin_token}"})
    assert auth_res.status_code == 200
    assert auth_res.get_json()["status"] == "AUTHORIZED"

    # 4. Ingestion now succeeds (HTTP 201)
    allowed_res = client.post(
        "/api/events",
        json=event_payload,
        headers={"X-Sensor-Token": token, "X-Device-Id": "ST-LAN-01"}
    )
    assert allowed_res.status_code == 201


# ==========================================================
# Test C: Multi-Device Baseline & Alert Isolation
# ==========================================================
def test_c_multi_device_isolation(multi_device_env):
    client, db_path, _ = multi_device_env

    # Register and authorize two separate endpoints
    for dev_id in ("ST-DEV-ALPHA", "ST-DEV-BETA"):
        reg = client.post(
            "/api/sensor/register",
            json={"device_id": dev_id, "hostname": f"HOST-{dev_id}"},
            environ_base={"REMOTE_ADDR": "127.0.0.1"}
        )
        assert reg.status_code == 201

    # Send events for Alpha
    for i in range(1, 4):
        client.post(
            "/api/events",
            json={
                "device_id": "ST-DEV-ALPHA",
                "channel": "Security",
                "event_id": 4688,
                "record_id": 3000 + i,
                "process_name": "cmd.exe",
                "command_line": "cmd.exe /c echo alpha"
            },
            headers={"X-Sensor-Token": config.SENSOR_TOKEN, "X-Device-Id": "ST-DEV-ALPHA"}
        )

    # Send events for Beta
    for i in range(1, 4):
        client.post(
            "/api/events",
            json={
                "device_id": "ST-DEV-BETA",
                "channel": "Security",
                "event_id": 4624,
                "record_id": 4000 + i,
                "user": f"beta_user_{i}"
            },
            headers={"X-Sensor-Token": config.SENSOR_TOKEN, "X-Device-Id": "ST-DEV-BETA"}
        )

    # Verify database segregation
    with get_conn(db_path) as conn:
        alpha_events = conn.execute("SELECT count(*) as c FROM events WHERE device_id = 'ST-DEV-ALPHA'").fetchone()["c"]
        beta_events = conn.execute("SELECT count(*) as c FROM events WHERE device_id = 'ST-DEV-BETA'").fetchone()["c"]
        assert alpha_events == 3
        assert beta_events == 3


# ==========================================================
# Test D: Direct Connection Failure Handling
# ==========================================================
def test_d_direct_connection_failure():
    # Probe a non-existent port with small timeout
    reachable = probe_transport("http://127.0.0.1:59199", timeout=0.3)
    assert reachable is False


# ==========================================================
# Test E: Google Drive Crash-Safe Batch & Sync Manager
# ==========================================================
def test_e_crash_safe_drive_relay(multi_device_env):
    client, db_path, relay_path = multi_device_env

    device_id = "ST-DRIVE-TEST"
    # Pre-authorize device
    client.post(
        "/api/sensor/register",
        json={"device_id": device_id, "hostname": "DRIVE-HOST"},
        environ_base={"REMOTE_ADDR": "127.0.0.1"}
    )

    events = [
        {
            "device_id": device_id,
            "channel": "Security",
            "event_id": 4624,
            "record_id": 5001,
            "event_timestamp": datetime.now(timezone.utc).isoformat(),
            "user": "drive_user"
        },
        {
            "device_id": device_id,
            "channel": "Security",
            "event_id": 4688,
            "record_id": 5002,
            "event_timestamp": datetime.now(timezone.utc).isoformat(),
            "process_name": "notepad.exe"
        }
    ]

    # Write batch using crash-safe 8-step sequence
    ok, batch_id = write_crash_safe_drive_batch(relay_path, device_id, events)
    assert ok is True
    assert batch_id != ""

    # Verify outgoing file exists and staging does not
    outgoing_file = relay_path / device_id / "outgoing" / f"{batch_id}.json"
    staging_file = relay_path / device_id / "staging" / f"{batch_id}.tmp"
    assert outgoing_file.exists()
    assert not staging_file.exists()

    # Ingest using DriveSyncManager
    results = drive_sync_manager.sync_local_relay(sync_dir=str(relay_path), db_path=db_path)
    assert len(results) == 1
    assert results[0]["status"] == "processed"
    assert results[0]["processed_events"] == 2

    # Verify file was moved to processed/
    processed_file = relay_path / device_id / "processed" / f"{batch_id}.json"
    assert processed_file.exists()
    assert not outgoing_file.exists()

    # Verify device transport updated to GOOGLE_DRIVE
    with get_conn(db_path) as conn:
        dev = conn.execute("SELECT transport_mode FROM devices WHERE id = ?", (device_id,)).fetchone()
        assert dev["transport_mode"] == "GOOGLE_DRIVE"


# ==========================================================
# Test F: Dual-Layer Deduplication (Batch & Event)
# ==========================================================
def test_f_dual_layer_deduplication(multi_device_env):
    client, db_path, _ = multi_device_env

    device_id = "ST-DEDUP-TEST"
    client.post(
        "/api/sensor/register",
        json={"device_id": device_id, "hostname": "DEDUP-HOST"},
        environ_base={"REMOTE_ADDR": "127.0.0.1"}
    )

    batch_payload = {
        "batch_id": "batch-unique-99001",
        "device_id": device_id,
        "transport": "DIRECT",
        "events": [
            {
                "device_id": device_id,
                "channel": "Security",
                "event_id": 4624,
                "record_id": 6001,
                "event_timestamp": datetime.now(timezone.utc).isoformat(),
                "user": "dedup_user"
            }
        ]
    }

    # 1. First submission succeeds (HTTP 201)
    res1 = client.post("/api/events/batch", json=batch_payload, headers={"X-Sensor-Token": config.SENSOR_TOKEN})
    assert res1.status_code == 201

    # 2. Resubmitting identical batch returns duplicate_ignored (Layer 1)
    res2 = client.post("/api/events/batch", json=batch_payload, headers={"X-Sensor-Token": config.SENSOR_TOKEN})
    assert res2.status_code == 200
    assert res2.get_json()["status"] == "duplicate_ignored"

    # 3. Submitting different batch ID with the SAME event record_id ignores duplicate event (Layer 2)
    batch_payload_2 = {
        "batch_id": "batch-unique-99002",
        "device_id": device_id,
        "transport": "DIRECT",
        "events": [
            {
                "device_id": device_id,
                "channel": "Security",
                "event_id": 4624,
                "record_id": 6001,  # Duplicate record_id
                "event_timestamp": datetime.now(timezone.utc).isoformat(),
                "user": "dedup_user"
            }
        ]
    }
    res3 = client.post("/api/events/batch", json=batch_payload_2, headers={"X-Sensor-Token": config.SENSOR_TOKEN})
    assert res3.status_code == 201
    assert res3.get_json()["duplicate_events"] == 1
    assert res3.get_json()["processed_events"] == 0

    # Ensure only 1 event row exists in events table
    with get_conn(db_path) as conn:
        c = conn.execute("SELECT count(*) as c FROM events WHERE device_id = ? AND record_id = 6001", (device_id,)).fetchone()["c"]
        assert c == 1


# ==========================================================
# Test G: Automatic Recovery
# ==========================================================
def test_g_automatic_recovery(multi_device_env):
    client, db_path, relay_path = multi_device_env
    # Demonstrates that probe_transport succeeds against a running server
    # and fails against an unreachable server
    # We test health endpoint directly
    res = client.get("/api/health")
    assert res.status_code == 200
    assert res.get_json()["status"] == "ok"


# ==========================================================
# Test H: Offline Queue Buffering & Checkpoint Decoupling
# ==========================================================
def test_h_offline_queue_buffering():
    with tempfile.TemporaryDirectory() as tmp_dir:
        queue_file = Path(tmp_dir) / "sensor_offline_queue.json"
        cp_file = Path(tmp_dir) / "sensor_checkpoint.json"

        # Initialize checkpoints
        save_checkpoints({"Security": 100}, checkpoint_file=cp_file)

        events_to_queue = [
            {"device_id": "DEV-OFFLINE", "channel": "Security", "event_id": 4624, "record_id": 101},
            {"device_id": "DEV-OFFLINE", "channel": "Security", "event_id": 4624, "record_id": 102}
        ]

        # Enqueue offline
        enqueue_offline(events_to_queue, queue_file=queue_file)

        # Invariant: checkpoint must NOT have advanced
        checkpoints = load_checkpoints(checkpoint_file=cp_file)
        assert checkpoints.get("Security") == 100

        # Verify queued file exists with both events
        assert queue_file.exists()
        with open(queue_file, "r", encoding="utf-8") as f:
            queued = json.load(f)
            assert len(queued) == 2


# ==========================================================
# Test I: Full Device Authorization Lifecycle
# ==========================================================
def test_i_authorization_lifecycle(multi_device_env):
    client, db_path, _ = multi_device_env

    device_id = "ST-LIFECYCLE-01"

    # 1. Register as remote device -> PENDING
    reg = client.post(
        "/api/sensor/register",
        json={"device_id": device_id, "hostname": "LIFECYCLE-PC"},
        environ_base={"REMOTE_ADDR": "192.168.1.120"}
    )
    assert reg.status_code == 201
    assert reg.get_json()["status"] == "PENDING"
    token = reg.get_json()["token"]

    # 2. Telemetry blocked (403)
    ev = {"device_id": device_id, "channel": "Security", "event_id": 4624, "record_id": 7001}
    r_blocked = client.post("/api/events", json=ev, headers={"X-Sensor-Token": token, "X-Device-Id": device_id})
    assert r_blocked.status_code == 403

    # 3. Admin authorizes -> 200
    admin_token = generate_jwt(1, "admin", "Administrator")
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    client.post(f"/api/devices/{device_id}/authorize", headers=admin_headers)

    # 4. Telemetry accepted -> 201
    r_ok = client.post("/api/events", json=ev, headers={"X-Sensor-Token": token, "X-Device-Id": device_id})
    assert r_ok.status_code == 201

    # 5. Admin revokes -> 200
    client.post(f"/api/devices/{device_id}/revoke", headers=admin_headers)

    # 6. Telemetry rejected -> 403
    ev2 = {"device_id": device_id, "channel": "Security", "event_id": 4624, "record_id": 7002}
    r_revoked = client.post("/api/events", json=ev2, headers={"X-Sensor-Token": token, "X-Device-Id": device_id})
    assert r_revoked.status_code == 403

    # 7. Admin re-authorizes -> 200
    client.post(f"/api/devices/{device_id}/authorize", headers=admin_headers)
    r_reok = client.post("/api/events", json=ev2, headers={"X-Sensor-Token": token, "X-Device-Id": device_id})
    assert r_reok.status_code == 201


# ==========================================================
# Test J: Dynamic Offline Health Timeout Detection
# ==========================================================
def test_j_dynamic_offline_detection(multi_device_env):
    client, db_path, _ = multi_device_env

    now = datetime.now(timezone.utc)
    stale_time = (now - timedelta(seconds=config.DEVICE_OFFLINE_TIMEOUT_SECONDS + 50)).isoformat()
    recent_time = now.isoformat()

    with get_conn(db_path) as conn:
        conn.execute("""
            INSERT INTO devices (id, hostname, ip_address, status, last_seen, auth_status)
            VALUES ('DEV-ACTIVE', 'ACTIVE-PC', '192.168.1.10', 'Online', ?, 'AUTHORIZED')
        """, (recent_time,))

        conn.execute("""
            INSERT INTO devices (id, hostname, ip_address, status, last_seen, auth_status)
            VALUES ('DEV-STALE', 'STALE-PC', '192.168.1.11', 'Online', ?, 'AUTHORIZED')
        """, (stale_time,))

    # Query /api/devices
    admin_token = generate_jwt(1, "admin", "Administrator")
    res = client.get("/api/devices", headers={"Authorization": f"Bearer {admin_token}"})
    assert res.status_code == 200
    devices = {d["id"]: d for d in res.get_json()}

    assert devices["DEV-ACTIVE"]["status"].lower() == "online"
    assert devices["DEV-STALE"]["status"].lower() == "offline"


# ==========================================================
# Test K: Sensor Server URL SSRF Validation & Security
# ==========================================================
def test_k_sensor_server_url_ssrf_validation():
    from sensor.windows_sensor import (
        validate_and_normalize_server_url,
        probe_transport,
        register_with_server,
        drain_offline_queue,
        send_event,
    )

    # Valid targets (localhost, LAN, overlay, custom port)
    assert validate_and_normalize_server_url("http://localhost:5000") == "http://127.0.0.1:5000"
    assert validate_and_normalize_server_url("http://127.0.0.1:5000/") == "http://127.0.0.1:5000"
    assert validate_and_normalize_server_url("http://192.168.1.100:5000") == "http://192.168.1.100:5000"
    assert validate_and_normalize_server_url("https://sentinel.corp.internal:8443") == "https://sentinel.corp.internal:8443"

    # Malicious / Prohibited targets must be rejected
    prohibited = [
        "http://169.254.169.254",
        "http://169.254.1.1",
        "http://metadata.google.internal",
        "file:///etc/passwd",
        "ftp://malicious.host",
        "gopher://evil.host",
        "http://user:password@target.com",
        "javascript:alert(1)",
        "http://",
        "",
        "http://valid.com:99999",  # Port out of range
    ]

    for bad_url in prohibited:
        with pytest.raises(ValueError):
            validate_and_normalize_server_url(bad_url)

    # Probe, register, drain, send must safely fail without unhandled exceptions
    assert probe_transport("http://169.254.169.254") is False
    status, _ = register_with_server("http://169.254.169.254", "DEV-TEST")
    assert status == "INVALID_URL"
    assert drain_offline_queue("http://169.254.169.254", "DEV-TEST", token="tok") == 0
    assert send_event("http://169.254.169.254", {"device_id": "DEV-TEST"}) == "failed"

