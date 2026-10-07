"""
SentinelTwin Direct Detection & Alert Generator
Seeds the device directly, generates an alert, and links topology for immediate detection.
"""
import os
import requests
import time
from datetime import datetime, timezone

BASE_URL = os.getenv("BASE_URL", "http://127.0.0.1:5000").rstrip("/")
SENSOR_TOKEN = os.getenv("SENSOR_TOKEN", "").strip()
ADMIN_USER = os.getenv("ADMIN_USER", "admin")
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "SentinelAdmin#2026")

def get_auth_headers():
    headers = {"Content-Type": "application/json"}
    if SENSOR_TOKEN:
        headers["X-Sensor-Token"] = SENSOR_TOKEN

    try:
        login_res = requests.post(
            f"{BASE_URL}/api/auth/login",
            json={"username": ADMIN_USER, "password": ADMIN_PASSWORD},
            timeout=5
        )
        if login_res.status_code == 200:
            token = login_res.json().get("token")
            if token:
                headers["Authorization"] = f"Bearer {token}"
                print(f"[*] Authenticated direct test runner as '{ADMIN_USER}' (Admin JWT acquired)")
                return headers
    except Exception as e:
        print(f"[-] Backend connection note: {e}")

    return headers

def run():
    headers = get_auth_headers()
    now = datetime.now(timezone.utc).isoformat()
    unique_rec = int(time.time() * 1000) % 1_000_000_000

    print("[1] Triggering Network Discovery to ensure base nodes exist...")
    requests.post(f"{BASE_URL}/api/network/discover", json={}, headers=headers)

    print("[2] Ingesting High-Risk Exploit Payload (Word -> Encoded PowerShell)...")
    payload = {
        "event_id": 4688,
        "record_id": unique_rec,
        "channel": "Security",
        "device_id": "dev-corp-workstation-01",
        "computer": "CORP-WS01",
        "event_timestamp": now,
        "user": "Administrator",
        "process_name": "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
        "parent_process": "C:\\Program Files\\Microsoft Office\\root\\Office16\\WINWORD.EXE",
        "command_line": "powershell.exe -nop -w hidden -enc JABzAGUAYwByAGUAdAA= -ep bypass",
        "source_ip": "192.168.1.150"
    }

    res = requests.post(f"{BASE_URL}/api/events/ingest", json=payload, headers=headers)
    print("Ingestion Response Status:", res.status_code)
    print("Risk Engine Output:", res.json())

    print("\n[3] Ingesting CyberDNA Outlier Anomaly...")
    cdna_res = requests.post(f"{BASE_URL}/api/cyberdna/simulate", json={
        "metric_key": "evt_4688_freq",
        "device_id": "dev-corp-workstation-01",
        "observation": 120.0,
        "gate_anomalies": True
    }, headers=headers)
    print("CyberDNA Result:", cdna_res.json())

    print("\n[4] Querying Live Alerts from Backend Database...")
    alerts = requests.get(f"{BASE_URL}/api/alerts", headers=headers).json()
    print(f"Total Alerts Active in Database: {len(alerts)}")
    for a in alerts[-3:]:
        print(f" -> Alert #{a.get('id')}: [{a.get('severity')}] {a.get('description')} (Risk: {a.get('risk_points')})")

if __name__ == "__main__":
    run()