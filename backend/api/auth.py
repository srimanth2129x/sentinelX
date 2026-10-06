"""
Authentication & Authorization Module
=====================================
Provides JWT token generation, role-based route protection, and device-specific
sensor token validation for the SentinelTwin platform.
"""
import hmac
import hashlib
import logging
import jwt
from functools import wraps
from datetime import datetime, timezone, timedelta
from flask import request, jsonify, current_app
from backend.config import config
from backend.database.db import get_conn

logger = logging.getLogger(__name__)


def generate_jwt(user_id: int, username: str, role: str) -> str:
    """Generates an HMAC-SHA256 signed JWT for authenticated console users."""
    payload = {
        "user_id": user_id,
        "username": username,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(hours=config.JWT_EXPIRATION_HOURS)
    }
    return jwt.encode(payload, config.SECRET_KEY, algorithm="HS256")


def require_auth(allowed_roles=None):
    """
    Decorator requiring an authenticated JWT Bearer token.
    Validates token signature and checks role against `allowed_roles`.
    """
    def decorator(f):
        @wraps(f)
        def wrapper(*args, **kwargs):
            if request.method == "OPTIONS":
                return f(*args, **kwargs)

            auth_header = request.headers.get("Authorization")
            token = None
            if auth_header and auth_header.startswith("Bearer "):
                token = auth_header.split(" ", 1)[1].strip()
            elif request.args.get("token"):
                token = request.args.get("token").strip()

            if not token:
                return jsonify({"error": "Unauthorized: Missing or malformed Authorization header"}), 401
            try:
                payload = jwt.decode(token, config.SECRET_KEY, algorithms=["HS256"])
                request.current_user = payload
            except jwt.ExpiredSignatureError:
                return jsonify({"error": "Unauthorized: Authentication token has expired"}), 401
            except jwt.InvalidTokenError:
                return jsonify({"error": "Unauthorized: Invalid authentication token"}), 401

            if allowed_roles:
                user_role = payload.get("role")
                if user_role not in allowed_roles:
                    return jsonify({"error": f"Forbidden: Insufficient privileges. Required role in {allowed_roles}"}), 403

            return f(*args, **kwargs)
        return wrapper
    return decorator


def require_sensor_or_admin():
    """
    Decorator requiring valid telemetry authentication:
    1. Administrator JWT Bearer token, OR
    2. Valid device-specific sensor token matching the registered device's SHA-256 hash
       (or master server sensor token).
    Enforces device status (REVOKED / PENDING rejected with 403) and ensures a sensor token
    cannot impersonate a different device.
    """
    def decorator(f):
        @wraps(f)
        def wrapper(*args, **kwargs):
            if request.method == "OPTIONS":
                return f(*args, **kwargs)

            # 1. Check JWT Bearer token (Admin / SOC Operator bypass)
            auth_header = request.headers.get("Authorization")
            if auth_header and auth_header.startswith("Bearer "):
                token = auth_header.split(" ", 1)[1].strip()
                try:
                    payload = jwt.decode(token, config.SECRET_KEY, algorithms=["HS256"])
                    if payload.get("role") in ("Administrator", "Sensor"):
                        request.current_user = payload
                        return f(*args, **kwargs)
                    else:
                        return jsonify({"error": "Forbidden: Insufficient privileges"}), 403
                except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
                    return jsonify({"error": "Unauthorized: Invalid or expired authentication token"}), 401

            # 2. Check Sensor Token & Device ID
            sensor_token = request.headers.get("X-Sensor-Token", "").strip()
            device_id = request.headers.get("X-Device-Id", "").strip()

            if not device_id and request.is_json:
                data = request.get_json(silent=True) or {}
                if isinstance(data, dict):
                    device_id = str(data.get("device_id", "")).strip()

            if not sensor_token:
                return jsonify({"error": "Unauthorized: Valid Sensor Token or Admin JWT required"}), 401

            target_db = None
            try:
                target_db = current_app.config.get("DB_PATH", None)
            except Exception:
                pass

            if device_id:
                try:
                    with get_conn(target_db) as conn:
                        row = conn.execute(
                            "SELECT id, auth_status, sensor_token_hash FROM devices WHERE id = ?",
                            (device_id,)
                        ).fetchone()
                        if row:
                            auth_status = str(row["auth_status"] or "AUTHORIZED").upper()
                            if auth_status == "REVOKED":
                                return jsonify({"error": "Forbidden: Device telemetry access is REVOKED"}), 403
                            if auth_status == "PENDING":
                                return jsonify({"error": "Forbidden: Device registration is PENDING approval"}), 403

                            stored_hash = str(row["sensor_token_hash"] or "").strip()
                            if stored_hash:
                                incoming_hash = hashlib.sha256(sensor_token.encode("utf-8")).hexdigest()
                                if hmac.compare_digest(incoming_hash, stored_hash) or (
                                    config.SENSOR_TOKEN and hmac.compare_digest(sensor_token, config.SENSOR_TOKEN)
                                ):
                                    request.current_user = {"role": "Sensor", "username": device_id, "device_id": device_id}
                                    return f(*args, **kwargs)
                                else:
                                    # Mismatched token for this device: Reject immediately!
                                    return jsonify({"error": "Unauthorized: Invalid sensor token for this device"}), 401

                            # If device has no stored hash, check against universal server SENSOR_TOKEN
                            if config.SENSOR_TOKEN and hmac.compare_digest(sensor_token, config.SENSOR_TOKEN):
                                request.current_user = {"role": "Sensor", "username": device_id, "device_id": device_id}
                                return f(*args, **kwargs)
                            return jsonify({"error": "Unauthorized: Invalid sensor token"}), 401
                except Exception as e:
                    logger.error(f"Sensor authentication error: {e}")

            # Universal Sensor Token fallback (when device is not yet registered in table)
            if config.SENSOR_TOKEN and hmac.compare_digest(sensor_token, config.SENSOR_TOKEN):
                request.current_user = {"role": "Sensor", "username": device_id or "telemetry_sensor"}
                return f(*args, **kwargs)

            return jsonify({"error": "Unauthorized: Valid Sensor Token or Admin JWT required"}), 401
        return wrapper
    return decorator