# SentinelTwin — Complete Operations & Runbook

Welcome to SentinelTwin! This guide explains how to configure, start, build, and run the entire SentinelTwin platform: the central server (Flask API + React SOC Console) and the standalone Windows Telemetry Sensor.

---

## Architecture Overview

```text
CENTRAL SERVER (Laptop A)
  ├── Backend API (Flask on Port 5000, bound to 127.0.0.1 by default)
  ├── SQLite Database (data/sentineltwin.db)
  └── SOC Dashboard (React + Vite on Port 5173)
           ▲
           │ Telemetry (HTTP / Google Drive / Offline Queue)
           ▼
ENDPOINTS / WORKSTATIONS (Laptop A, Laptop B, etc.)
  └── SentinelTwin-Sensor.exe (Standalone Windows Binary)
```

---

## 1. Environment Configuration & First-Time Admin Bootstrap

SentinelTwin employs strict environment-based secret isolation and fail-closed security. No default secrets or credentials are hardcoded into the codebase.

### Step 1: Create your local `.env` file
Copy the provided template:
```cmd
copy .env.example .env
```

### Step 2: Configure Environment Variables
Edit `.env` (or configure your shell environment):
```bash
# Server Binding (Default: 127.0.0.1 for local presentation safety)
HOST=127.0.0.1
PORT=5000
SENTINEL_ENV=development

# Cryptographic Secrets (Required for production runs; generated in development if omitted)
SECRET_KEY=<generate-a-strong-random-secret>
SENSOR_TOKEN=<generate-a-strong-random-token>

# Initial Administrator Bootstrap (Evaluated when database initializes for the first time)
BOOTSTRAP_ADMIN_USER=admin
BOOTSTRAP_ADMIN_PASSWORD=<generate-a-strong-admin-password>

# CORS Origins Allowed to Interact with Backend
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
```

> [!IMPORTANT]
> **Admin Bootstrap Behavior**:
> - When `backend/database/db.py` initializes a new database (`data/sentineltwin.db`), it checks for `BOOTSTRAP_ADMIN_USER` and `BOOTSTRAP_ADMIN_PASSWORD`.
> - If provided, it hashes the password with PBKDF2-SHA256 and creates the initial Administrator account.
> - If omitted, **no default admin is created**, preventing unauthorized access from default credential exploits.

---

## 2. Server Binding & Presentation Safety

SentinelTwin enforces a safe-by-default network exposure model:

| Mode | `HOST` Setting | Access Scope | Intended Use Case |
| :--- | :--- | :--- | :--- |
| **Presentation / Local (Default)** | `127.0.0.1` | Local machine only | Demos, presentations, and single-laptop testing without network exposure. |
| **Multi-Device LAN Mode** | `0.0.0.0` | Accessible across LAN | Testing with physical remote laptops (e.g., Laptop B sending telemetry). |

### Overriding for LAN Deployments
To allow remote laptops on your local network to send telemetry to your central server:
1. In your `.env` file, set `HOST=0.0.0.0` (or run `set HOST=0.0.0.0` before launching the backend).
2. Ensure Windows Firewall permits incoming TCP connections on port 5000:
   ```cmd
   netsh advfirewall firewall add rule name="SentinelTwin API" dir=in action=allow protocol=TCP localport=5000
   ```
3. Use `ipconfig` to obtain your machine's LAN IP address (e.g., `192.168.1.50`).

> [!WARNING]
> Binding to `0.0.0.0` exposes port 5000 to all hosts on the local network. Always ensure strong `SECRET_KEY`, `SENSOR_TOKEN`, and admin passwords when operating in LAN mode.

---

## 3. Quick Start (Running Central Services)

Launch all server components in dedicated console windows with one click:

### Start All Services
Open Command Prompt or PowerShell in the repository root and run:
```cmd
scripts\start_all.bat
```
This automatically launches:
1. **Flask Backend API Service** on `http://127.0.0.1:5000` (or `0.0.0.0:5000` if configured)
2. **SOC Web Console** on `http://localhost:5173`

Open your browser to:
👉 **`http://localhost:5173`**

### Stop All Services
To cleanly shut down both the backend and frontend:
```cmd
scripts\stop_all.bat
```

---

## 4. SOC Console Authentication & Operator Workflow

All administrative operations in SentinelTwin are protected by Role-Based Access Control (RBAC):

1. Open the SOC Console at `http://localhost:5173`.
2. In the top navigation bar, click the **Sign In** button.
3. Enter your Administrator credentials (as configured via `BOOTSTRAP_ADMIN_USER` and `BOOTSTRAP_ADMIN_PASSWORD`).
4. Upon successful sign-in:
   - A signed JWT is issued by `/api/auth/login`.
   - The token is securely stored in browser session storage and automatically dispatched with all subsequent API calls via `Authorization: Bearer <token>`.
   - The top bar displays your active username and `[Administrator]` badge.
5. Authenticated administrators have access to:
   - Device Authorization, Revocation, and Deletion
   - Network Discovery scans & Interface monitoring
   - Incident triage & alert disposition updates
   - Cyber Twin propagation simulations & risk recalculations
   - Event and device log clearing
6. If an unauthenticated user or viewer attempts an administrative action, the API rejects the request with HTTP 401/403 and the UI alerts the operator to log in.

---

## 5. Building the Standalone Sensor Executable (`.exe`)

The SentinelTwin Windows Sensor collects Windows Security Event Logs and Sysmon telemetry. It is packaged into a **single, standalone Windows `.exe`** requiring **no Python, pip, or virtual environment** on target endpoints.

### Option A: Build for Localhost (Single-Laptop Testing)
```cmd
scripts\build_sensor_exe.bat
```
- Targets: `http://127.0.0.1:5000`
- Generates: `release\SentinelTwin-Sensor.exe` (~12.1 MB)

### Option B: Build for Remote Laptop B (LAN Deployment)
If you want to deploy the sensor to another laptop on your Wi-Fi/LAN:
1. Find your central server's LAN IP address (e.g. `ipconfig` -> `192.168.1.50`).
2. Run the build script with your server IP:
   ```cmd
   scripts\build_sensor_exe.bat http://192.168.1.50:5000
   ```
   *(Or set the environment variable: `set SENTINEL_SERVER_URL=http://192.168.1.50:5000` before running the script).*
3. The executable now has your server IP embedded at build time.

---

## 6. Running the Standalone Sensor

### On the Central Laptop (Laptop A):
```cmd
release\SentinelTwin-Sensor.exe
```
*(Or run `scripts\start_sensor.bat` if running from Python source).*

### On a Remote Laptop (Laptop B):
1. Copy **ONLY** `release\SentinelTwin-Sensor.exe` to Laptop B (via USB flash drive, network share, etc.).
2. Double-click `SentinelTwin-Sensor.exe` or run from PowerShell/CMD:
   ```cmd
   SentinelTwin-Sensor.exe
   ```
3. **No Python, no config file, and no command-line flags are required.**

> [!TIP]
> **Windows Privileges Note**:
> - Collecting **Sysmon** telemetry requires standard non-administrator privileges.
> - Collecting the **Windows Security Log** (Logons, Process Creations) requires running as Administrator OR membership in the built-in Windows "Event Log Readers" group.

---

## 7. Approving the Device in the Dashboard (Security Gate)

For security, every newly registered workstation starts in a **`PENDING`** state. Unapproved devices cannot stream telemetry into the Cyber Twin or risk engines.

1. When the sensor starts, its console displays:
   ```text
   [*] Status: PENDING — Waiting for administrator approval in dashboard...
   ```
2. In the SentinelTwin Console (`http://localhost:5173`), ensure you are signed in as an Administrator.
3. In the left sidebar under **SYSTEM & ASSETS**, click **DEVICES**.
4. Locate the newly connected workstation (marked with a yellow/orange `PENDING` badge).
5. Click the green **Authorize** button.
6. The sensor immediately detects authorization within 5 seconds and logs:
   ```text
   [+] Device AUTHORIZED by administrator!
   [+] Beginning live telemetry streaming.
   [+] Monitoring channels: Security, Microsoft-Windows-Sysmon/Operational.
   ```
7. Live events will begin streaming on your **OVERVIEW** and **EVENTS** tabs!

> [!NOTE]
> **Device-Bound Token Validation**:
> Each approved device receives a unique cryptographic sensor token. The central API enforces strict device-bound token matching (`X-Sensor-Token`). A token registered for Device A cannot be used to ingest telemetry for Device B, eliminating device impersonation risks.

---

## 8. Runtime Configuration Overrides (Optional)

If you need to override the target server at runtime without recompiling the executable:

| Priority | Method | Example |
| :--- | :--- | :--- |
| **1 (Highest)** | Command-Line Flag | `SentinelTwin-Sensor.exe --server http://10.0.0.5:5000` |
| **2** | Environment Variable | `set SENTINEL_SERVER=http://10.0.0.5:5000` |
| **3** | JSON Config File | Create `sentinel_sensor.json` next to the `.exe`: `{"server": "http://10.0.0.5:5000"}` |
| **4** | Build-Time Embedded URL | Injected during compilation via `build_sensor_exe.bat` |
| **5 (Lowest)** | Development Fallback | `http://127.0.0.1:5000` |

---

## 9. Running the Automated Test Suite

To verify the integrity and security of all SentinelTwin components:

```powershell
python -m pytest -v
```

### Verified Suite Coverage: **62 / 62 passing tests**

- **Authentication & RBAC (`backend/tests/test_auth_enforcement.py`)**: 7 tests
  - Verifies rejection of unauthenticated requests (HTTP 401)
  - Verifies administrator JWT authorization for mutating endpoints
  - Verifies Viewer role restrictions (read-only access)
  - Verifies device token binding to prevent cross-device impersonation
  - Verifies immediate blocking of revoked devices (HTTP 403)
  - Verifies network monitoring start/stop/status routes
  - Verifies incident and alert update and retrieval endpoints
- **Security & Core Pipeline (`backend/tests/test_full_suite.py`)**: 13 tests
  - Database authenticated login & password hashing
  - Fail-closed production bootstrap validation
  - SQLite directory auto-creation
  - XML event parsing & timestamp preservation
  - CyberDNA behavioral anomaly gating
  - Explainable risk scoring & contextual PowerShell detection
  - Idempotent event ingestion & deduplication
- **Multi-Device & Sensor Network (`tests/test_multi_device.py`)**: 11 tests
  - Registration gating, multi-device isolation, dynamic offline detection, SSRF rejection
- **MITRE ATT&CK Mapping (`tests/test_evidence_mitre.py`)**: 10 tests
  - Sysmon & Security log detection rules (T1059, T1003, T1543, T1070, T1046, T1082, T1041)
- **Sensor Reliability & Checkpoints (`tests/test_sensor_checkpoint.py`)**: 4 tests
  - Polling deduplication, failure retention, chronological ordering
- **Sensor Packaging & Portability (`tests/test_sensor_packaging.py`)**: 10 tests
  - Single-instance mutex, runtime data directories, config hierarchy overrides
- **Analytics & Simulation**: 7 tests
  - Digital Twin graph simulation, behavioral drift detector, peer baseline aggregation, explainable risk breakdown, and signal correlators.

---

## 10. Troubleshooting & FAQs

### Q: "Sign In fails with Invalid username or password"
- **Reason**: The initial admin account was not configured during first database creation.
- **Solution**: Set `BOOTSTRAP_ADMIN_USER=admin` and `BOOTSTRAP_ADMIN_PASSWORD=<your-strong-password>` in `.env`. If `data/sentineltwin.db` was already created with an empty user table, delete `data/sentineltwin.db` (or run a database initialization script) and restart the backend.

### Q: "Action Forbidden / 401 Unauthorized in Console"
- **Reason**: Your session has expired or you have not yet logged in with Administrator privileges.
- **Solution**: Click **Sign In** in the top bar and enter your Administrator credentials.

### Q: "Remote Sensor cannot reach Server on LAN"
- **Reason**: The backend server is bound to `127.0.0.1` by default for presentation safety.
- **Solution**: Set `HOST=0.0.0.0` in `.env` and verify Windows Firewall allows inbound traffic on port 5000.

### Q: "Another instance of SentinelTwin Sensor is already running on this machine"
- **Reason**: SentinelTwin uses a Windows Named Mutex (`Global\SentinelTwin_Sensor_SingleInstance_Mutex`) to prevent competing processes from corrupting event log checkpoints.
- **Solution**: Check Task Manager or run `taskkill /f /im SentinelTwin-Sensor.exe` to terminate previous background runs.

### Q: "Cannot find package.json / npm error ENOENT"
- **Solution**: Ensure you run `scripts\start_frontend.bat` (which automatically enters `frontend/`) or cd into `frontend/` before executing `npm run dev`.

### Q: Port 5000 or 5173 is already in use
- **Solution**: Run `scripts\stop_all.bat` to clear any lingering processes bound to ports 5000 and 5173.
