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
| **[`scripts/build_user_app.bat`](scripts/build_user_app.bat)** | Compiles Vite UI and packages the standalone Windows desktop application. |
| **[`scripts/build_sensor_exe.bat`](scripts/build_sensor_exe.bat)** | Builds the standalone Windows endpoint sensor executable with PyInstaller. |
| **[`scripts/start_all.bat`](scripts/start_all.bat)** | Starts the backend server and frontend console simultaneously. |
| **[`scripts/start_backend.bat`](scripts/start_backend.bat)** | Launches the Flask REST API service (`http://127.0.0.1:5000`). |
| **[`scripts/start_frontend.bat`](scripts/start_frontend.bat)** | Launches the React Enterprise SOC Console (`http://localhost:5173`). |
| **[`scripts/stop_all.bat`](scripts/stop_all.bat)** | Stops all running SentinelTwin local processes. |

---

## 📦 Individual Desktop App Package

For direct deployment or testing on separate laptops:
- **`app_test/`**: Contains the standalone `SentinelTwin-User.exe` application, config file, unpacked directory, and source code.
