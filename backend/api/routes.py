"""
REST API Blueprint for SentinelTwin Security Platform
Provides network discovery, device inventory, alerts, incidents,
CyberDNA behavioral analytics, Digital Twin topology, attack propagation, and event ingestion.
Enforces role-based access control (RBAC) and device sensor authentication.
"""
import os
import json
import logging
import socket
import time
import traceback
import psutil
from datetime import datetime, timezone
from flask import Blueprint, request, jsonify, current_app, Response
from werkzeug.security import check_password_hash

from backend.config import config
from backend.database.db import get_conn
from backend.api.auth import generate_jwt, require_auth, require_sensor_or_admin
from backend.services.network_discovery.manager import discovery_manager
from backend.services.cyberdna.engine import cyberdna_engine
from backend.services.risk.engine import risk_engine
from backend.services.risk.scorer import calculate_risk_summary, get_device_risk_list
from backend.services.digital_twin.service import (
    get_topology_graph,
    analyze_potential_propagation,
    run_propagation_simulation
)
from backend.services.event_processing.processor import (
    ingest_event as process_ingest_event,
    get_events as get_pipeline_events
)
from backend.services.mitre_mapping import MitreMapper
from backend.services.evidence_graph import EvidenceGraphEngine

logger = logging.getLogger(__name__)

api_bp = Blueprint("api", __name__)


def _get_target_db():
    return current_app.config.get("DB_PATH", None)


# ==========================================================
# 1. AUTHENTICATION & SESSION MANAGEMENT
# ==========================================================

@api_bp.route("/auth/login", methods=["POST", "OPTIONS"])
def login():
    """Authenticates console users and returns signed JWT with RBAC role."""
    if request.method == "OPTIONS":
        return jsonify({"status": "ok"}), 200

    data = request.get_json(silent=True) or {}
    username = data.get("username", "").strip()
    password = data.get("password", "").strip()

    if not username or not password:
        return jsonify({"error": "Username and password are required."}), 400

    with get_conn(_get_target_db()) as conn:
        cur = conn.cursor()
        cur.execute("SELECT id, username, password_hash, role FROM users WHERE username = ?", (username,))
        user = cur.fetchone()

        if user and check_password_hash(user["password_hash"], password):
            token = generate_jwt(user["id"], user["username"], user["role"])
            return jsonify({
                "token": token,
                "role": user["role"],
                "username": user["username"]
            }), 200

    return jsonify({"error": "Invalid username or password."}), 401


# ==========================================================
# 2. SYSTEM STATUS & ADAPTER INTERFACES
# ==========================================================

@api_bp.route("/health", methods=["GET"])
def health_check():
    """Ultra-lightweight public connectivity probe for sensors."""
    return jsonify({
        "status": "ok",
        "service": "sentineltwin",
        "timestamp": datetime.now(timezone.utc).isoformat()
    }), 200


@api_bp.route("/system/status", methods=["GET"])
def get_system_status():
    """Returns general platform health and CPU/memory statistics."""
    try:
        cpu_usage = psutil.cpu_percent(interval=0.1)
        mem = psutil.virtual_memory()
        return jsonify({
            "status": "online",
            "service": "SentinelTwin Backend",
            "cpu_usage_percent": cpu_usage,
            "memory_usage_percent": mem.percent,
            "memory_free_gb": round(mem.available / (1024 ** 3), 2),
            "sensor_connected": True,
            "is_monitoring": discovery_manager.is_monitoring,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }), 200
    except Exception as e:
        return jsonify({"status": "online", "error": str(e), "is_monitoring": False}), 200


@api_bp.route("/network/interfaces", methods=["GET"])
@require_auth(allowed_roles=["Administrator", "Viewer"])
def get_network_interfaces():
    """Returns active network adapters with IP, subnet mask, and host counts."""
    interfaces = []
    seen = set()
    try:
        addrs = psutil.net_if_addrs()
        for iface_name, addr_list in addrs.items():
            for addr in addr_list:
                if addr.family == socket.AF_INET:
                    if iface_name not in seen:
                        seen.add(iface_name)
                        interfaces.append({
                            "name": iface_name,
                            "ip": addr.address,
                            "netmask": addr.netmask or "255.255.255.0",
                            "family": "AF_INET"
                        })

        def _iface_priority(item):
            ip = item.get("ip", "")
            name = item.get("name", "").lower()
            if ip.startswith("127."):
                return 99
            if ip.startswith("169.254."):
                return 50
            if "wi-fi" in name or "wireless" in name or "wlan" in name:
                return 1
            if "eth" in name or "en" in name:
                return 2
            return 10

        interfaces.sort(key=_iface_priority)
    except Exception:
        interfaces = [{"name": "Ethernet0", "ip": "192.168.1.100", "netmask": "255.255.255.0", "family": "AF_INET"}]

    return jsonify(interfaces), 200


# ==========================================================
# 3. NETWORK DISCOVERY, MONITORING & DEVICE INVENTORY
# ==========================================================

def _upsert_single_device(conn, d: dict, now: str) -> dict:
    """Inserts or updates a single discovered device in SQLite."""
    ip_addr = str(d.get("ip_address", "")).strip()
    if not ip_addr:
        return None
    dev_id = str(d.get("id") or f"dev-{ip_addr.replace('.', '-')}")
    cur = conn.cursor()
    cur.execute("SELECT id FROM devices WHERE ip_address = ? OR id = ?", (ip_addr, dev_id))
    existing = cur.fetchone()
    if existing:
        cur.execute("""
            UPDATE devices SET
                mac_address = ?,
                hostname = ?,
                vendor = ?,
                device_type = ?,
                os = ?,
                last_seen = ?,
                status = 'Online'
            WHERE id = ?
        """, (
            d.get("mac_address", "00:00:00:00:00:00"),
            d.get("hostname", "Discovered Host"),
            d.get("vendor", "Connected Endpoint"),
            d.get("device_type", "Workstation"),
            d.get("os", "Generic OS"),
            now,
            existing["id"]
        ))
        target_id = existing["id"]
    else:
        cur.execute("""
            INSERT INTO devices (
                id, ip_address, mac_address, hostname, vendor,
                device_type, os, status, first_seen, last_seen, criticality
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 'Online', ?, ?, ?)
        """, (
            dev_id, ip_addr, d.get("mac_address", "00:00:00:00:00:00"),
            d.get("hostname", "Discovered Host"), d.get("vendor", "Connected Endpoint"),
            d.get("device_type", "Workstation"), d.get("os", "Generic OS"),
            now, now, int(d.get("criticality", 1))
        ))
        target_id = dev_id

    return {
        "id": target_id,
        "ip_address": ip_addr,
        "mac_address": d.get("mac_address", "00:00:00:00:00:00"),
        "hostname": d.get("hostname", "Discovered Host"),
        "vendor": d.get("vendor", "Connected Endpoint"),
        "device_type": d.get("device_type", "Workstation"),
        "os": d.get("os", "Generic OS"),
        "status": "Online",
        "first_seen": now,
        "last_seen": now,
        "criticality": int(d.get("criticality", 1))
    }


@api_bp.route("/network/discover", methods=["POST", "OPTIONS"])
@require_auth(allowed_roles=["Administrator"])
def trigger_network_discover():
    """Admin-only network discovery sweep using progressive ARP and ICMP probes."""
    if request.method == "OPTIONS":
        return jsonify({"status": "ok"}), 200

    data = request.get_json(silent=True) or {}
    interface_ip = data.get("interface_ip")
    subnet = data.get("subnet")

    try:
        now = datetime.now(timezone.utc).isoformat()
        db_path = _get_target_db()
        discovered_count = 0

        with get_conn(db_path) as conn:
            for d in discovery_manager.scan_network_stream(interface_ip=interface_ip, subnet=subnet):
                _upsert_single_device(conn, d, now)
                discovered_count += 1
            conn.commit()

            cur = conn.cursor()
            cur.execute("SELECT * FROM devices ORDER BY last_seen DESC")
            all_devices = []
            for r in cur.fetchall():
                d_item = dict(r)
                d_item.pop("sensor_token_hash", None)
                d_item.pop("sensor_token", None)
                if d_item.get("hostname") and str(d_item["hostname"]).lower().startswith("node-"):
                    d_item["hostname"] = "Workstation-" + d_item["hostname"][5:]
                all_devices.append(d_item)

        return jsonify({"discovered": discovered_count, "devices": all_devices}), 200
    except Exception as e:
        logger.error(f"Network discovery error: {e}")
        return jsonify({"error": str(e), "devices": []}), 500


@api_bp.route("/network/discover/stream", methods=["GET"])
@require_auth(allowed_roles=["Administrator"])
def stream_network_discover():
    """
    Real-time SSE stream yielding discovered devices one-by-one as soon as detected.
    Each device is saved to SQLite immediately and sent across the wire.
    """
    interface_ip = request.args.get("interface_ip")
    subnet = request.args.get("subnet")
    db_path = _get_target_db()

    def generate():
        now = datetime.now(timezone.utc).isoformat()
        count = 0
        try:
            with get_conn(db_path) as conn:
                for dev in discovery_manager.scan_network_stream(interface_ip=interface_ip, subnet=subnet):
                    saved_dev = _upsert_single_device(conn, dev, now)
                    conn.commit()
                    count += 1
                    payload = json.dumps({
                        "type": "device",
                        "device": saved_dev or dev,
                        "count": count
                    })
                    yield f"data: {payload}\n\n"

            complete_payload = json.dumps({"type": "complete", "total": count})
            yield f"data: {complete_payload}\n\n"
        except Exception as e:
            logger.error(f"Streaming network discovery error: {e}")
            err_payload = json.dumps({"type": "error", "error": str(e)})
            yield f"data: {err_payload}\n\n"

    return Response(
        generate(),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive"
        }
    )


@api_bp.route("/network/monitoring/start", methods=["POST", "OPTIONS"])
@require_auth(allowed_roles=["Administrator"])
def start_network_monitoring():
    """Starts background periodic network monitoring (Administrator required)."""
    if request.method == "OPTIONS":
        return jsonify({"status": "ok"}), 200

    data = request.get_json(silent=True) or {}
    iface = data.get("interface") or data.get("interface_name")
    if iface is not None and not isinstance(iface, str):
        return jsonify({"error": "Field 'interface' must be a valid string."}), 400

    raw_interval = data.get("interval", 30)
    try:
        interval_val = int(raw_interval)
        if not (5 <= interval_val <= 3600):
            raise ValueError()
    except (ValueError, TypeError):
        return jsonify({"error": "Field 'interval' must be an integer between 5 and 3600 seconds."}), 400

    result = discovery_manager.start_monitoring(interface=iface, interval=interval_val)
    return jsonify(result), 200


@api_bp.route("/network/monitoring/stop", methods=["POST", "OPTIONS"])
@require_auth(allowed_roles=["Administrator"])
def stop_network_monitoring():
    """Stops background network monitoring (Administrator required)."""
    if request.method == "OPTIONS":
        return jsonify({"status": "ok"}), 200

    result = discovery_manager.stop_monitoring()
    return jsonify(result), 200


@api_bp.route("/network/monitoring/status", methods=["GET"])
@require_auth(allowed_roles=["Administrator", "Viewer"])
def get_network_monitoring_status():
    """Returns live network monitoring operational status."""
    return jsonify({
        "is_monitoring": discovery_manager.is_monitoring,
        "interface": getattr(discovery_manager, "monitoring_interface", None),
        "interval": getattr(discovery_manager, "monitoring_interval", 30)
    }), 200


@api_bp.route("/devices", methods=["GET"])
@api_bp.route("/network/devices", methods=["GET"])
@require_auth(allowed_roles=["Administrator", "Viewer"])
def get_devices():
    """Returns all discovered network devices with dynamic transport and health computation."""
    try:
        now_dt = datetime.now(timezone.utc)
        timeout_seconds = getattr(config, "DEVICE_OFFLINE_TIMEOUT_SECONDS", 300)
        with get_conn(_get_target_db()) as conn:
            cur = conn.cursor()
            cur.execute("SELECT * FROM devices ORDER BY last_seen DESC")
            rows = []
            for r in cur.fetchall():
                d = dict(r)
                # Never expose security tokens or token hashes to frontend
                d.pop("sensor_token_hash", None)
                d.pop("sensor_token", None)

                if d.get("hostname") and str(d["hostname"]).lower().startswith("node-"):
                    d["hostname"] = "Workstation-" + d["hostname"][5:]

                last_seen_str = d.get("last_seen")
                is_offline = False
                if last_seen_str:
                    try:
                        dt = datetime.fromisoformat(last_seen_str.replace("Z", "+00:00"))
                        if dt.tzinfo is None:
                            dt = dt.replace(tzinfo=timezone.utc)
                        if (now_dt - dt).total_seconds() > timeout_seconds:
                            is_offline = True
                    except Exception:
                        pass
                else:
                    is_offline = True

                if is_offline:
                    d["status"] = "Offline"
                    d["transport_mode"] = "OFFLINE"
                else:
                    d["status"] = d.get("status") or "Online"
                    d["transport_mode"] = d.get("transport_mode") or "DIRECT"

                d["auth_status"] = str(d.get("auth_status") or "AUTHORIZED").upper()
                rows.append(d)
        return jsonify(rows), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@api_bp.route("/sensor/register", methods=["POST", "OPTIONS"])
def register_sensor():
    """
    Lightweight sensor registration and authorization check.
    Server strictly checks connection layer (request.remote_addr).
    New remote devices ALWAYS start in PENDING state until administrator approves.
    Stores only SHA-256 hash of per-device token server-side.
    """
    if request.method == "OPTIONS":
        return jsonify({"status": "ok"}), 200

    data = request.get_json(silent=True) or {}
    device_id = str(data.get("device_id") or "").strip()
    hostname = str(data.get("hostname") or "Unknown Host").strip()
    os_name = str(data.get("os") or "Windows").strip()

    if not device_id:
        return jsonify({"error": "Missing device_id"}), 400

    db_path = _get_target_db()
    now = datetime.now(timezone.utc).isoformat()
    import hashlib
    import secrets

    with get_conn(db_path) as conn:
        row = conn.execute("SELECT id, auth_status, sensor_token_hash FROM devices WHERE id = ?", (device_id,)).fetchone()
        if row:
            auth_status = str(row["auth_status"] or "AUTHORIZED").upper()
            token_hash = row["sensor_token_hash"]
            raw_token = None

            # If existing device lacks token hash, generate and store hash
            if not token_hash:
                raw_token = f"st-tok-{secrets.token_hex(24)}"
                token_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()
                conn.execute("UPDATE devices SET sensor_token_hash = ?, last_seen = ? WHERE id = ?", (token_hash, now, device_id))
            else:
                conn.execute("UPDATE devices SET last_seen = ? WHERE id = ?", (now, device_id))

            resp_data = {
                "status": auth_status,
                "device_id": device_id,
                "registered": True
            }
            if raw_token:
                resp_data["token"] = raw_token

            status_code = 403 if auth_status == "REVOKED" else 200
            return jsonify(resp_data), status_code

        # STRICT SECURITY: Socket connection check ONLY.
        # Never trust X-Forwarded-For, X-Real-IP, or any client-controlled headers for authorization.
        # Never use client-reported data.get("source_ip") to determine local vs remote origin.
        socket_ip = str(request.remote_addr or "").strip()
        is_local = socket_ip in ("127.0.0.1", "::1")
        auth_status = "AUTHORIZED" if is_local else "PENDING"

        # Generate strong random token and compute SHA-256 hash
        raw_token = f"st-tok-{secrets.token_hex(24)}"
        token_hash = hashlib.sha256(raw_token.encode("utf-8")).hexdigest()

        reported_ip = str(data.get("source_ip") or data.get("ip_address") or "").strip()
        if socket_ip and socket_ip not in ("127.0.0.1", "::1", "0.0.0.0"):
            assigned_ip = socket_ip
        elif reported_ip:
            assigned_ip = reported_ip
        else:
            assigned_ip = f"192.168.1.{abs(hash(device_id)) % 250 + 2}"

        # Guarantee uniqueness across device table to satisfy UNIQUE constraint
        existing_with_ip = conn.execute("SELECT id FROM devices WHERE ip_address = ?", (assigned_ip,)).fetchone()
        if existing_with_ip:
            assigned_ip = f"{assigned_ip}_{device_id[-6:]}"

        conn.execute("""
            INSERT INTO devices (
                id, hostname, ip_address, mac_address, vendor, device_type,
                os, status, sensor_connected, first_seen, last_seen,
                risk_score, risk_level, auth_status, transport_mode, sensor_token_hash, last_event_received
            ) VALUES (?, ?, ?, 'Unknown', 'Unknown', 'Workstation', ?, 'Online', 1, ?, ?, 0.0, 'ADAPTIVE', ?, 'DIRECT', ?, ?)
        """, (device_id, hostname, assigned_ip, os_name, now, now, auth_status, token_hash, now))

        return jsonify({
            "status": auth_status,
            "device_id": device_id,
            "token": raw_token,
            "registered": True,
            "message": "Device registered successfully" if auth_status == "AUTHORIZED" else "Device registration pending administrator approval"
        }), 201


@api_bp.route("/devices/<device_id>/authorize", methods=["POST", "OPTIONS"])
@require_auth(allowed_roles=["Administrator"])
def authorize_device(device_id):
    """Authorizes a pending device to ingest telemetry (Administrator required)."""
    if request.method == "OPTIONS":
        return jsonify({"status": "ok"}), 200
    db_path = _get_target_db()
    with get_conn(db_path) as conn:
        row = conn.execute("SELECT id FROM devices WHERE id = ?", (device_id,)).fetchone()
        if not row:
            return jsonify({"error": f"Device {device_id} not found"}), 404
        conn.execute("UPDATE devices SET auth_status = 'AUTHORIZED' WHERE id = ?", (device_id,))
    return jsonify({"status": "AUTHORIZED", "device_id": device_id, "message": "Device authorized"}), 200


@api_bp.route("/devices/<device_id>/revoke", methods=["POST", "OPTIONS"])
@require_auth(allowed_roles=["Administrator"])
def revoke_device(device_id):
    """Revokes a device from ingesting telemetry (Administrator required)."""
    if request.method == "OPTIONS":
        return jsonify({"status": "ok"}), 200
    db_path = _get_target_db()
    with get_conn(db_path) as conn:
        row = conn.execute("SELECT id FROM devices WHERE id = ?", (device_id,)).fetchone()
        if not row:
            return jsonify({"error": f"Device {device_id} not found"}), 404
        conn.execute("UPDATE devices SET auth_status = 'REVOKED' WHERE id = ?", (device_id,))
    return jsonify({"status": "REVOKED", "device_id": device_id, "message": "Device access revoked"}), 200


@api_bp.route("/devices/<device_id>", methods=["GET"])
@require_auth(allowed_roles=["Administrator", "Viewer"])
def get_device_details(device_id):
    """Retrieves an individual device record."""
    try:
        with get_conn(_get_target_db()) as conn:
            cur = conn.cursor()
            cur.execute("SELECT * FROM devices WHERE id = ?", (device_id,))
            row = cur.fetchone()
            if not row:
                return jsonify({"error": "Device not found"}), 404
            d = dict(row)
            d.pop("sensor_token_hash", None)
            d.pop("sensor_token", None)
            if d.get("hostname") and str(d["hostname"]).lower().startswith("node-"):
                d["hostname"] = "Workstation-" + d["hostname"][5:]
            return jsonify(d), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@api_bp.route("/devices/<device_id>", methods=["DELETE"])
@require_auth(allowed_roles=["Administrator"])
def delete_device(device_id):
    """Removes an individual device record (Administrator required)."""
    try:
        with get_conn(_get_target_db()) as conn:
            cur = conn.cursor()
            cur.execute("DELETE FROM devices WHERE id = ?", (device_id,))
            return jsonify({"status": "deleted", "id": device_id}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@api_bp.route("/network/clear", methods=["POST"])
@api_bp.route("/network/devices/clear", methods=["POST"])
@require_auth(allowed_roles=["Administrator"])
def clear_devices():
    """Purges all devices from the database cache (Administrator required)."""
    try:
        with get_conn(_get_target_db()) as conn:
            conn.execute("DELETE FROM devices")
        return jsonify({"status": "cleared"}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ==========================================================
# 4. EVENT INGESTION PIPELINE (CYBERDNA -> CORRELATION -> RISK -> TWIN)
# ==========================================================

@api_bp.route("/events/ingest", methods=["POST", "OPTIONS"])
@api_bp.route("/events", methods=["POST", "OPTIONS"])
@require_sensor_or_admin()
def ingest_event_route():
    """Ingests a telemetry event from a verified endpoint sensor or administrator."""
    if request.method == "OPTIONS":
        return jsonify({"status": "ok"}), 200

    data = request.get_json(silent=True) or {}
    db_path = _get_target_db()

    # Capture transport mode (DIRECT, PRIVATE_NETWORK, GOOGLE_DRIVE)
    transport = str(request.headers.get("X-Transport-Mode") or data.get("transport") or "DIRECT").strip()
    data["transport"] = transport

    device_id = str(request.headers.get("X-Device-Id") or data.get("device_id") or "").strip()
    if device_id:
        with get_conn(db_path) as conn:
            row = conn.execute("SELECT auth_status FROM devices WHERE id = ?", (device_id,)).fetchone()
            if row:
                auth_status = str(row["auth_status"] or "AUTHORIZED").upper()
                if auth_status == "REVOKED":
                    return jsonify({"error": "Forbidden: Device telemetry access is REVOKED"}), 403
                if auth_status == "PENDING":
                    return jsonify({"error": "Forbidden: Device registration is PENDING approval"}), 403

    # Ensure event_timestamp has a valid ISO timestamp
    if not data.get("event_timestamp"):
        data["event_timestamp"] = data.get("timestamp") or datetime.now(timezone.utc).isoformat()

    # Validate required fields if strict ingest called
    if request.path.endswith("/ingest"):
        required = ["event_id", "device_id"]
        for field in required:
            if field not in data or data[field] is None:
                return jsonify({"error": f"Missing required field: {field}"}), 400

    try:
        if "event_id" in data and data["event_id"] is not None:
            int(data["event_id"])
        if "record_id" in data and data["record_id"] is not None:
            int(data["record_id"])
    except (ValueError, TypeError):
        return jsonify({"error": "Fields 'event_id' and 'record_id' must be valid integers."}), 400

    try:
        result = process_ingest_event(data, db_path=db_path)
        if result.get("status") == "duplicate_ignored":
            return jsonify(result), 409
        return jsonify(result), 201
    except PermissionError as pe:
        return jsonify({"error": str(pe)}), 403
    except Exception as e:
        logger.error(f"Event ingestion pipeline failed: {e}")
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@api_bp.route("/events/batch", methods=["POST", "OPTIONS"])
@require_sensor_or_admin()
def ingest_batch_route():
    """
    Duplicate-safe batch event ingestion for Google Drive relay and offline queue draining.
    Employs dual-layer deduplication:
    1. Batch-level idempotency via processed_batches
    2. Event-level deduplication via stable (device_id, channel, record_id)
    """
    if request.method == "OPTIONS":
        return jsonify({"status": "ok"}), 200

    data = request.get_json(silent=True) or {}
    batch_id = str(data.get("batch_id") or "").strip()
    device_id = str(data.get("device_id") or "").strip()
    transport = str(data.get("transport") or request.headers.get("X-Transport-Mode") or "GOOGLE_DRIVE").strip()
    events = data.get("events") or []

    if not batch_id or not device_id:
        return jsonify({"error": "Missing batch_id or device_id"}), 400

    db_path = _get_target_db()
    now = datetime.now(timezone.utc).isoformat()

    with get_conn(db_path) as conn:
        # Check device authorization
        dev = conn.execute("SELECT auth_status FROM devices WHERE id = ?", (device_id,)).fetchone()
        if dev and str(dev["auth_status"]).upper() == "REVOKED":
            return jsonify({"error": "Forbidden: Device telemetry access is REVOKED"}), 403
        if dev and str(dev["auth_status"]).upper() == "PENDING":
            return jsonify({"error": "Forbidden: Device registration is PENDING approval"}), 403

        # 1. Batch-level deduplication check
        cur = conn.cursor()
        cur.execute("SELECT batch_id FROM processed_batches WHERE batch_id = ?", (batch_id,))
        if cur.fetchone():
            return jsonify({
                "status": "duplicate_ignored",
                "batch_id": batch_id,
                "message": "Batch already processed"
            }), 200

    # Sort events chronologically (event_timestamp, record_id) to preserve original event order
    def _event_sort_key(ev):
        ts = ev.get("event_timestamp") or ev.get("timestamp") or ""
        rec = ev.get("record_id") or 0
        return (ts, rec)

    sorted_events = sorted(events, key=_event_sort_key)
    processed_count = 0
    duplicate_count = 0

    for ev in sorted_events:
        if not isinstance(ev, dict):
            continue
        ev["device_id"] = device_id
        ev["transport"] = transport
        try:
            res = process_ingest_event(ev, db_path=db_path)
            if res.get("status") == "duplicate_ignored":
                duplicate_count += 1
            else:
                processed_count += 1
        except Exception as e:
            logger.warning(f"Failed to ingest event in batch {batch_id}: {e}")

    # Mark batch as processed
    with get_conn(db_path) as conn:
        conn.execute("""
            INSERT INTO processed_batches (batch_id, device_id, processed_at, event_count, transport)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(batch_id) DO NOTHING
        """, (batch_id, device_id, now, processed_count, transport))
        conn.execute("""
            UPDATE devices
            SET last_seen = ?,
                transport_mode = ?,
                last_event_received = ?
            WHERE id = ?
        """, (now, transport, now, device_id))

    return jsonify({
        "status": "processed",
        "batch_id": batch_id,
        "processed_events": processed_count,
        "duplicate_events": duplicate_count,
        "total_events": len(events)
    }), 201


@api_bp.route("/events", methods=["GET"])
@require_auth(allowed_roles=["Administrator", "Viewer"])
def get_events():
    """Retrieves historical normalized telemetry logs."""
    limit = min(int(request.args.get("limit", 50)), 200)
    device_id = request.args.get("device_id")
    event_type = request.args.get("event_type")
    rows = get_pipeline_events(limit=limit, device_id=device_id, event_type=event_type, db_path=_get_target_db())
    return jsonify(rows), 200


@api_bp.route("/events/clear", methods=["POST", "OPTIONS"])
@require_auth(allowed_roles=["Administrator"])
def clear_events():
    """Purges all ingested telemetry event logs and processed batch tracking (Administrator required)."""
    if request.method == "OPTIONS":
        return jsonify({"status": "ok"}), 200
    try:
        with get_conn(_get_target_db()) as conn:
            cur = conn.cursor()
            cur.execute("SELECT COUNT(*) as cnt FROM events")
            cnt = cur.fetchone()["cnt"]
            cur.execute("DELETE FROM events")
            cur.execute("DELETE FROM processed_batches")
        return jsonify({"status": "cleared", "deleted_count": cnt}), 200
    except Exception as e:
        logger.error(f"Failed to clear events: {e}")
        return jsonify({"error": str(e)}), 500


@api_bp.route("/drive/sync", methods=["POST", "OPTIONS"])
@require_auth(allowed_roles=["Administrator"])
def trigger_drive_sync():
    """Triggers synchronization of Google Drive fallback relay batches (Administrator required)."""
    if request.method == "OPTIONS":
        return jsonify({"status": "ok"}), 200
    try:
        from backend.services.drive_sync import drive_sync_manager
        results = drive_sync_manager.sync_local_relay(db_path=_get_target_db())
        return jsonify({"status": "synced", "batches_processed": len(results), "results": results}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ==========================================================
# 5. CYBERDNA BEHAVIORAL PROFILES & SIMULATION
# ==========================================================

@api_bp.route("/cyberdna/profile/<entity_id>", methods=["GET"])
@require_auth(allowed_roles=["Administrator", "Viewer"])
def get_cyberdna_profile(entity_id):
    """Returns the CyberDNA behavioral baseline profile and peer comparisons."""
    profile = cyberdna_engine.get_profile(entity_id, db_path=_get_target_db())
    return jsonify(profile), 200


@api_bp.route("/cyberdna/users", methods=["GET"])
@api_bp.route("/cyberdna/entities", methods=["GET"])
@require_auth(allowed_roles=["Administrator", "Viewer"])
def get_cyberdna_entities():
    """Returns all entities with behavioral CyberDNA baselines."""
    entities = cyberdna_engine.get_all_entities(db_path=_get_target_db())
    return jsonify(entities), 200


@api_bp.route("/cyberdna/simulate", methods=["POST", "OPTIONS"])
@require_auth(allowed_roles=["Administrator"])
def simulate_cyberdna():
    """Direct testing and evaluation of CyberDNA statistical anomalies (Administrator required)."""
    if request.method == "OPTIONS":
        return jsonify({"status": "ok"}), 200

    data = request.get_json(silent=True) or {}
    metric_key = data.get("metric_key", "evt_4688_freq")
    entity_id = data.get("device_id") or data.get("entity_id", "dev-corp-workstation-01")
    observation = float(data.get("observation", 1.0))
    gate = bool(data.get("gate_anomalies", True))

    res = cyberdna_engine.evaluate_and_update(
        metric_key=metric_key,
        entity_id=entity_id,
        observation=observation,
        gate_anomalies=gate,
        db_path=_get_target_db()
    )
    return jsonify(res), 200


# ==========================================================
# 6. DIGITAL TWIN TOPOLOGY & ATTACK PROPAGATION
# ==========================================================

@api_bp.route("/network/topology", methods=["GET"])
@api_bp.route("/cyber_twin/topology", methods=["GET"])
@require_auth(allowed_roles=["Administrator", "Viewer"])
def get_topology():
    """Returns the NetworkX Digital Twin topology graph (nodes and edges)."""
    return jsonify(get_topology_graph(_get_target_db())), 200


@api_bp.route("/simulation/run", methods=["POST", "OPTIONS"])
@api_bp.route("/cyber_twin/propagate", methods=["POST", "OPTIONS"])
@require_auth(allowed_roles=["Administrator"])
def simulate_propagation():
    """Executes multi-hop attack propagation simulation from a compromised entity (Administrator required)."""
    if request.method == "OPTIONS":
        return jsonify({"status": "ok"}), 200

    data = request.get_json(silent=True) or {}
    source_id = data.get("source_node_id") or data.get("source_device") or data.get("source_device_id")
    risk = data.get("source_risk", 70)

    if not source_id or not isinstance(source_id, str):
        return jsonify({"error": "Valid 'source_node_id' or 'source_device' string is required."}), 400

    try:
        risk_val = int(risk)
        if not (0 <= risk_val <= 100):
            raise ValueError()
    except (ValueError, TypeError):
        return jsonify({"error": "Field 'source_risk' must be an integer between 0 and 100."}), 400

    db_path = _get_target_db()
    sim_result = run_propagation_simulation(source_device_id=source_id, source_risk=risk_val, db_path=db_path)
    sim_result["potential_propagation_paths"] = sim_result.get("opportunities", [])
    return jsonify(sim_result), 200


@api_bp.route("/simulation/results", methods=["GET"])
@require_auth(allowed_roles=["Administrator", "Viewer"])
def get_simulation_results():
    """Returns past attack propagation simulation results."""
    try:
        with get_conn(_get_target_db()) as conn:
            cur = conn.cursor()
            cur.execute("SELECT * FROM simulations ORDER BY id DESC LIMIT 10")
            rows = [dict(r) for r in cur.fetchall()]
            for r in rows:
                if isinstance(r.get("results_json"), str) and r["results_json"]:
                    try:
                        r["results"] = json.loads(r["results_json"])
                    except Exception:
                        pass
        return jsonify(rows), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ==========================================================
# 7. ALERTS, INCIDENTS & EVIDENCE RETRIEVAL
# ==========================================================

@api_bp.route("/alerts", methods=["GET"])
@api_bp.route("/incidents", methods=["GET"])
@require_auth(allowed_roles=["Administrator", "Viewer"])
def get_alerts_and_incidents():
    """Retrieves recent security alerts and incidents."""
    try:
        with get_conn(_get_target_db()) as conn:
            cur = conn.cursor()
            cur.execute("SELECT * FROM alerts ORDER BY id DESC LIMIT 100")
            rows = [dict(row) for row in cur.fetchall()]
            for r in rows:
                if isinstance(r.get("evidence_graph"), str) and r["evidence_graph"]:
                    try:
                        r["evidence_graph"] = json.loads(r["evidence_graph"])
                    except Exception:
                        pass
        return jsonify(rows), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@api_bp.route("/incidents/<int:incident_id>", methods=["GET"])
@require_auth(allowed_roles=["Administrator", "Viewer"])
def get_single_incident(incident_id):
    """Retrieves a specific incident record."""
    try:
        with get_conn(_get_target_db()) as conn:
            cur = conn.cursor()
            cur.execute("SELECT * FROM alerts WHERE id = ?", (incident_id,))
            row = cur.fetchone()
            if not row:
                return jsonify({"error": "Incident not found"}), 404
            inc = dict(row)
            if isinstance(inc.get("evidence_graph"), str) and inc["evidence_graph"]:
                try:
                    inc["evidence_graph"] = json.loads(inc["evidence_graph"])
                except Exception:
                    pass
            return jsonify(inc), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@api_bp.route("/alerts", methods=["POST"])
@require_auth(allowed_roles=["Administrator"])
def create_manual_alert():
    """Creates a security alert record manually (Administrator required)."""
    try:
        data = request.get_json(silent=True) or {}
        device_id = data.get("device_id", "local-host")
        title = data.get("title", "Security Threat Detected")
        severity = data.get("severity", "HIGH")
        status = data.get("status", "Open")
        description = data.get("description", "")
        created_at = data.get("created_at", datetime.now(timezone.utc).isoformat())
        raw_risk_pts = data.get("risk_points")
        try:
            risk_pts = int(raw_risk_pts) if raw_risk_pts is not None else 50
        except (ValueError, TypeError):
            risk_pts = 50

        with get_conn(_get_target_db()) as conn:
            cur = conn.cursor()
            cur.execute("""
                INSERT INTO alerts (device_id, title, severity, status, description, created_at, timestamp, risk_points)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (device_id, title, severity, status, description, created_at, created_at, risk_pts))
            return jsonify({"status": "created", "id": cur.lastrowid}), 201
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@api_bp.route("/incidents", methods=["PATCH"])
@api_bp.route("/incidents/<int:incident_id>", methods=["PATCH"])
@api_bp.route("/alerts/<int:alert_id>", methods=["PATCH"])
@require_auth(allowed_roles=["Administrator"])
def update_incident_status(incident_id=None, alert_id=None):
    """Updates the status of an incident or alert (Administrator required)."""
    try:
        target_id = incident_id or alert_id
        data = request.get_json(silent=True) or {}
        if not target_id:
            target_id = data.get("id")
        if not target_id:
            return jsonify({"error": "Missing incident or alert ID"}), 400

        new_status = data.get("status", "Resolved")
        with get_conn(_get_target_db()) as conn:
            conn.execute("UPDATE alerts SET status = ? WHERE id = ?", (new_status, target_id))
        return jsonify({"status": "updated", "id": target_id, "new_status": new_status}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@api_bp.route("/alerts/<alert_id>/evidence", methods=["GET"])
@require_auth(allowed_roles=["Administrator", "Viewer"])
def get_alert_evidence(alert_id):
    """Retrieves the deterministic Evidence Graph for an alert."""
    try:
        with get_conn(_get_target_db()) as conn:
            cur = conn.cursor()
            cur.execute("SELECT * FROM alerts WHERE id = ?", (alert_id,))
            row = cur.fetchone()
            if not row:
                return jsonify({"error": "Alert not found"}), 404

            alert = dict(row)
            graph_data = alert.get("evidence_graph")
            if isinstance(graph_data, str) and graph_data:
                try:
                    graph_data = json.loads(graph_data)
                except Exception:
                    graph_data = {}

            return jsonify({
                "alert_id": alert["id"],
                "title": alert.get("title") or alert.get("description"),
                "severity": alert["severity"],
                "mitre": {
                    "id": alert.get("mitre_technique_id"),
                    "name": alert.get("mitre_technique_name"),
                    "tactic": alert.get("mitre_tactic")
                },
                "graph": graph_data
            }), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ==========================================================
# 8. DASHBOARD SUMMARY & RISK POSTURE
# ==========================================================

@api_bp.route("/dashboard/summary", methods=["GET"])
@require_auth(allowed_roles=["Administrator", "Viewer"])
def get_dashboard_summary():
    """Provides high-level dashboard aggregate metrics."""
    with get_conn(_get_target_db()) as conn:
        cur = conn.cursor()

        cur.execute("SELECT COUNT(*) as count FROM devices")
        total_devices = cur.fetchone()["count"]

        cur.execute("SELECT COUNT(*) as count FROM events")
        total_events = cur.fetchone()["count"]

        cur.execute("SELECT COUNT(*) as count FROM alerts WHERE status != 'Resolved'")
        active_alerts = cur.fetchone()["count"]

        cur.execute("SELECT COUNT(*) as count FROM alerts WHERE severity IN ('Critical', 'CRITICAL') AND status != 'Resolved'")
        critical_incidents = cur.fetchone()["count"]

        cur.execute("SELECT * FROM alerts ORDER BY id DESC LIMIT 5")
        recent_alerts = [dict(row) for row in cur.fetchall()]

        cur.execute("SELECT * FROM events ORDER BY id DESC LIMIT 5")
        recent_events = [dict(row) for row in cur.fetchall()]

    return jsonify({
        "total_devices": total_devices,
        "total_events": total_events,
        "active_alerts": active_alerts,
        "critical_incidents": critical_incidents,
        "recent_alerts": recent_alerts,
        "recent_events": recent_events,
        "system_health": "Healthy" if active_alerts < 10 else "Degraded"
    }), 200


@api_bp.route("/risk/summary", methods=["GET"])
@require_auth(allowed_roles=["Administrator", "Viewer"])
def get_risk_summary():
    """Aggregates platform risk metrics."""
    try:
        with get_conn(_get_target_db()) as conn:
            cur = conn.cursor()
            cur.execute("SELECT COUNT(*) as total, AVG(risk_score) as avg_risk FROM events")
            ev_row = cur.fetchone()

            cur.execute("SELECT COUNT(*) as alert_count FROM alerts WHERE status != 'Resolved'")
            al_row = cur.fetchone()

            cur.execute("SELECT COUNT(*) as total_devs FROM devices")
            dev_row = cur.fetchone()

        total_events = ev_row["total"] if ev_row else 0
        avg_score = round(ev_row["avg_risk"] or 0.0, 1) if ev_row else 0.0
        active_alerts = al_row["alert_count"] if al_row else 0
        total_devices = dev_row["total_devs"] if dev_row else 0

        return jsonify({
            "overall_threat_level": "Elevated" if active_alerts > 0 else "Nominal",
            "average_risk_score": avg_score,
            "active_alerts_count": active_alerts,
            "monitored_devices_count": total_devices,
            "total_events_processed": total_events
        }), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@api_bp.route("/risk/devices", methods=["GET"])
@require_auth(allowed_roles=["Administrator", "Viewer"])
def get_device_risk_breakdown():
    """Returns risk assessment breakdown per device."""
    try:
        with get_conn(_get_target_db()) as conn:
            cur = conn.cursor()
            cur.execute("""
                SELECT 
                    d.id, d.hostname, d.ip_address, d.device_type, d.criticality,
                    COALESCE(MAX(e.risk_score), 0) as peak_risk,
                    COALESCE(COUNT(a.id), 0) as alert_count
                FROM devices d
                LEFT JOIN events e ON d.id = e.device_id
                LEFT JOIN alerts a ON d.id = a.device_id
                GROUP BY d.id
                ORDER BY peak_risk DESC
            """)
            rows = [dict(row) for row in cur.fetchall()]
        return jsonify(rows), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500