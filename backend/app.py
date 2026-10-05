"""
SentinelTwin Flask Application Factory
=======================================
This module defines the primary entry point and factory function `create_app()`
for the SentinelTwin REST backend.

Key responsibilities:
  1. Initialize Flask application instance and configure security secrets.
  2. Configure Cross-Origin Resource Sharing (CORS) for dashboard communication.
  3. Ensure database tables and schema migrations are initialized on startup.
  4. Register API route blueprints (`/api/*`).
  5. Define centralized HTTP error handlers (404, 500).
"""
import logging
from flask import Flask, jsonify
from flask_cors import CORS
from backend.config import config
from backend.database.db import init_db
from backend.api.routes import api_bp

# Set up unified logging format for all backend modules
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger(__name__)

def create_app(db_path: str = None) -> Flask:
    """
    Application Factory: Creates, configures, and returns a new Flask app instance.

    Using the factory pattern allows testing with isolated temporary databases
    without mutating global application state.

    Args:
        db_path (str, optional): Target SQLite database path. Defaults to config.DB_PATH.

    Returns:
        Flask: Fully configured Flask WSGI application.
    """
    # Enforce configuration validation (fail-closed in production)
    config.validate()

    app = Flask(__name__)

    # Determine database path: prioritize passed argument (e.g., in unit tests),
    # otherwise fallback to centralized config.py
    target_db = db_path or config.DB_PATH
    app.config["SECRET_KEY"] = config.SECRET_KEY
    app.config["DB_PATH"] = target_db

    # Configure Cross-Origin Resource Sharing (CORS):
    # Allows the Vite + React frontend (running on e.g. localhost:5173) to communicate
    # with the Flask backend on localhost:5000, passing required sensor authentication headers.
    CORS(
        app,
        resources={r"/api/*": {"origins": config.CORS_ORIGINS}},
        supports_credentials=True,
        methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allow_headers=["Content-Type", "Authorization", "X-Sensor-Token", "X-Device-Id", "X-Transport-Mode"]
    )

    # Initialize SQLite database: Creates tables (devices, events, alerts, etc.) if they do not exist
    init_db(target_db)

    # Register API blueprint for all endpoints prefixed with /api
    app.register_blueprint(api_bp, url_prefix="/api")

    # --- Centralized HTTP Error Handlers ---

    @app.errorhandler(404)
    def not_found(e):
        """Standardized JSON response for non-existent API routes."""
        return jsonify({"error": "Resource not found"}), 404

    @app.errorhandler(500)
    def internal_error(e):
        """Standardized JSON response for unhandled server exceptions, preventing stack leak."""
        logger.error(f"Internal server error: {e}")
        return jsonify({"error": "Internal server error"}), 500

    return app

if __name__ == "__main__":
    # When executed directly, run the development WSGI server
    app = create_app()
    logger.info(f"Starting SentinelTwin on {config.HOST}:{config.PORT}")
    app.run(host=config.HOST, port=config.PORT, debug=config.DEBUG)
