"""
Official Windows Telemetry Sensor
"""
import os
import json
import logging
import requests
from pathlib import Path
from sensor.parsers import parse_windows_event_xml

logger = logging.getLogger(__name__)
CHECKPOINT_FILE = Path("data") / "sensor_checkpoint.json"

class WindowsTelemetrySensor:
    def __init__(self, backend_url: str = "http://127.0.0.1:5000", sensor_token: str = None):
        self.backend_url = backend_url.rstrip("/")
        self.sensor_token = (sensor_token if sensor_token is not None else os.getenv("SENSOR_TOKEN", "")).strip()
        if not self.sensor_token:
            logger.warning("SENSOR_TOKEN is not configured; sensor telemetry requests may be rejected by the backend.")
        self.checkpoints = self._load_checkpoints()

    def _load_checkpoints(self) -> dict:
        if CHECKPOINT_FILE.exists():
            try:
                with open(CHECKPOINT_FILE, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception as e:
                logger.error(f"Error loading checkpoint file: {e}")
        return {}

    def _save_checkpoint(self, channel: str, record_id: int):
        self.checkpoints[channel] = max(self.checkpoints.get(channel, 0), record_id)
        CHECKPOINT_FILE.parent.mkdir(parents=True, exist_ok=True)
        with open(CHECKPOINT_FILE, "w", encoding="utf-8") as f:
            json.dump(self.checkpoints, f, indent=2)

    def process_and_submit_xml(self, xml_content: str) -> bool:
        normalized = parse_windows_event_xml(xml_content)
        if not normalized or not normalized.get("record_id"):
            return False

        channel = normalized["channel"]
        record_id = normalized["record_id"]
        last_processed = self.checkpoints.get(channel, 0)

        if record_id <= last_processed:
            logger.debug(f"Skipping already processed record {record_id} in {channel}")
            return True

        headers = {
            "Content-Type": "application/json",
            "X-Sensor-Token": self.sensor_token
        }

        try:
            res = requests.post(
                f"{self.backend_url}/api/events/ingest",
                json=normalized,
                headers=headers,
                timeout=5.0
            )
            if res.status_code in (200, 201, 409):
                self._save_checkpoint(channel, record_id)
                return True
            else:
                logger.warning(f"Backend rejected event ({res.status_code}): {res.text}")
                return False
        except Exception as e:
            logger.error(f"Network failure submitting event: {e}")
            return False