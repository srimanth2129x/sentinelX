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
HEADERS = {"Content-Type": "application/json"}
if SENSOR_TOKEN:
    HEADERS["X-Sensor-Token"] = SENSOR_TOKEN

def run():
    now = datetime.now(timezone.utc).isoformat()
    unique_rec = int(time.time() * 1000) % 1_000_000_000

    print("[1] Triggering Network Discovery to ensure base nodes exist...")
    requests.post(f"{BASE_URL}/api/network/discover", json={})

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

    res = requests.post(f"{BASE_URL}/api/events/ingest", json=payload, headers=HEADERS)
    print("Ingestion Response Status:", res.status_code)
    print("Risk Engine Output:", res.json())

    print("\n[3] Ingesting CyberDNA Outlier Anomaly...")
    cdna_res = requests.post(f"{BASE_URL}/api/cyberdna/simulate", json={
        "metric_key": "evt_4688_freq",
        "device_id": "dev-corp-workstation-01",
        "observation": 120.0,
        "gate_anomalies": True
    })
    print("CyberDNA Result:", cdna_res.json())

    print("\n[4] Querying Live Alerts from Backend Database...")
    alerts = requests.get(f"{BASE_URL}/api/alerts").json()
    print(f"Total Alerts Active in Database: {len(alerts)}")
    for a in alerts[-3:]:
        print(f" -> Alert #{a.get('id')}: [{a.get('severity')}] {a.get('description')} (Risk: {a.get('risk_points')})")

if __name__ == "__main__":
    run()