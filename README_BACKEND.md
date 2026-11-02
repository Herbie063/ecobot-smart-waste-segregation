# ECOBOT Backend Setup (Flask + SQLite + Dobot Magician)

This adds a local Python backend to the existing ECOBOT frontend. It is designed
for VS Code and serves the existing `index.html`, `styles.css`, and `app.js`.

## Files to keep in the same project folder

```text
ecobot-frontend/
├── app.py                  # Flask REST API + SQLite endpoints
├── dobot_controller.py     # Simulation + actual Dobot Python driver wrapper
├── requirements.txt        # Python dependencies
├── .env.example            # Backend/hardware configuration template
├── app.js                  # Updated frontend; calls the Flask API over HTTP
├── index.html
├── styles.css
├── data/
│   ├── mock-data.js
│   └── mock-database.json  # Used to seed the SQLite database once
└── database/
    ├── schema.sql
    └── ecobot.db           # Created automatically on first launch
```

## 1. Open the project in VS Code

Open the `ecobot-frontend` folder, not just `index.html`.

## 2. Create a virtual environment

Windows PowerShell:

```powershell
py -3.11 -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
```

macOS/Linux:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
pip install -r requirements.txt
```

Python 3.11+ is required by the current `pydobotlab` release.

## 3. Create your local configuration

Copy `.env.example` to `.env`. The default is safe simulation mode:

```env
ECOBOT_MODE=simulation
```

Do not change this to hardware until the robot and work cell have been checked.

## 4. Run the backend

In the VS Code terminal:

```bash
python app.py
```

Open **http://127.0.0.1:5000**. Do not use `file:///.../index.html` for API mode.
The backend creates `database/ecobot.db` and seeds it from
`data/mock-database.json` the first time it starts.

## 5. Test the API

Open these URLs in the browser:

- `http://127.0.0.1:5000/api/health`
- `http://127.0.0.1:5000/api/state`
- `http://127.0.0.1:5000/api/waste-records`
- `http://127.0.0.1:5000/api/analytics/summary`
- `http://127.0.0.1:5000/api/telemetry/latest`

The existing UI's connection, mode, jog, home, tool, speed, emergency-stop,
sensor, settings, and sorting-cycle controls now call the backend when the page
is served by Flask. Opening the HTML directly still uses its old local demo.

## 6. Switching to a real Dobot Magician

The backend uses `pydobotlab`, whose API supports the Magician's serial
connection, Cartesian pose reads, point-to-point moves, homing, speed settings,
suction cup, and gripper. The exact hardware port and mechanical setup are
installation-specific.

First connect the robot by USB, close other programs that may have the serial
port open, and identify the port (for example `COM3` on Windows or
`/dev/ttyUSB0` on Linux). Set the following in `.env`:

```env
ECOBOT_MODE=hardware
DOBOT_WIRED_PORT=COM3
DOBOT_BAUDRATE=115200
ENABLE_HARDWARE_MOTION=false
WORKSPACE_CONFIRMED=false
```

Start the backend, inspect connection/pose information, then perform the
institution's physical risk assessment and validate workspace bounds, end
effector, obstacles, and all stop circuits. Only after that should you set
`ENABLE_HARDWARE_MOTION=true` and `WORKSPACE_CONFIRMED=true`.

The default workspace bounds in `.env.example` are **illustrative software
limits copied from the demo UI**, not certified safe values for your installation.
Adjust and test them carefully. Do not enable motion based on those sample
numbers alone.

### Wireless mode

`pydobotlab` expects a serial port (COM/TTY). For a wireless link, use a
serial-transparent RF pair or a Wi-Fi-to-virtual-COM gateway that exposes the
robot's serial stream as a local COM/TTY port. Put that host-side COM/TTY name in
`DOBOT_WIRELESS_PORT`. A plain Wi-Fi network name, IP address, or HTTP URL is
not a serial port and will not work by itself. If your wireless design uses an
ESP32 TCP socket, implement and bench-test a dedicated TCP-to-Dobot-protocol
gateway before enabling robot commands over that link.

## 7. Calibrating the automatic sorting route

The backend does **not** guess your pickup or bin coordinates. To use the
hardware sorting-cycle button, calibrate these points with your robot and
fixture, then put them in `.env`:

```env
SORT_PICK_X=...
SORT_PICK_Y=...
SORT_PICK_Z=...
SORT_PICK_R=0

SORT_PLASTIC_BIN_X=...
SORT_PLASTIC_BIN_Y=...
SORT_PLASTIC_BIN_Z=...
SORT_PLASTIC_BIN_R=0

SORT_PAPER_BIN_X=...
SORT_PAPER_BIN_Y=...
SORT_PAPER_BIN_Z=...
SORT_PAPER_BIN_R=0

SORT_METAL_BIN_X=...
SORT_METAL_BIN_Y=...
SORT_METAL_BIN_Z=...
SORT_METAL_BIN_R=0
SORT_APPROACH_MM=35
```

The current sequence is: move to pickup approach point → descend → activate
selected tool → lift → move to bin approach point → descend → release → lift.
It is a starting implementation, not a validated industrial pick-and-place
routine. Verify every move at low speed with the cell clear.

## API routes currently included

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/health` | Backend health and mode |
| GET | `/api/state` | Full dashboard state |
| GET | `/api/system/status` | System/robot status |
| GET | `/api/waste-records` | Waste history |
| GET | `/api/analytics/summary` | Database-derived summary |
| GET | `/api/telemetry/latest` | Latest saved robot pose |
| POST | `/api/robot/connect` | Connect to selected serial link |
| POST | `/api/robot/disconnect` | Disconnect robot |
| POST | `/api/robot/mode` | Select wired or wireless port |
| POST | `/api/robot/jog` | Incremental X/Y/Z/R move |
| POST | `/api/robot/move` | Move to absolute X/Y/Z/R target |
| POST | `/api/robot/home` | Run Dobot home routine |
| POST | `/api/robot/tool` | Select/activate suction or gripper |
| POST | `/api/robot/speed` | Set speed percentage |
| POST | `/api/robot/emergency-stop` | Software stop request/latch |
| POST | `/api/robot/reset-safety` | Reset software latch after inspection |
| POST | `/api/sorting/cycle` | Simulated or configured pick-and-place cycle |
| POST | `/api/sensors/toggle` | Change mock sensor online state |
| POST | `/api/system/settings` | Update operator preferences |
| POST | `/api/system/selection` | Save selected waste category |
| POST | `/api/demo/reset` | Restore mock data (simulation mode only) |

## Safety requirements

- The webpage/API emergency stop is a software stop request only. It is NOT a
  safety-rated emergency stop.
- Install and test an independent, hardwired, fail-safe emergency-stop circuit
  and any required safety relay/interlocks. Follow the robot manufacturer's
  instructions and your institution's risk-assessment process.
- Keep access to robot control on a trusted local network. This sample has no
  user authentication, TLS, or role-based permissions and should not be exposed
  to the public internet.
- Do not run Flask's development server with debug enabled around live hardware.
- Do not let a vision model's raw classification output directly trigger motion
  until you have confidence thresholds, object-presence confirmation, bin-full
  checks, timeout handling, and operator override logic.
