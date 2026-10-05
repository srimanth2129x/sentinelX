"""
SentinelTwin Windows Sensor (Multi-Device & Multi-Transport)
Collects Windows Event Log and Sysmon events.
Sends normalized telemetry to the central SentinelTwin server across prioritized transports:
  1. Direct HTTP (Localhost / Same LAN)
  2. Private / Overlay Network
  3. Google Drive Asynchronous Relay (Crash-safe atomic staging)
  4. Local Offline Queue (Decoupled checkpointing)

IMPORTANT: This sensor must only be run on machines where you
are explicitly authorized to collect endpoint telemetry.
"""
import os
import sys
import json
import time
import uuid
import socket
import logging
import platform
import hashlib
import requests
from pathlib import Path
from datetime import datetime, timezone
from urllib.parse import urlsplit

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s"
)
logger = logging.getLogger("sentineltwin-sensor")

DEFAULT_SERVER = "http://127.0.0.1:5000"
DEFAULT_INTERVAL = 5  # seconds between event polls
DEFAULT_SENSOR_TOKEN = os.getenv("SENSOR_TOKEN", "").strip()

# Build-time embedded server URL (injected during PyInstaller compilation)
try:
    from sensor.build_config import EMBEDDED_SERVER_URL
except ImportError:
    try:
        from build_config import EMBEDDED_SERVER_URL
    except ImportError:
        EMBEDDED_SERVER_URL = None

def get_runtime_data_dir() -> Path:
    """
    Resolves a safe, writable runtime directory for sensor state files
    (sensor_device.json, sensor_checkpoint.json, sensor_offline_queue.json).
    Guarantees:
    - Never uses PyInstaller temporary extraction directory (sys._MEIPASS).
    - Checks writability of candidate directories.
    - Resolves relative to sys.executable when frozen.
    - Falls back to %LOCALAPPDATA%\\SentinelTwin\\data if executable dir is not writable.
    """
    meipass = getattr(sys, "_MEIPASS", None)
    meipass_str = str(Path(meipass).resolve()).lower() if meipass else None

    def _is_safe(p: Path) -> bool:
        if not p:
            return False
        if meipass_str:
            try:
                resolved = str(p.resolve()).lower()
                if resolved.startswith(meipass_str):
                    return False
            except Exception:
                pass
        return True

    def _test_write(p: Path) -> bool:
        try:
            p.mkdir(parents=True, exist_ok=True)
            test_f = p / ".write_test"
            test_f.write_text("ok", encoding="utf-8")
            test_f.unlink()
            return True
        except Exception:
            return False

    # 1. SENTINEL_DATA_DIR environment variable
    env_dir = os.getenv("SENTINEL_DATA_DIR")
    if env_dir:
        p = Path(env_dir)
        if _is_safe(p) and _test_write(p):
            return p.resolve()

    # 2. Directory beside the executable (frozen) or project root (unfrozen)
    if getattr(sys, "frozen", False):
        base_dir = Path(sys.executable).resolve().parent
    else:
        try:
            base_dir = Path(__file__).resolve().parent.parent
        except Exception:
            base_dir = Path.cwd()

    cand = base_dir / "data"
    if _is_safe(cand) and _test_write(cand):
        return cand.resolve()

    # 3. Current working directory / data
    cwd_cand = Path.cwd() / "data"
    if _is_safe(cwd_cand) and _test_write(cwd_cand):
        return cwd_cand.resolve()

    # 4. %LOCALAPPDATA% / SentinelTwin / data fallback
    local_app_data = os.getenv("LOCALAPPDATA")
    if local_app_data:
        lad_cand = Path(local_app_data) / "SentinelTwin" / "data"
        if _is_safe(lad_cand) and _test_write(lad_cand):
            return lad_cand.resolve()

    # 5. User home fallback
    home_cand = Path.home() / ".sentineltwin" / "data"
    if _is_safe(home_cand) and _test_write(home_cand):
        return home_cand.resolve()

    return Path("data").resolve()


DATA_DIR = get_runtime_data_dir()
CHECKPOINT_FILE = DATA_DIR / "sensor_checkpoint.json"
DEVICE_FILE = DATA_DIR / "sensor_device.json"
OFFLINE_QUEUE_FILE = DATA_DIR / "sensor_offline_queue.json"
LOG_FILE = DATA_DIR / "sensor.log"
DEFAULT_DRIVE_DIR = Path("sentinel_events")

# Initialize persistent file logging
try:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    _fh = logging.FileHandler(str(LOG_FILE), encoding="utf-8")
    _fh.setLevel(logging.INFO)
    _fh.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(message)s"))
    logger.addHandler(_fh)
except Exception:
    pass


def load_sensor_config() -> dict:
    """
    Discovers and loads configuration from sentinel_sensor.json.
    Priority:
    1. Directory containing the executable (if frozen) or script / project root.
    2. Current working directory.
    """
    search_dirs = []
    if getattr(sys, "frozen", False):
        search_dirs.append(Path(sys.executable).resolve().parent)
    else:
        try:
            search_dirs.append(Path(__file__).resolve().parent.parent)
        except Exception:
            pass
        try:
            search_dirs.append(Path(__file__).resolve().parent)
        except Exception:
            pass
    search_dirs.append(Path.cwd())

    for d in search_dirs:
        cfg = d / "sentinel_sensor.json"
        if cfg.is_file():
            try:
                with open(cfg, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    if isinstance(data, dict):
                        logger.info(f"Loaded sensor configuration from {cfg}")
                        return data
            except Exception as e:
                logger.warning(f"Failed to parse configuration file {cfg}: {e}")
    return {}


_MUTEX_HANDLE = None


def acquire_single_instance_lock() -> bool:
    """
    Acquires a single-instance Windows Named Mutex to prevent duplicate sensor instances.
    Returns True if lock acquired, False if another instance is already running.
    """
    global _MUTEX_HANDLE
    if platform.system() != "Windows":
        return True

    try:
        import ctypes
        ERROR_ALREADY_EXISTS = 183
        mutex_name = "Global\\SentinelTwin_Sensor_SingleInstance_Mutex"
        handle = ctypes.windll.kernel32.CreateMutexW(None, False, mutex_name)
        err = ctypes.windll.kernel32.GetLastError()

        # If Global\ failed with access denied (error 5) or invalid handle, fallback to Local namespace
        if not handle or err == 5:
            mutex_name = "SentinelTwin_Sensor_SingleInstance_Mutex"
            handle = ctypes.windll.kernel32.CreateMutexW(None, False, mutex_name)
            err = ctypes.windll.kernel32.GetLastError()

        if err == ERROR_ALREADY_EXISTS:
            if handle:
                ctypes.windll.kernel32.CloseHandle(handle)
            return False

        _MUTEX_HANDLE = handle
        return True
    except Exception as e:
        logger.warning(f"Could not initialize single-instance mutex: {e}")
        return True

WATCHED_EVENT_IDS = {
    # Security log
    4624, 4625, 4634, 4648,
    4688, 4689,
    4698,
    4720, 4722, 4726, 4732,
    # Sysmon
    1, 3, 11, 22,
}

_CACHED_HOSTNAME = None
_CACHED_LOCAL_IP = None


def get_hostname() -> str:
    global _CACHED_HOSTNAME
    if _CACHED_HOSTNAME is None:
        _CACHED_HOSTNAME = socket.gethostname()
    return _CACHED_HOSTNAME


def get_local_ip() -> str:
    global _CACHED_LOCAL_IP
    if _CACHED_LOCAL_IP is None:
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(("8.8.8.8", 80))
            _CACHED_LOCAL_IP = s.getsockname()[0]
            s.close()
        except Exception:
            _CACHED_LOCAL_IP = "127.0.0.1"
    return _CACHED_LOCAL_IP


def validate_and_normalize_server_url(server: str) -> str:
    """
    Centralized validation and normalization for SentinelTwin server targets.
    Defends against Server-Side Request Forgery (SSRF) and malicious schemes.

    Security Policies:
      - Validates string structure and parses using urlsplit.
      - Enforces allowed schemes: 'http' and 'https' only.
      - Disallows embedded credentials in URLs (userinfo).
      - Rejects dangerous cloud metadata endpoints (e.g. 169.254.169.254, metadata.google.internal).
      - Normalizes 'localhost' to '127.0.0.1' for consistent loopback handling.
      - Supports legitimate localhost, LAN (192.168.x.x, 10.x.x.x, etc.), private overlay,
        and configured central servers.
      - Validates port range (1..65535).
      - Returns canonical base URL without trailing slash, or raises ValueError.
    """
    if not server or not isinstance(server, str):
        raise ValueError("Server URL must be a non-empty string.")

    cleaned = server.strip()
    try:
        parsed = urlsplit(cleaned)
    except Exception as e:
        raise ValueError(f"Malformed server URL: {e}") from e

    scheme = (parsed.scheme or "").lower()
    if scheme not in ("http", "https"):
        raise ValueError(f"Prohibited scheme '{scheme}'. Only HTTP and HTTPS are permitted.")

    if not parsed.netloc:
        raise ValueError("Server URL missing valid network location / host.")

    if parsed.username or parsed.password:
        raise ValueError("User credentials are not permitted in server URLs.")

    hostname = (parsed.hostname or "").lower()
    if not hostname:
        raise ValueError("Server URL missing valid hostname.")

    # Block cloud instance metadata services and link-local ranges
    if (
        hostname == "169.254.169.254"
        or hostname.startswith("169.254.")
        or hostname in ("metadata.google.internal", "instance-data", "metadata")
    ):
        raise ValueError(f"Targeting cloud metadata endpoint '{hostname}' is strictly prohibited.")

    # Validate port if specified
    try:
        port = parsed.port
    except ValueError as e:
        raise ValueError(f"Invalid server URL port: {e}") from e

    if port is not None and not (1 <= port <= 65535):
        raise ValueError(f"Port {port} is outside valid TCP range 1-65535.")

    # Normalize localhost to 127.0.0.1
    normalized_host = "127.0.0.1" if hostname == "localhost" else hostname

    netloc = f"{normalized_host}:{port}" if port else normalized_host
    path = parsed.path.rstrip("/")
    return f"{scheme}://{netloc}{path}"


def normalize_server_url(server: str) -> str:
    """
    Normalizes and validates the server URL using centralized SSRF protection policy.
    Maintains backward compatibility while enforcing strict security controls.
    """
    return validate_and_normalize_server_url(server)


def get_or_create_device_id(device_file: Path | None = None) -> tuple[str, str | None]:
    """
    Retrieves or generates a persistent device ID (ST-DEVICE-XXXXXXXX) and stored token.
    Persisted across sensor restarts in data/sensor_device.json.
    """
    target_file = device_file or DEVICE_FILE
    if not target_file.exists():
        # Safe migration check from LocalAppData if migrating deployment locations
        local_app_data = os.getenv("LOCALAPPDATA")
        if local_app_data:
            alt_file = Path(local_app_data) / "SentinelTwin" / "data" / "sensor_device.json"
            if alt_file.exists() and alt_file != target_file:
                try:
                    target_file.parent.mkdir(parents=True, exist_ok=True)
                    import shutil
                    shutil.copy2(alt_file, target_file)
                    logger.info(f"Migrated device credentials from {alt_file} to {target_file}")
                except Exception:
                    pass

    if target_file.exists():
        try:
            with open(target_file, "r", encoding="utf-8") as f:
                data = json.load(f)
                dev_id = data.get("device_id")
                token = data.get("token")
                if dev_id:
                    return dev_id, token
        except Exception as e:
            logger.warning(f"Could not read device file {target_file}: {e}")

    # Generate new device ID based on hostname hash + random entropy
    h = hashlib.sha256(f"{get_hostname()}-{uuid.uuid4().hex}".encode()).hexdigest()[:8].upper()
    dev_id = f"ST-DEVICE-{h}"
    save_device_credentials(dev_id, None, device_file=target_file)
    logger.info(f"Initialized persistent device identity: {dev_id}")
    return dev_id, None


def save_device_credentials(device_id: str, token: str | None, device_file: Path | None = None):
    """Persists device ID and authorization token."""
    target_file = device_file or DEVICE_FILE
    try:
        target_file.parent.mkdir(parents=True, exist_ok=True)
        data = {
            "device_id": device_id,
            "hostname": get_hostname(),
            "token": token,
            "updated_at": datetime.now(timezone.utc).isoformat()
        }
        with open(target_file, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
    except Exception as e:
        logger.warning(f"Failed to save device credentials to {target_file}: {e}")


def load_checkpoints(checkpoint_file: Path | None = None) -> dict:
    target_file = checkpoint_file or CHECKPOINT_FILE
    if not target_file.exists():
        local_app_data = os.getenv("LOCALAPPDATA")
        if local_app_data:
            alt_file = Path(local_app_data) / "SentinelTwin" / "data" / "sensor_checkpoint.json"
            if alt_file.exists() and alt_file != target_file:
                try:
                    target_file.parent.mkdir(parents=True, exist_ok=True)
                    import shutil
                    shutil.copy2(alt_file, target_file)
                    logger.info(f"Migrated checkpoints from {alt_file} to {target_file}")
                except Exception:
                    pass

    if target_file.exists():
        try:
            with open(target_file, "r", encoding="utf-8") as f:
                data = json.load(f)
                if isinstance(data, dict):
                    return {k: int(v) for k, v in data.items() if str(v).isdigit()}
        except Exception as e:
            logger.warning(f"Failed to load checkpoint file {target_file}: {e}")
    return {}


def save_checkpoints(checkpoints: dict, checkpoint_file: Path | None = None):
    target_file = checkpoint_file or CHECKPOINT_FILE
    try:
        target_file.parent.mkdir(parents=True, exist_ok=True)
        with open(target_file, "w", encoding="utf-8") as f:
            json.dump(checkpoints, f, indent=2)
    except Exception as e:
        logger.warning(f"Failed to save checkpoint file {target_file}: {e}")


def probe_transport(server_url: str, timeout: float = 1.5) -> bool:
    """Fast health probe against candidate server URL with centralized SSRF validation."""
    try:
        valid_server = validate_and_normalize_server_url(server_url)
        url = f"{valid_server}/api/health"
        res = requests.get(url, timeout=timeout)
        return res.status_code == 200 and res.json().get("status") == "ok"
    except Exception:
        return False


def check_environment(server_url: str, channels: list[str]) -> dict:
    """
    Performs first-run diagnostic checks:
    1. Runtime data directory writability
    2. Windows Security Event Log access
    3. Sysmon availability
    4. Backend network reachability
    """
    status = {
        "data_dir_writable": False,
        "security_log_accessible": False,
        "sysmon_accessible": False,
        "backend_reachable": False,
        "active_channels": []
    }

    # 1. Check runtime data dir writability
    try:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        test_file = DATA_DIR / ".diag_write_test"
        test_file.write_text("ok", encoding="utf-8")
        test_file.unlink()
        status["data_dir_writable"] = True
        logger.info(f"[+] Runtime Data Directory : {DATA_DIR.resolve()} [WRITABLE]")
    except Exception as e:
        logger.error(f"[-] Runtime Data Directory : {DATA_DIR.resolve()} [NOT WRITABLE: {e}]")

    # 2. Check Windows Event Log access
    try:
        import win32evtlog
        try:
            h = win32evtlog.OpenEventLog(None, "Security")
            win32evtlog.CloseEventLog(h)
            status["security_log_accessible"] = True
            status["active_channels"].append("Security")
            logger.info("[+] Windows Security Log   : Accessible [OK]")
        except Exception as e:
            logger.warning(f"[!] Windows Security Log   : Access Limited ({e})")
            logger.warning("    NOTE: Administrator privileges recommended to monitor Security events (Logon, Process Creation).")

        # 3. Check Sysmon availability
        try:
            h_sys = win32evtlog.OpenEventLog(None, "Microsoft-Windows-Sysmon/Operational")
            win32evtlog.CloseEventLog(h_sys)
            status["sysmon_accessible"] = True
            status["active_channels"].append("Microsoft-Windows-Sysmon/Operational")
            logger.info("[+] Sysmon Telemetry       : Accessible (Microsoft-Windows-Sysmon/Operational) [OK]")
        except Exception:
            logger.info("[-] Sysmon Telemetry       : Channel not found.")
            logger.info("    NOTE: Sysmon is optional. Standard Windows Security events will be monitored.")
            logger.info("    To install Sysmon: https://learn.microsoft.com/en-us/sysinternals/downloads/sysmon")
    except ImportError:
        logger.error("[-] pywin32 / win32evtlog is not available.")

    # 4. Check Backend Connectivity
    is_up = probe_transport(server_url, timeout=2.0)
    status["backend_reachable"] = is_up
    if is_up:
        logger.info(f"[+] Backend Server Reachable: {server_url} [ONLINE]")
    else:
        logger.warning(f"[!] Backend Server Reachable: {server_url} [OFFLINE / UNREACHABLE]")
        logger.warning("    NOTE: Events will be buffered offline in sensor_offline_queue.json until server is online.")

    return status


def register_with_server(
    server_url: str,
    device_id: str,
    device_file: Path | None = None,
    token: str = None
) -> tuple[str, str | None]:
    """
    Registers the device with the central server via POST /api/sensor/register.
    Returns (auth_status, token).
    """
    target_file = device_file or DEVICE_FILE
    try:
        valid_server = validate_and_normalize_server_url(server_url)
        url = f"{valid_server}/api/sensor/register"
    except ValueError as e:
        logger.warning(f"Registration rejected due to invalid server URL: {e}")
        return "INVALID_URL", token

    payload = {
        "device_id": device_id,
        "hostname": get_hostname(),
        "source_ip": get_local_ip(),
        "os": platform.system()
    }
    headers = {"Content-Type": "application/json"}
    if token:
        headers["X-Sensor-Token"] = token

    try:
        res = requests.post(url, json=payload, headers=headers, timeout=3.0)
        data = res.json()
        status = data.get("status", "PENDING").upper()
        new_token = data.get("token") or token
        if new_token:
            save_device_credentials(device_id, new_token, device_file=target_file)
        return status, new_token
    except Exception as e:
        logger.warning(f"Registration probe to {server_url} failed: {e}")
        return "UNREACHABLE", token


def cleanup_stale_staging(drive_dir: Path, device_id: str, max_age_seconds: int = 3600):
    """Cleans up abandoned .tmp staging files older than max_age_seconds on startup."""
    staging_dir = drive_dir / device_id / "staging"
    if not staging_dir.exists():
        return
    now = time.time()
    for tmp_file in staging_dir.glob("*.tmp"):
        try:
            if now - tmp_file.stat().st_mtime > max_age_seconds:
                tmp_file.unlink()
                logger.debug(f"Removed stale staging file: {tmp_file}")
        except Exception:
            pass


def write_crash_safe_drive_batch(
    drive_dir: Path,
    device_id: str,
    events: list[dict],
    batch_id: str = None
) -> tuple[bool, str]:
    """
    Crash-safe 8-step atomic Google Drive batch delivery sequence:
    1. Read and normalize events (caller provided).
    2. Create a unique deterministic batch ID.
    3. Write the batch to a local staging file (.tmp).
    4. Flush the file buffer.
    5. Perform os.fsync.
    6. Atomically rename/move the completed file to outgoing relay folder.
    7. Confirm the final batch exists as a complete non-empty batch.
    8. Only then does caller advance the Event Log checkpoint.

    Returns: (success: bool, batch_id: str)
    """
    if not events:
        return True, ""

    if not batch_id:
        batch_id = f"batch-{device_id}-{int(time.time() * 1000)}-{uuid.uuid4().hex[:8]}"

    staging_dir = drive_dir / device_id / "staging"
    outgoing_dir = drive_dir / device_id / "outgoing"

    try:
        staging_dir.mkdir(parents=True, exist_ok=True)
        outgoing_dir.mkdir(parents=True, exist_ok=True)

        staging_path = staging_dir / f"{batch_id}.tmp"
        final_path = outgoing_dir / f"{batch_id}.json"

        batch_payload = {
            "batch_id": batch_id,
            "device_id": device_id,
            "transport": "GOOGLE_DRIVE",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "event_count": len(events),
            "events": events
        }

        # Steps 3, 4, 5: Write, Flush, fsync
        with open(staging_path, "w", encoding="utf-8") as f:
            json.dump(batch_payload, f, indent=2)
            f.flush()
            os.fsync(f.fileno())

        # Step 6: Atomic rename/move to final location
        os.replace(str(staging_path), str(final_path))

        # Step 7: Confirm final batch exists as complete file
        if final_path.exists() and final_path.stat().st_size > 0:
            return True, batch_id
        else:
            logger.error(f"Verification failed: {final_path} does not exist or is empty")
            return False, batch_id

    except Exception as e:
        logger.error(f"Failed to write crash-safe Drive batch {batch_id}: {e}")
        return False, batch_id


def enqueue_offline(events: list[dict], queue_file: Path | None = None):
    """
    Appends events to the local offline queue file.
    Does NOT advance the checkpoint.
    """
    if not events:
        return
    target_file = queue_file or OFFLINE_QUEUE_FILE
    queue = []
    if target_file.exists():
        try:
            with open(target_file, "r", encoding="utf-8") as f:
                queue = json.load(f)
                if not isinstance(queue, list):
                    queue = []
        except Exception:
            queue = []

    queue.extend(events)
    try:
        target_file.parent.mkdir(parents=True, exist_ok=True)
        with open(target_file, "w", encoding="utf-8") as f:
            json.dump(queue, f, indent=2)
        logger.info(f"Queued {len(events)} events offline (total buffered: {len(queue)})")
    except Exception as e:
        logger.error(f"Failed to append to offline queue {target_file}: {e}")


def drain_offline_queue(
    server_url: str,
    device_id: str,
    token: str,
    session: requests.Session = None,
    queue_file: Path | None = None
) -> int:
    """
    Drains buffered offline events to the server in chronological order via /api/events/batch.
    Removes drained events from disk upon successful acknowledgement.
    """
    target_file = queue_file or OFFLINE_QUEUE_FILE
    if not target_file.exists():
        return 0

    try:
        with open(target_file, "r", encoding="utf-8") as f:
            events = json.load(f)
            if not isinstance(events, list) or not events:
                return 0
    except Exception as e:
        logger.warning(f"Failed to read offline queue {target_file}: {e}")
        return 0

    batch_id = f"offline-{device_id}-{int(time.time() * 1000)}-{uuid.uuid4().hex[:6]}"
    try:
        valid_server = validate_and_normalize_server_url(server_url)
        url = f"{valid_server}/api/events/batch"
    except ValueError as e:
        logger.warning(f"Offline queue drain rejected due to invalid server URL: {e}")
        return 0

    headers = {
        "Content-Type": "application/json",
        "X-Sensor-Token": token or DEFAULT_SENSOR_TOKEN,
        "X-Device-Id": device_id,
        "X-Transport-Mode": "DIRECT"
    }
    payload = {
        "batch_id": batch_id,
        "device_id": device_id,
        "transport": "DIRECT",
        "events": events
    }

    client = session or requests
    try:
        r = client.post(url, json=payload, headers=headers, timeout=10.0)
        if r.status_code in (200, 201):
            logger.info(f"Successfully drained {len(events)} offline events to {server_url}")
            target_file.unlink(missing_ok=True)
            return len(events)
        elif r.status_code == 403:
            logger.warning("Device authorization required before draining offline queue (HTTP 403)")
            return 0
        else:
            logger.warning(f"Failed to drain offline queue ({r.status_code}): {r.text[:100]}")
            return 0
    except Exception as e:
        logger.warning(f"Error while draining offline queue to {server_url}: {e}")
        return 0


def _classify_event_id(eid: int) -> str:
    mapping = {
        4624: "logon", 4625: "failed_logon", 4634: "logoff",
        4648: "explicit_logon", 4688: "process_creation", 4689: "process_exit",
        4698: "scheduled_task_created", 4720: "account_created",
        4722: "account_enabled", 4726: "account_deleted",
        4732: "group_membership_change",
        1: "process_creation", 3: "network_connection",
        11: "file_created", 22: "dns_query",
    }
    return mapping.get(eid, "unknown")


def _normalize_record(record, channel: str, device_id: str) -> dict:
    """Normalizes a raw win32evtlog record into SentinelTwin telemetry schema."""
    eid = record.EventID & 0xFFFF
    record_id = int(record.RecordNumber) if hasattr(record, "RecordNumber") else int(time.time() * 1000) % 1_000_000_000
    ts = datetime.now(timezone.utc).isoformat()
    if hasattr(record, "TimeGenerated") and record.TimeGenerated:
        try:
            ts = record.TimeGenerated.isoformat()
        except Exception:
            ts = str(record.TimeGenerated)

    strings = getattr(record, "StringInserts", []) or []
    username = "Unknown"
    process_name = ""
    command_line = ""

    if eid == 1 and len(strings) > 3:  # Sysmon Process Create
        process_name = strings[4] if len(strings) > 4 and strings[4].endswith(".exe") else strings[3]
        username = strings[11] if len(strings) > 11 else (strings[12] if len(strings) > 12 else "Unknown")
        command_line = strings[9] if len(strings) > 9 else ""
    elif eid in (4688, 4689):  # Windows Process Create / Exit
        process_name = strings[5] if len(strings) > 5 else ""
        username = strings[1] if len(strings) > 1 else "Unknown"
        command_line = strings[8] if len(strings) > 8 else ""
    elif eid in (4624, 4625):  # Windows Logon
        username = strings[5] if len(strings) > 5 else "Unknown"
        process_name = strings[17] if len(strings) > 17 else ""
    else:
        username = strings[5] if len(strings) > 5 else "Unknown"
        process_name = strings[10] if len(strings) > 10 else ""

    hostname = get_hostname()
    return {
        "timestamp": ts,
        "event_timestamp": ts,
        "channel": channel,
        "source": "Sysmon" if "Sysmon" in channel or eid in (1, 3, 11, 22) else channel,
        "event_id": eid,
        "record_id": record_id,
        "event_type": _classify_event_id(eid),
        "hostname": hostname,
        "computer": hostname,
        "device_id": device_id,
        "username": username,
        "process_name": process_name,
        "command_line": command_line,
        "source_ip": get_local_ip(),
    }


def read_channel_events(
    channel: str,
    last_checkpoint: int | None,
    device_id: str = None,
    max_events: int = 50,
    max_scan_chunks: int = 10
) -> tuple[list[dict], int]:
    if not device_id:
        device_id = f"dev-{get_hostname().replace('.', '-')}"
    events = []
    newest_record_in_log = last_checkpoint or 0

    try:
        import win32evtlog

        try:
            handle = win32evtlog.OpenEventLog(None, channel)
        except Exception as e:
            logger.warning(f"Channel {channel} read error: {e}")
            return [], newest_record_in_log

        flags = win32evtlog.EVENTLOG_BACKWARDS_READ | win32evtlog.EVENTLOG_SEQUENTIAL_READ
        records = win32evtlog.ReadEventLog(handle, flags, 0)

        if not records:
            win32evtlog.CloseEventLog(handle)
            return [], newest_record_in_log

        newest_in_log = int(records[0].RecordNumber)

        if last_checkpoint is None:
            newest_record_in_log = newest_in_log
            for record in records[:max_events]:
                eid = record.EventID & 0xFFFF
                if eid in WATCHED_EVENT_IDS:
                    events.append(_normalize_record(record, channel, device_id))
            win32evtlog.CloseEventLog(handle)
            events.sort(key=lambda ev: ev["record_id"])
            return events, newest_record_in_log

        if newest_in_log < last_checkpoint:
            logger.warning(
                f"Channel {channel} record number reset (newest {newest_in_log} < checkpoint {last_checkpoint}). "
                f"Resetting checkpoint to {newest_in_log}."
            )
            win32evtlog.CloseEventLog(handle)
            return [], newest_in_log

        if newest_in_log <= last_checkpoint:
            win32evtlog.CloseEventLog(handle)
            return [], last_checkpoint

        newest_record_in_log = newest_in_log
        reached_checkpoint = False
        chunks_scanned = 0

        while records and not reached_checkpoint and chunks_scanned < max_scan_chunks:
            chunks_scanned += 1
            for record in records:
                rec_num = int(record.RecordNumber)
                if rec_num <= last_checkpoint:
                    reached_checkpoint = True
                    break

                eid = record.EventID & 0xFFFF
                if eid in WATCHED_EVENT_IDS:
                    events.append(_normalize_record(record, channel, device_id))

            if not reached_checkpoint:
                try:
                    records = win32evtlog.ReadEventLog(handle, flags, 0)
                except Exception:
                    break

        win32evtlog.CloseEventLog(handle)

    except ImportError:
        logger.error("pywin32 not installed. Install with: pip install pywin32")
    except Exception as e:
        logger.warning(f"Error reading channel {channel}: {e}")

    events.sort(key=lambda ev: ev["record_id"])
    return events, newest_record_in_log


def read_windows_events(channels: list[str], max_events: int = 50) -> list[dict]:
    """Compatibility wrapper for batch event reading without external checkpoint state."""
    all_events = []
    for channel in channels:
        evts, _ = read_channel_events(channel, last_checkpoint=None, max_events=max_events)
        all_events.extend(evts)
    return all_events


def send_event(
    server: str,
    event: dict,
    session: requests.Session = None,
    token: str = DEFAULT_SENSOR_TOKEN,
    transport: str = "DIRECT"
) -> str:
    """
    Sends normalized event to /api/events.
    Returns: 'sent', 'duplicate', 'forbidden', or 'failed'.
    """
    try:
        valid_server = validate_and_normalize_server_url(server)
        url = f"{valid_server}/api/events"
    except ValueError as e:
        logger.warning(f"Event delivery rejected due to invalid server URL: {e}")
        return "failed"

    headers = {
        "Content-Type": "application/json",
        "X-Sensor-Token": token or DEFAULT_SENSOR_TOKEN,
        "X-Device-Id": event.get("device_id", ""),
        "X-Transport-Mode": transport
    }
    client = session or requests
    try:
        r = client.post(url, json=event, headers=headers, timeout=3.0)
        if r.status_code in (200, 201):
            return "sent"
        elif r.status_code == 409:
            return "duplicate"
        elif r.status_code == 403:
            logger.warning(f"Telemetry rejected by server (403 Forbidden): {r.text[:100]}")
            return "forbidden"
        logger.warning(f"Server rejected event {event.get('record_id')} ({r.status_code}): {r.text[:120]}")
        return "failed"
    except Exception as e:
        logger.warning(f"Failed to send event: {e}")
        return "failed"


def run(
    server: str = None,
    interval: int = None,
    private_server: str = None,
    drive_dir: str = None
):
    """
    Main multi-transport sensor loop.
    Detects transports, registers endpoint, monitors event logs, delivers telemetry,
    and supports crash-safe Google Drive fallback and offline queue draining.
    """
    if platform.system() != "Windows":
        logger.error("Windows sensor unavailable on this operating system.")
        logger.info("Run on a Windows machine to collect endpoint telemetry.")
        sys.exit(1)

    if not acquire_single_instance_lock():
        print("[-] Another instance of SentinelTwin Sensor is already running on this machine.", file=sys.stderr)
        print("[-] Exiting cleanly to prevent duplicate event collection and checkpoint conflicts.", file=sys.stderr)
        logger.warning("Another instance of SentinelTwin Sensor is already running. Exiting cleanly.")
        return 0

    cfg = load_sensor_config()
    base_server = EMBEDDED_SERVER_URL or DEFAULT_SERVER
    if server is None:
        server = os.getenv("SENTINEL_SERVER") or cfg.get("server") or base_server
    if interval is None:
        interval = int(os.getenv("SENTINEL_INTERVAL") or cfg.get("interval") or DEFAULT_INTERVAL)
    if private_server is None:
        private_server = os.getenv("SENTINEL_PRIVATE_SERVER") or cfg.get("private_server") or None
    if drive_dir is None:
        drive_dir = os.getenv("SENTINEL_DRIVE_DIR") or cfg.get("drive_dir") or None

    device_id, stored_token = get_or_create_device_id()
    token = stored_token or DEFAULT_SENSOR_TOKEN
    drive_path = Path(drive_dir) if drive_dir else DEFAULT_DRIVE_DIR
    cleanup_stale_staging(drive_path, device_id)

    hostname = get_hostname()
    local_ip = get_local_ip()
    channels = ["Security", "Microsoft-Windows-Sysmon/Operational"]

    # First-run environment and diagnostics check
    diag = check_environment(server, channels)
    if diag.get("active_channels"):
        channels = diag["active_channels"]

    banner = f"""
======================================================================
           SENTINELTWIN WINDOWS TELEMETRY SENSOR (v1.0.0)
======================================================================
 Device ID       : {device_id}
 Hostname        : {hostname}
 Source IP       : {local_ip}
 Target Server   : {server}
 Private Server  : {private_server or 'None configured'}
 Polling Rate    : {interval}s
 Event Channels  : {', '.join(channels)}
 Runtime Dir     : {DATA_DIR.resolve()}
 Log File        : {LOG_FILE.resolve()}
 Process PID     : {os.getpid()}
======================================================================
"""
    print(banner)

    logger.info(f"SentinelTwin Sensor starting on {hostname} ({local_ip})")
    logger.info(f"Device ID: {device_id}")
    logger.info(f"Preferred Server: {server} (polling interval: {interval}s)")
    if private_server:
        logger.info(f"Private Network Server: {private_server}")
    logger.info(f"Google Drive Relay Directory: {drive_path}")
    logger.info("This sensor is authorized to collect endpoint telemetry on this machine.")

    checkpoints = load_checkpoints()
    if checkpoints:
        logger.info(f"Loaded existing checkpoints: {checkpoints}")
    else:
        logger.info("No existing checkpoints found. Initializing live monitoring checkpoints.")

    # Persistent HTTP session
    session = requests.Session()
    session.headers.update({
        "Content-Type": "application/json",
        "X-Sensor-Token": token,
        "X-Device-Id": device_id
    })

    # Initial registration attempt
    reg_status = "UNKNOWN"
    if probe_transport(server):
        reg_status, new_token = register_with_server(server, device_id, token=token)
        if new_token:
            token = new_token
            session.headers["X-Sensor-Token"] = token
        logger.info(f"Registration status with direct server: {reg_status}")
    elif private_server and probe_transport(private_server):
        reg_status, new_token = register_with_server(private_server, device_id, token=token)
        if new_token:
            token = new_token
            session.headers["X-Sensor-Token"] = token
        logger.info(f"Registration status with private server: {reg_status}")

    if reg_status == "PENDING":
        logger.info("[*] Device registered with central server.")
        logger.info("[*] Status: PENDING — Awaiting administrator approval in the SentinelTwin dashboard.")
        logger.info("[*] Please approve this device on the central server (Devices tab).")
    elif reg_status == "AUTHORIZED":
        logger.info("[+] Device AUTHORIZED by administrator!")
        logger.info("[+] Beginning live telemetry streaming.")
        logger.info(f"[+] Monitoring channels: {', '.join(channels)}")

    total_sent = 0

    try:
        while True:
            loop_start = time.perf_counter()

            # Dynamic Transport Selection
            current_mode = "DIRECT"
            target_url = server

            if probe_transport(server):
                current_mode = "DIRECT"
                target_url = server
            elif private_server and probe_transport(private_server):
                current_mode = "PRIVATE_NETWORK"
                target_url = private_server
            elif drive_path.exists():
                current_mode = "GOOGLE_DRIVE"
                target_url = None
            else:
                current_mode = "OFFLINE_QUEUE"
                target_url = None

            # Interactive Approval Gating & Polling Loop
            if current_mode in ("DIRECT", "PRIVATE_NETWORK"):
                if reg_status == "PENDING":
                    poll_server = target_url or server
                    poll_status, new_tok = register_with_server(poll_server, device_id, token=token)
                    if new_tok:
                        token = new_tok
                        session.headers["X-Sensor-Token"] = token
                    if poll_status == "AUTHORIZED":
                        reg_status = "AUTHORIZED"
                        logger.info("[+] Device AUTHORIZED by administrator!")
                        logger.info("[+] Beginning live telemetry streaming.")
                        logger.info(f"[+] Monitoring channels: {', '.join(channels)}")
                    elif poll_status == "REVOKED":
                        reg_status = "REVOKED"
                        logger.warning("[-] Device authorization REVOKED by administrator.")
                        time.sleep(interval)
                        continue
                    else:
                        logger.info("[*] Status: PENDING — Waiting for administrator approval in dashboard...")
                        time.sleep(interval)
                        continue
                elif reg_status == "REVOKED":
                    poll_server = target_url or server
                    poll_status, new_tok = register_with_server(poll_server, device_id, token=token)
                    if poll_status == "AUTHORIZED":
                        reg_status = "AUTHORIZED"
                        logger.info("[+] Device re-authorized by administrator! Resuming telemetry streaming.")
                    else:
                        logger.warning("[-] Device is REVOKED. Telemetry streaming paused.")
                        time.sleep(interval)
                        continue

            # Auto-recovery: If Direct or Private HTTP is back online and authorized, drain offline queue first
            if current_mode in ("DIRECT", "PRIVATE_NETWORK") and reg_status == "AUTHORIZED":
                drained = drain_offline_queue(target_url, device_id, token, session=session)
                if drained > 0:
                    total_sent += drained

            batch_read = 0
            batch_sent = 0
            batch_duplicates = 0
            batch_failed = 0

            for channel in channels:
                last_cp = checkpoints.get(channel)
                events, newest_seen = read_channel_events(channel, last_cp, device_id)

                if not events:
                    if newest_seen > (last_cp or 0) and current_mode in ("DIRECT", "PRIVATE_NETWORK"):
                        checkpoints[channel] = newest_seen
                        save_checkpoints(checkpoints)
                    continue

                batch_read += len(events)
                channel_cp = last_cp or 0
                delivery_ok = True

                # Delivery by active transport mode
                if current_mode in ("DIRECT", "PRIVATE_NETWORK"):
                    for ev in events:
                        status = send_event(target_url, ev, session=session, token=token, transport=current_mode)
                        if status == "sent":
                            batch_sent += 1
                            total_sent += 1
                            channel_cp = max(channel_cp, ev["record_id"])
                        elif status == "duplicate":
                            batch_duplicates += 1
                            channel_cp = max(channel_cp, ev["record_id"])
                        elif status == "forbidden":
                            logger.warning("[-] Telemetry rejected (403 Forbidden). Device may be PENDING approval or REVOKED.")
                            reg_status = "PENDING"
                            batch_failed += 1
                            delivery_ok = False
                            enqueue_offline(events[events.index(ev):])
                            break
                        else:
                            batch_failed += 1
                            delivery_ok = False
                            enqueue_offline(events[events.index(ev):])
                            break

                    if delivery_ok:
                        channel_cp = max(channel_cp, newest_seen)
                    if channel_cp > (last_cp or 0):
                        checkpoints[channel] = channel_cp
                        save_checkpoints(checkpoints)

                elif current_mode == "GOOGLE_DRIVE":
                    # Crash-safe atomic 8-step sequence
                    success, b_id = write_crash_safe_drive_batch(drive_path, device_id, events)
                    if success:
                        batch_sent += len(events)
                        total_sent += len(events)
                        # ONLY advance checkpoint upon verified complete file existence
                        checkpoints[channel] = max(channel_cp, newest_seen)
                        save_checkpoints(checkpoints)
                        logger.info(f"Relayed {len(events)} events via Google Drive batch {b_id}")
                    else:
                        batch_failed += len(events)
                        enqueue_offline(events)

                else:  # OFFLINE_QUEUE
                    enqueue_offline(events)
                    batch_failed += len(events)
                    # Checkpoint intentionally NOT advanced

            if batch_read > 0 or batch_failed > 0:
                logger.info(
                    f"[{current_mode}] Processed: read={batch_read} sent={batch_sent} "
                    f"duplicates={batch_duplicates} failed={batch_failed} (total sent: {total_sent})"
                )

            elapsed = time.perf_counter() - loop_start
            sleep_duration = max(0.05, float(interval) - elapsed)
            time.sleep(sleep_duration)

    finally:
        session.close()


if __name__ == "__main__":
    import argparse

    cfg = load_sensor_config()
    env_server = os.getenv("SENTINEL_SERVER")
    env_interval = os.getenv("SENTINEL_INTERVAL")
    env_private_server = os.getenv("SENTINEL_PRIVATE_SERVER")
    env_drive_dir = os.getenv("SENTINEL_DRIVE_DIR")

    base_server = EMBEDDED_SERVER_URL or DEFAULT_SERVER
    default_server = env_server or cfg.get("server") or base_server
    default_interval = int(env_interval or cfg.get("interval") or DEFAULT_INTERVAL)
    default_private = env_private_server or cfg.get("private_server") or None
    default_drive = env_drive_dir or cfg.get("drive_dir") or None

    parser = argparse.ArgumentParser(description="SentinelTwin Windows Sensor")
    parser.add_argument("--server", default=default_server, help=f"Central SentinelTwin server URL (default: {default_server})")
    parser.add_argument("--interval", type=int, default=default_interval, help=f"Polling interval in seconds (default: {default_interval})")
    parser.add_argument("--private-server", default=default_private, help="Private/Overlay network server URL")
    parser.add_argument("--drive-dir", default=default_drive, help="Local Google Drive sync/relay folder path")
    args = parser.parse_args()

    run(
        server=args.server,
        interval=args.interval,
        private_server=args.private_server,
        drive_dir=args.drive_dir
    )
