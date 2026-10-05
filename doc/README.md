# SentinelTwin

**Cyber Behavior + Network Impact Intelligence**

REAL NETWORK · REAL TELEMETRY · EXPLAINABLE DETECTION · GRAPH-BASED SIMULATION

---

## ⚠ Authorization Notice

> Network discovery must only be performed on networks you own or are explicitly authorized to monitor.

SentinelTwin is a **defensive observation platform** only. It does not exploit, attack, persist, modify, disable, or destroy.

---

## Architecture

```text
Real Wi-Fi / Network
     ↓
Network Discovery (ARP + ICMP ping)
     ↓
Device Database (SQLite)
     ↓
Windows Sensor (optional endpoint telemetry)
     ↓
Event Pipeline → CyberDNA Engine → Risk Intelligence
     ↓
Risk-Gated Cyber Twin (NetworkX graph simulation)
     ↓
React SOC Console (Protected by JWT RBAC)
```

---

## Getting Started

### 1. Environment Setup & Admin Bootstrap
```bash
cd sentineltwin

# 1. Install dependencies
pip install -r requirements.txt

# 2. Configure environment from template
copy .env.example .env

# Configure initial administrator in .env:
# BOOTSTRAP_ADMIN_USER=admin
# BOOTSTRAP_ADMIN_PASSWORD=<your-strong-password>
# (Optional) For multi-device LAN testing: set HOST=0.0.0.0 (default: 127.0.0.1)
```

### 2. Backend Service
```bash
python -m backend.app
# → http://127.0.0.1:5000 (Default presentation-safe local binding)
```

### 3. Frontend SOC Console
```bash
cd frontend
npm install
npm run dev
# → http://localhost:5173
```
*In the top bar, click **Sign In** and authenticate using your administrator credentials to unlock administrative controls.*

### 4. Windows Telemetry Sensor (on authorized Windows endpoint)
```bash
# Standalone binary (no Python required):
release\SentinelTwin-Sensor.exe

# Or from source:
pip install pywin32 requests
python sensor/windows_sensor.py --server http://127.0.0.1:5000
```

---

## Automated Verification & Test Suite

Verify all components, auth gates, and detection models:
```bash
python -m pytest -v
# Total: 62 / 62 passing tests
```

Key verified test suites:
- **Authentication & RBAC**: Admin-only gates, read-only viewer roles, device token anti-impersonation, revoked device blocking.
- **CyberDNA & Baseline Engine**: Welford online anomaly calculation, peer group aggregation.
- **Explainable Risk Scoring**: Deterministic breakdown traceable to observable events.
- **MITRE ATT&CK Mapping**: T1059, T1003, T1543, T1070, T1046, T1082, T1041.
- **Sensor Reliability**: Checkpoint state persistence, duplicate suppression, crash-safe Drive relay.
- **Packaging & Portability**: Single-instance mutex, dynamic URL resolution.

---

## Research Contributions

1. **CyberDNA** — Personal + peer behavioral baselines (Welford online statistics)
2. **Explainable Risk** — Every risk point traceable to a specific observable event
3. **Risk-Gated Cyber Twin** — Only high-confidence incidents trigger propagation simulation
4. **Real Network Impact Visibility** — Behavioral anomalies mapped to actual observed topology

---

## Stack

- **Backend**: Python 3.10+, Flask, SQLite, PyJWT, NetworkX
- **Frontend**: React 18, Vite, Tailwind CSS, Cytoscape.js, Recharts, Lucide Icons
- **Network**: OS ARP table, ICMP ping sweep, netifaces
- **Endpoint**: Windows Security Event Log, Sysmon (pywin32, ctypes)
