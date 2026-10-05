"""
Centralized Configuration Module
================================
This module defines application-wide configuration parameters with fallback defaults
and environment variable overrides.

All configuration is accessible via the singleton instance `config = Config()`.
"""
import os
import secrets
import logging
from pathlib import Path

logger = logging.getLogger(__name__)

# Base repository root directory (sentineltwin/sentineltwin)
BASE_DIR = Path(__file__).resolve().parent.parent

# Insecure placeholder values prohibited in production environments
INSECURE_SECRETS = {
    "sentinel-insecure-dev-secret-key-change-in-prod",
    "sentinel-sensor-auth-token-xyz",
    "secret",
    "admin123",
    "password",
    "changeme",
    "default",
    "sentinel-secret",
    "sentinel-token",
    "<generate-a-strong-random-secret>",
    "<generate-a-strong-random-token>",
    "<provided through environment>",
}

def _load_dotenv_safely():
    """Safely loads environment variables from .env file if present, without overriding existing vars."""
    env_paths = [
        BASE_DIR / ".env",
        Path.cwd() / ".env",
    ]
    for env_file in env_paths:
        if env_file.is_file():
            try:
                import dotenv
                dotenv.load_dotenv(dotenv_path=env_file, override=False)
                return
            except ImportError:
                pass
            try:
                with open(env_file, "r", encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if not line or line.startswith("#"):
                            continue
                        if "=" in line:
                            key, val = line.split("=", 1)
                            key = key.strip()
                            val = val.strip().strip("'\"")
                            if key and key not in os.environ:
                                os.environ[key] = val
                return
            except Exception as e:
                logger.warning(f"Failed to read .env file at {env_file}: {e}")

class Config:
    """
    Centralized configuration container for SentinelTwin backend services.
    Enforces fail-closed secret validation in production while providing safe,
    ephemeral random credentials for local development and testing.
    """
    def __init__(self):
        self.reload()

    def reload(self):
        """Loads and validates configuration from environment variables."""
        _load_dotenv_safely()

        # Environment mode (development / production / testing)
        self.ENV = os.getenv("FLASK_ENV", "development").strip().lower()
        # Debug mode flag enables hot-reloading and detailed traceback in development
        self.DEBUG = os.getenv("FLASK_DEBUG", "False").lower() in ("true", "1", "t")
        # Network bind port and host for Flask REST API (defaults to localhost for presentation safety)
        self.PORT = int(os.getenv("PORT", 5000))
        self.HOST = os.getenv("HOST", "127.0.0.1")

        # Primary SQLite database file location: defaults to sentineltwin/data/sentineltwin.db
        self.DB_PATH = os.getenv("DB_PATH", str(BASE_DIR / "data" / "sentineltwin.db"))
        # Retention period in days for historical event logs before archiving
        self.EVENT_RETENTION_DAYS = int(os.getenv("EVENT_RETENTION_DAYS", 30))

        self.JWT_EXPIRATION_HOURS = int(os.getenv("JWT_EXPIRATION_HOURS", 24))

        # --- Multi-Device & Connectivity Configuration ---
        # Number of seconds without telemetry heartbeat before an endpoint is marked 'offline' (5 minutes)
        self.DEVICE_OFFLINE_TIMEOUT_SECONDS = int(os.getenv("DEVICE_OFFLINE_TIMEOUT_SECONDS", 300))

        # Cloud relay synchronization settings (optional Google Drive fallback relay)
        self.GOOGLE_DRIVE_FOLDER_ID = os.getenv("GOOGLE_DRIVE_FOLDER_ID", "")
        self.GOOGLE_DRIVE_CREDENTIALS = os.getenv("GOOGLE_DRIVE_CREDENTIALS", "")
        self.GOOGLE_DRIVE_SYNC_DIR = os.getenv("GOOGLE_DRIVE_SYNC_DIR", str(BASE_DIR / "data" / "drive_relay"))

        # Allowed CORS Origins: Allows frontend dev server (Vite port 5173 or alternative 3000)
        self.CORS_ORIGINS = [
            origin.strip()
            for origin in os.getenv("CORS_ORIGINS", "http://localhost:5173,http://localhost:3000,http://127.0.0.1:5173").split(",")
            if origin.strip()
        ]

        # --- CyberDNA Behavioral Modeling Parameters ---
        # Minimum observations required before an entity's baseline is considered statistically valid
        self.CYBERDNA_MIN_SAMPLES = int(os.getenv("CYBERDNA_MIN_SAMPLES", 3))
        # Standard deviation multiplier (z-score) above which an action is flagged as a behavioral anomaly
        self.CYBERDNA_ANOMALY_THRESHOLD = float(os.getenv("CYBERDNA_ANOMALY_THRESHOLD", 3.0))
        # Higher threshold used to gate high-confidence alerts triggering propagation simulation in CyberTwin
        self.CYBERDNA_GATE_THRESHOLD = float(os.getenv("CYBERDNA_GATE_THRESHOLD", 3.5))

        # --- Cryptographic Secrets & Sensor Authentication ---
        raw_secret = os.getenv("SECRET_KEY", "").strip()
        raw_sensor_token = os.getenv("SENSOR_TOKEN", "").strip()

        is_prod = self.ENV == "production"

        if is_prod:
            self._validate_secret_for_prod("SECRET_KEY", raw_secret)
            self._validate_secret_for_prod("SENSOR_TOKEN", raw_sensor_token)
            self.SECRET_KEY = raw_secret
            self.SENSOR_TOKEN = raw_sensor_token
        else:
            # Development / Testing fallback: generate cryptographically secure ephemeral random secrets if unconfigured
            if raw_secret and raw_secret.lower() not in INSECURE_SECRETS:
                self.SECRET_KEY = raw_secret
            else:
                self.SECRET_KEY = secrets.token_hex(32)
                logger.warning(
                    "[SECURITY] SECRET_KEY is not configured or uses a placeholder. "
                    "Generated ephemeral random secret key for non-production session."
                )

            if raw_sensor_token and raw_sensor_token.lower() not in INSECURE_SECRETS:
                self.SENSOR_TOKEN = raw_sensor_token
            else:
                self.SENSOR_TOKEN = secrets.token_hex(24)
                logger.warning(
                    "[SECURITY] SENSOR_TOKEN is not configured or uses a placeholder. "
                    "Generated ephemeral random sensor token for non-production session."
                )

    def _validate_secret_for_prod(self, name: str, val: str):
        if not val:
            raise RuntimeError(
                f"Production configuration error: '{name}' environment variable is required and cannot be empty. "
                "Ensure strong secrets are supplied via environment variables."
            )
        if val.lower() in INSECURE_SECRETS:
            raise RuntimeError(
                f"Production configuration error: '{name}' must not be a known default, predictable value, or placeholder."
            )
        if len(val) < 16:
            raise RuntimeError(
                f"Production configuration error: '{name}' is too short (minimum 16 characters required for production)."
            )

    def validate(self):
        """Explicit validation method callable on application startup."""
        if self.ENV == "production":
            self._validate_secret_for_prod("SECRET_KEY", self.SECRET_KEY)
            self._validate_secret_for_prod("SENSOR_TOKEN", self.SENSOR_TOKEN)

config = Config()
