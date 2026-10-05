"""
SentinelTwin Telemetry & Attack Simulation Script (Dynamic IDs)
"""
import os
import time
import requests
from datetime import datetime, timezone

BACKEND_URL = os.getenv("BACKEND_URL", "http://127.0.0.1:5000").rstrip("/")
SENSOR_TOKEN = os.getenv("SENSOR_TOKEN", "").strip()
HEADERS = {"Content-Type": "application/json"}
if SENSOR_TOKEN:
    HEADERS["X-Sensor-Token"] = SENSOR_TOKEN

def current_time():
    return datetime.now(timezone.utc).isoformat()

def get_unique_base_id():
    # Uses timestamp epoch to guarantee unique record IDs on every execution
    return int(time.time() * 1000) % 1_000_000_000

def run_simulation():
    base_id = get_unique_base_id()
    print("\n=======================================================")
    print("  SENTINELTWIN TELEMETRY & ATTACK SIMULATION RUNNER")
    print("=======================================================\n")

    # -------------------------------------------------------------------
    # TEST 1: Establish Normal CyberDNA Baselines (5 Events)
    # -------------------------------------------------------------------
    print("[*] Stage 1: Ingesting routine logon events to establish baseline...")
    for i in range(1, 6):
        payload = {
            "event_id": 4624,
            "record_id": base_id + i,
            "channel": "Security",
            "device_id": "dev-corp-workstation-01",
            "computer": "CORP-WS01",
            "event_timestamp": current_time(),
            "user": "analyst",
            "source_ip": "10.0.4.15",
            "logon_type": "2"
        }
        res = requests.post(f"{BACKEND_URL}/api/events/ingest", json=payload, headers=HEADERS)
        if res.status_code == 201:
            risk = res.json().get("risk", {})
            print(f"  [+] Ingested baseline event #{i} (Score: {risk.get('risk_score')}, Severity: {risk.get('severity')})")
        else:
            print(f"  [-] Failed event #{i}: {res.status_code} - {res.text}")
        time.sleep(0.1)

    # -------------------------------------------------------------------
    # TEST 2: CyberDNA Statistical Behavioral Anomaly
    # -------------------------------------------------------------------
    print("\n[*] Stage 2: Injecting high-frequency logon surge (CyberDNA statistical anomaly)...")
    sim_payload = {
        "metric_key": "evt_4624_freq",
        "device_id": "dev-corp-workstation-01",
        "observation": 85.0,
        "gate_anomalies": True
    }
    res = requests.post(f"{BACKEND_URL}/api/cyberdna/simulate", json=sim_payload)
    if res.status_code == 200:
        data = res.json()
        print(f"  [!] Observation: {data.get('observation')}")
        print(f"  [!] Computed Z-Score: {data.get('z_score')} sigma")
        print(f"  [!] Anomaly Gated/Flagged: {data.get('is_anomaly')}")

    # -------------------------------------------------------------------
    # TEST 3: Suspicious Process Execution (Event 4688)
    # -------------------------------------------------------------------
    print("\n[*] Stage 3: Injecting suspicious process execution (Event 4688)...")
    attack_payload = {
        "event_id": 4688,
        "record_id": base_id + 100,
        "channel": "Security",
        "device_id": "dev-corp-workstation-01",
        "computer": "CORP-WS01",
        "event_timestamp": current_time(),
        "user": "analyst",
        "process_name": "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
        "parent_process": "C:\\Program Files\\Microsoft Office\\root\\Office16\\WINWORD.EXE",
        "command_line": "powershell.exe -nop -w hidden -EncodedCommand SQBFAFgAIAAoAE4AZQB3AC0ATwBiAGoAZQBjAHQA",
        "source_ip": "10.0.4.15"
    }
    res = requests.post(f"{BACKEND_URL}/api/events/ingest", json=attack_payload, headers=HEADERS)
    if res.status_code == 201:
        risk = res.json().get("risk", {})
        print(f"  [ALERT] Status: 201 Created")
        print(f"  [ALERT] Risk Score: {risk.get('risk_score')}/100 ({risk.get('severity')})")
        for contributor in risk.get("contributors", []):
            print(f"          - [{contributor.get('category')}]: +{contributor.get('points')} pts ({contributor.get('detail')})")

    # -------------------------------------------------------------------
    # TEST 4: Failed Logon Spikes (Event 4625)
    # -------------------------------------------------------------------
    print("\n[*] Stage 4: Injecting failed logon burst (Event 4625)...")
    for i in range(1, 4):
        fail_payload = {
            "event_id": 4625,
            "record_id": base_id + 200 + i,
            "channel": "Security",
            "device_id": "dev-corp-workstation-01",
            "computer": "CORP-WS01",
            "event_timestamp": current_time(),
            "user": "Administrator",
            "source_ip": "192.168.1.200",
            "logon_type": "3"
        }
        res = requests.post(f"{BACKEND_URL}/api/events/ingest", json=fail_payload, headers=HEADERS)
        if res.status_code == 201:
            risk = res.json().get("risk", {})
            print(f"  [!] Failed Logon #{i} logged (Score: {risk.get('risk_score')})")

    # -------------------------------------------------------------------
    # TEST 5: Lateral Movement Opportunities
    # -------------------------------------------------------------------
    print("\n[*] Stage 5: Simulating lateral propagation opportunities in Cyber Twin...")
    prop_payload = {
        "source_node_id": "dev-corp-workstation-01",
        "source_risk": 85
    }
    res = requests.post(f"{BACKEND_URL}/api/cyber_twin/propagate", json=prop_payload)
    if res.status_code == 200:
        paths = res.json().get("potential_propagation_paths", [])
        print(f"  [+] Calculated {len(paths)} potential lateral movement pathways")
        for p in paths:
            print(f"      -> Target: {p.get('target_node')} | Opportunity Score: {p.get('propagation_opportunity_score')}")

    print("\n=======================================================")
    print("  SIMULATION COMPLETE! Check http://localhost:5173 to view alerts.")
    print("=======================================================\n")

if __name__ == "__main__":
    run_simulation()