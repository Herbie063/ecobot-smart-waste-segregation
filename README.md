# ECOBOT Frontend Prototype

A browser-ready, frontend-only UI/UX prototype for the project **“Design, Implementation, and Performance Evaluation of a Dual-Mode Wireless Vision-Based Robotic Arm System for Automated Campus Solid Waste Segregation.”**

The prototype is intended for webpage exploration, navigation walkthroughs, and discussion of the future backend integration. It does **not** connect to a real camera, sensor, database server, Wi-Fi/RF module, or Dobot Magician.

## Open the prototype

1. Download and extract `ecobot-frontend.zip`.
2. Open `index.html` in a modern browser (Chrome, Edge, or Firefox).
3. Use the left navigation to explore the pages.

No package installation, build process, or web server is required. Google Fonts are used when internet access is available; the system falls back to local sans-serif fonts otherwise.

## Pages included

| Page | Purpose |
|---|---|
| Overview | Project status, sample KPIs, activity feed, system pipeline, and sensor health. |
| Live sorting | Camera-style preview, selected classification, sample sensor fusion signals, and a simulated sorting cycle. |
| Dobot remote | Mock wired/wireless selector, connect/disconnect, X/Y/Z/R jogging, coordinate readouts, speed, end-effector selection, tool toggle, home, and emergency stop. |
| Waste records | Search/filter mock records and export them as CSV. |
| Analytics | Sample category distribution, detection accuracy, sorting success, cycle time, and wired/wireless latency values. |
| System & safety | Toggle demo sensor states, change communication mode, inspect safety interlock, and reset the mock E-stop state. |

## How to explore the Dobot remote page

1. Open **Dobot remote** from the left navigation.
2. Select **Wired / USB** or **Wireless / RF**. The status indicators and simulated latency update.
3. Use the X−/X+, Y−/Y+, Z−/Z+, and R−/R+ buttons to change the coordinate readouts in 5 mm / 5° increments.
4. Select **Home** to restore the example home coordinates.
5. Switch between the **Suction cup** and **Gripper** end-effectors. The tool toggle demonstrates a UI state only.
6. Use **Emergency stop** in the top bar (or Stop in the remote panel). The demo latches the stop state and disables motion controls. Visit **System & safety** to reset the simulated interlock.
7. On **Live sorting**, choose a category and run a demo cycle. It adds a mock waste record and updates the category totals and activity feed.

## Mock database and persistence

- `data/mock-data.js` contains the JavaScript seed dataset used by the pages.
- `data/mock-database.json` contains an equivalent example data structure intended for backend/API planning.
- The UI keeps demo changes in browser `localStorage` under `ecobot_frontend_demo_v1`. Use **System & safety → Refresh demo state** to restore the seed state.
- `database/schema.sql` is a suggested relational database schema and API boundary reference. It is documentation only; no database is created or connected.

## Suggested backend integration boundary

The frontend has clear interaction points that can later be wired to an API:

- System status and sensor availability → `GET /api/system/status`
- Waste history → `GET /api/waste-records`
- Analytics → `GET /api/analytics/summary`
- Robot telemetry → `GET /api/telemetry/latest`
- Connect / movement / home / end-effector → `POST /api/robot/*`
- Emergency stop event → `POST /api/robot/emergency-stop`

For a real Dobot Magician integration, the browser should communicate with a trusted local service or gateway rather than directly assuming that a web page can safely drive the robot. The gateway should validate every command and enforce workspace limits, communication timeouts, homing rules, user permissions, and robot-specific protocol requirements.

**Critical safety note:** A webpage emergency-stop button is not a safety-rated emergency stop. The actual robot cell must have an independently wired, fail-safe emergency stop circuit and hardware interlocks. The browser UI must never be the only safety layer.

## Project structure

```text
ecobot-frontend/
├── index.html
├── styles.css
├── app.js
├── README.md
├── data/
│   ├── mock-data.js
│   └── mock-database.json
└── database/
    └── schema.sql
```
