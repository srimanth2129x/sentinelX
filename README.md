# SentinelX

**Cyber Behavior + Network Impact Intelligence Platform**

Real Network · Real Telemetry · Explainable Detection · Graph-Based Simulation · Standalone Desktop App

---

## 📚 Documentation

All detailed guides, runbooks, and architecture documents are organized in the [`doc/`](doc/) directory:

- 📖 **[Main Project Documentation](doc/README.md)**: Architecture overview, pipeline design, and stack details.
- 📘 **[Operations & Desktop Runbook](doc/RUNBOOK.md)**: Comprehensive installation, packaging, and distribution runbook.
- 📄 **[Operations Manual (DOCX)](doc/SentinelTwin_Operations_and_Runbook.docx)**: Full Microsoft Word operational manual.

---

## 🚀 Scripts & Service Automation

All launchers and build scripts are organized in the [`scripts/`](scripts/) directory:

| Script | Description |
| :--- | :--- |
| **[`scripts/build_sensor_exe.bat`](scripts/build_sensor_exe.bat)** | Builds the standalone Windows endpoint sensor executable with PyInstaller. |
| **[`scripts/start_all.bat`](scripts/start_all.bat)** | Starts the backend server and frontend console simultaneously. |
| **[`scripts/start_backend.bat`](scripts/start_backend.bat)** | Launches the Flask REST API service (`http://127.0.0.1:5000`). |
| **[`scripts/start_frontend.bat`](scripts/start_frontend.bat)** | Launches the React Enterprise SOC Console (`http://localhost:5173`). |
| **[`scripts/stop_all.bat`](scripts/stop_all.bat)** | Stops all running SentinelTwin local processes. |

---

## 🖥️ Desktop Application & Migration Roadmap

> [!NOTE]
> **Status: Repository Cleanup & Migration Baseline Preparation**
> The project is currently preparing for an architectural modernization. The new components have not yet been implemented; the current codebase serves as the migration and verification baseline.

- **Retired Component**: The legacy Electron individual-user application (`individual-user-app/` and related build scripts) has been fully retired and removed from the active repository.
- **Planned Desktop Client**: A high-performance, native desktop application built with **Tauri 2 + Rust** and **React + TypeScript + Vite** is planned for the next implementation phase.
- **Planned Backend Modernization**: Migration from the current Flask service to **FastAPI + Python** is planned.
- **Planned Central Storage**: Migration from SQLite to **PostgreSQL** is planned for centralized production data persistence.
- **Migration Baseline**: The existing **Flask REST API**, **SQLite** database, and **React SOC Console** remain the active baseline and behavioral reference during this transition.
- **Windows Telemetry Sensor**: The standalone **Windows Telemetry Sensor** (`sensor/`, `scripts/build_sensor_exe.bat`, and `release/SentinelTwin-Sensor.exe`) remains a fully supported, active, and verified core component.
