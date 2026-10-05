# SentinelTwin Design System & UI Specification (`DESIGN.md`)

> **Approved Stitch Project Reference**: [Stitch Project 3876854447689394318](https://stitch.google.com/projects/3876854447689394318)  
> **Design Name**: Monochrome Tactical SOC  
> **Status**: Approved Visual Reference  
> **Target Platform**: SentinelTwin Enterprise SOC & Behavioral Intelligence Platform  
> **Scope**: React Frontend (`frontend/src/`)  

---

## 1. Brand & Style

This design system targets Tier-2 and Tier-3 Security Operations Center (SOC) analysts, digital forensics responders, and threat hunters working under high cognitive load. The UI embodies absolute operational rigor, mathematical explainability, and uncompromising precision. It decisively rejects the noisy visual clichés of modern dashboards—there are zero ambient decorative glows, zero rainbow severity indicators, and zero artificial skeuomorphic terminal tropes. 

The aesthetic is grounded in **Technical Brutalist Minimalism**:
- **Utilitarian Discipline:** Every pixel, border, and character serves data triage or incident response. 
- **Monochrome Luminance Hierarchy:** Visual priority is communicated strictly through controlled luminance levels (from deep pitch blacks through zinc gradations to stark, crisp white) rather than chromatic noise.
- **Micro-Tactile Precision:** Crisp 1px structural framing, hyper-dense tables, sharp data dividers, and instantaneous micro-interactions create an authoritative, hardware-grade instrumentation console.

### 1.1 The Operational Telemetry Pipeline
$$\text{Observe} \longrightarrow \text{Understand} \longrightarrow \text{Detect} \longrightarrow \text{Score} \longrightarrow \text{Simulate} \longrightarrow \text{Respond}$$
1. **Observe (Windows Sensor)**: Real-time Windows Event Logs & Sysmon streaming.
2. **Understand (CyberDNA)**: Baseline learning via Welford’s algorithm & EWMA drift.
3. **Detect (Threat Detection)**: MITRE ATT&CK behavioral anomaly rules.
4. **Score (Risk Engine)**: Deterministic 0–100 point-attribution scoring.
5. **Simulate (Digital Twin)**: Graph-based lateral movement reachability & blast radius.
6. **Respond (Operator Triage)**: Containment, authorization revocation, and evidence export.

---

## 2. Colors & Palette Mechanics

The system uses a strict monochrome scale where threat severity, alert levels, and priority are communicated using contrast inversion and luminance weighting rather than saturated hues.

### 2.1 Palette Mechanics
- **The Obsidian Foundation (`#000000` / `#050505`):** Complete blackness grounds the main canvas, maximizing contrast, reducing eye strain in dark control rooms, and isolating analytic panels.
- **Layered Charcoal Surfaces (`#0c0c0e`, `#141416`, `#1c1c20`):** Successive structural surfaces introduce visual depth purely through stepped tonal values without saturation.
- **Monochrome Precision Borders (`#1c1c1f`, `#26262a`, `#333338`):** Micro-borders provide unambiguous spatial boundaries between dense data cards, terminal panes, and inspection inspectors.
- **Luminance Inversion Severity Model:**
  - *Nominal / Baseline:* Outlined zinc badges (`text-secondary` on subtle slate borders). Quiet, low contrast.
  - *Suspicious / Elevated:* Medium-high luminance zinc (`#d4d4d8`) on intermediate surface with 1px solid borders.
  - *Hostile / Critical Threat:* **Absolute Stark Inversion**—bold stark white background (`#ffffff`) with pitch-black text (`#000000`). This inverse flash immediately commands the eye within a sea of dark telemetry without requiring fluorescent alerts.

### 2.2 Approved Token Values

| Token | Dark Mode (Primary SOC) | Light Mode (Day Operations) | Role |
| :--- | :--- | :--- | :--- |
| `bg-canvas` | `#000000` | `#f4f6f9` | Deep ground plane |
| `bg-page` | `#050505` | `#f4f6f9` | Active page background |
| `surface-base` | `#0c0c0e` | `#ffffff` | Primary card panels, sidebar rail, top header |
| `surface-elevated` | `#141416` | `#f8fafc` | Nested cards, toolbars, inner wells |
| `surface-interactive` | `#1c1c20` | `#f1f5f9` | Hover states, active selection, flyout menus |
| `surface-active` | `#27272a` | `#e2e8f0` | Pressed and active control fills |
| `border-subtle` | `#1c1c1f` | `#edf2f7` | Table row dividers, subtle rules |
| `border-base` | `#26262a` | `#e2e8f0` | Primary 1px panel framing |
| `border-strong` | `#333338` | `#cbd5e1` | Prominent borders, active inputs |
| `border-focus` | `#ffffff` | `#090d14` | High-visibility focus indicators |
| `text-primary` | `#ffffff` | `#090d14` | Primary headings, prominent values, critical status |
| `text-secondary` | `#a1a1aa` | `#334155` | Body text, labels, secondary metadata |
| `text-muted` | `#71717a` | `#64748b` | Timestamps, table headers, breadcrumbs |
| `text-faint` | `#3f3f46` | `#94a3b8` | Empty states, disabled indicators |
| `status-hostile-bg` | `#ffffff` | `#ef4444` | Critical threat stark white flash (dark) / crimson (light) |
| `status-hostile-fg` | `#000000` | `#ffffff` | Inverted typography for critical threat |

---

## 3. Typography

The typography implements a strict semantic division between operational language (Inter) and machine-verified forensic telemetry (JetBrains Mono). Monospaced types are never used frivolously.

### 3.1 Typographic Distribution
- **Inter (Operational & Governance Layer):** Applied to view titles, module headers, modal prompts, risk point justifications, analyst triage summaries, and form action triggers. Inter maintains maximum legibility across variable-density grids.
- **JetBrains Mono (Forensic & Telemetry Layer):** Strictly mandatory for:
  - Device hostnames, GUIDs, and MAC addresses (`ST-DEVICE-0629550D`, `00:50:56:C0:00:01`)
  - IPv4/IPv6 endpoints, CIDRs, and ports (`192.168.1.112:445`)
  - Sysmon command paths, process trees, and parent execution traces (`C:\Windows\System32\schtasks.exe`)
  - MITRE ATT&CK IDs (`T1059.001`, `T1078`)
  - High-precision telemetry metrics, latency numbers, and UTC timestamps (`122ms`, `2024-10-18T14:22:01.002Z`)
  - Numerical risk scores (`100/100`, `+35 pts`)

---

## 4. Vertical Navigation Dock (Motion Primitives)

- **Foundation:** Adapted Motion Primitives vertical Dock component.
- **Placement:** Left sidebar navigation rail.
- **Frame:** Width 68px collapsed (`w-[68px]`) expanding to 240px (`w-60`). Background `#0c0c0e`, border-right 1px `#26262a`.
- **Navigation Groups:**
  - `CORE`: Overview
  - `MONITOR`: Devices, Events, Alerts (with badge count)
  - `INTELLIGENCE`: CyberDNA, Risk Analysis, Incidents (with badge count)
  - `DIGITAL TWIN`: Network, Digital Twin & Sims
- **Spring Physics:** Magnification `1.05x`, distance `90`, spring stiffness `350`, damping `30`.
- **Active State:** Spring indicator pill (`layoutId="activeNavPill"`) on expanded mode; spring indicator dot on collapsed mode with `#1c1c20` background and high-contrast text.
- **Tooltips (`DockLabel`):** Floating tooltips on the right (`left-full ml-3`) with unclipped `z-50` isolation, rendering route name and unread badge counts in `mono-data-sm`.

---

## 5. Components & Geometry

- **Geometry:** Semi-sharp 4px radius (`rounded`) across cards, buttons, badges, and inputs. Large bubble radiuses are avoided.
- **High-Density Telemetry Tables:** 32px row height, `#0c0c0e` background with 1px `#26262a` borders, alternating `#141416` hover rows, uppercase column headers in `label-caps` (`#71717a`).
- **Telemetry Stream & Pipeline Ribbon:** Compact 6-stage telemetry lifecycle (`Observe → Understand → Detect → Score → Simulate → Respond`).
- **Action Triggers:** High-contrast buttons with solid `#ffffff` fill for critical primary containment and `#141416` with `#26262a` borders for secondary analysis actions.
- **Data Integrity Guarantee:** All visual styles connect directly to live Flask APIs on port 5000 and real database tables; no mock data substitution.
