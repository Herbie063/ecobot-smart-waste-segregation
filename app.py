"""ECOBOT Flask backend: REST API, SQLite persistence, and Dobot gateway.

Run with: python app.py
Open:     http://127.0.0.1:5000
"""
from __future__ import annotations

import json
import os
import sqlite3
import threading
from datetime import datetime
from contextlib import contextmanager
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from flask import Flask, jsonify, request, send_from_directory

from dobot_controller import (
    DobotController,
    RobotConnectionError,
    RobotSafetyError,
)

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")
DATA_DIR = BASE_DIR / "data"
DATABASE_DIR = BASE_DIR / "database"
DATABASE_PATH = Path(os.getenv("ECOBOT_DATABASE", str(DATABASE_DIR / "ecobot.db")))
if not DATABASE_PATH.is_absolute():
    DATABASE_PATH = BASE_DIR / DATABASE_PATH
SEED_PATH = DATA_DIR / "mock-database.json"

app = Flask(__name__, static_folder=None)
app.config["JSON_SORT_KEYS"] = False

robot = DobotController()
robot_lock = threading.RLock()

CATEGORY_MAP = {
    "CAT-PLASTIC": "plastic",
    "CAT-PAPER": "paper",
    "CAT-METAL": "metal",
}
CATEGORY_META = {
    "plastic": {"label": "Plastic", "item": "PET beverage bottle", "route": "Plastic bin", "confidence": 98.4},
    "paper": {"label": "Paper / Non-metal", "item": "Printed worksheet", "route": "Paper bin", "confidence": 95.1},
    "metal": {"label": "Metal", "item": "Aluminum can", "route": "Metal bin", "confidence": 97.7},
}

# These values are dashboard reference values from the supplied mock dataset.
# Replace them with measured results once the vision model and sensors are live.
DEFAULT_CATEGORY_TOTALS = {"plastic": 538, "paper": 436, "metal": 310}
DEFAULT_WEEKLY = [
    {"day": "Mon", "plastic": 42, "paper": 33},
    {"day": "Tue", "plastic": 57, "paper": 40},
    {"day": "Wed", "plastic": 48, "paper": 45},
    {"day": "Thu", "plastic": 66, "paper": 51},
    {"day": "Fri", "plastic": 73, "paper": 58},
    {"day": "Sat", "plastic": 51, "paper": 37},
    {"day": "Sun", "plastic": 62, "paper": 46},
]

DB_LOCK = threading.RLock()


def now_text() -> str:
    return datetime.now().astimezone().strftime("%Y-%m-%d %H:%M:%S")


def db_connect() -> sqlite3.Connection:
    DATABASE_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DATABASE_PATH, timeout=10, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


@contextmanager
def db_session():
    """Open a short-lived SQLite connection and always close it."""
    conn = db_connect()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def read_seed() -> dict[str, Any]:
    with SEED_PATH.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def init_database() -> None:
    with DB_LOCK, db_session() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS app_state (
                state_key TEXT PRIMARY KEY,
                state_json TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS waste_records (
                record_id TEXT PRIMARY KEY,
                timestamp TEXT NOT NULL,
                category TEXT NOT NULL CHECK(category IN ('plastic','paper','metal')),
                item TEXT NOT NULL,
                confidence REAL NOT NULL,
                route TEXT NOT NULL,
                status TEXT NOT NULL,
                duration REAL NOT NULL,
                mode TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS system_events (
                event_id INTEGER PRIMARY KEY AUTOINCREMENT,
                event_time TEXT NOT NULL,
                event_type TEXT NOT NULL,
                detail TEXT NOT NULL,
                level TEXT NOT NULL DEFAULT 'info'
            );
            CREATE TABLE IF NOT EXISTS telemetry (
                telemetry_id INTEGER PRIMARY KEY AUTOINCREMENT,
                captured_at TEXT NOT NULL,
                x REAL, y REAL, z REAL, r REAL,
                latency_ms REAL,
                speed_percent INTEGER,
                communication_mode TEXT NOT NULL DEFAULT 'wireless'
            );
            """
        )
        telemetry_columns = {row["name"] for row in conn.execute("PRAGMA table_info(telemetry)").fetchall()}
        if "communication_mode" not in telemetry_columns:
            conn.execute("ALTER TABLE telemetry ADD COLUMN communication_mode TEXT NOT NULL DEFAULT 'wireless'")

        seeded = conn.execute("SELECT 1 FROM app_state WHERE state_key='runtime'").fetchone()
        if seeded:
            return

        seed = read_seed()
        system = {
            "projectName": "ECOBOT",
            "prototypeName": "Dual-mode vision-based segregation prototype",
            "robotModel": "Dobot Magician",
            "firmware": "Connected through Python gateway",
            "controller": seed.get("system", {}).get("controller_id", "Master control hub"),
            "site": seed.get("system", {}).get("site", "Campus Materials Recovery Area"),
            "mode": robot.communication_mode if robot.communication_mode in {"wired", "wireless"} else "wireless",
            "connected": robot.connected,
            "emergencyStop": False,
            "autoSort": True,
            "cameraOnline": True,
            "inductiveOnline": True,
            "capacitiveOnline": True,
            "infraredOnline": True,
            "ultrasonicOnline": True,
            "speed": robot.speed,
            "tool": robot.tool,
            "toolActive": False,
            "coordinates": robot.pose.to_dict(),
            "selectedCategory": "plastic",
            "sortStatus": "Idle · waiting for object",
            "lastAction": "Backend initialized",
            "cycleCount": 1284,
            "latency": 42,
            "wiredLatency": 14,
            "wirelessLatency": 42,
            "accuracy": 96.8,
            "successRate": 94.2,
            "backendMode": robot.mode,
        }
        runtime = {
            "system": system,
            "categoryTotals": DEFAULT_CATEGORY_TOTALS,
            "weekly": DEFAULT_WEEKLY,
        }
        conn.execute(
            "INSERT INTO app_state(state_key,state_json,updated_at) VALUES(?,?,?)",
            ("runtime", json.dumps(runtime), now_text()),
        )

        for record in seed.get("waste_records", []):
            category = CATEGORY_MAP.get(record.get("category_id"), "plastic")
            conn.execute(
                """INSERT OR IGNORE INTO waste_records
                (record_id,timestamp,category,item,confidence,route,status,duration,mode)
                VALUES(?,?,?,?,?,?,?,?,?)""",
                (
                    record["record_id"],
                    record["detected_at"].replace("T", " ")[:19],
                    category,
                    record.get("object_label", "Unknown object"),
                    float(record.get("confidence_percent", 0)),
                    record.get("destination_bin", CATEGORY_META[category]["route"]),
                    record.get("sort_status", "success"),
                    float(record.get("cycle_duration_seconds", 0)),
                    record.get("communication_mode", "wireless"),
                ),
            )

        for event in seed.get("safety_events", []):
            conn.execute(
                "INSERT INTO system_events(event_time,event_type,detail,level) VALUES(?,?,?,?)",
                (
                    event.get("event_at", now_text()).replace("T", " ")[:19],
                    event.get("event_type", "SYSTEM"),
                    event.get("description", "Seed event"),
                    event.get("severity", "info"),
                ),
            )

        telemetry_samples = seed.get("telemetry", [])
        if telemetry_samples:
            for sample in telemetry_samples:
                sample_latency = float(sample.get("communication_latency_ms", 42))
                sample_mode = "wired" if sample_latency < 25 else "wireless"
                conn.execute(
                    """INSERT INTO telemetry
                    (captured_at,x,y,z,r,latency_ms,speed_percent,communication_mode)
                    VALUES(?,?,?,?,?,?,?,?)""",
                    (
                        sample.get("captured_at", now_text()).replace("T", " ")[:19],
                        float(sample.get("robot_x_mm", 248)),
                        float(sample.get("robot_y_mm", 12)),
                        float(sample.get("robot_z_mm", 42)),
                        float(sample.get("robot_r_deg", 0)),
                        sample_latency,
                        int(sample.get("robot_speed_percent", robot.speed)),
                        sample_mode,
                    ),
                )
        else:
            initial_pose = robot.pose.to_dict()
            conn.execute(
                """INSERT INTO telemetry
                (captured_at,x,y,z,r,latency_ms,speed_percent,communication_mode)
                VALUES(?,?,?,?,?,?,?,?)""",
                (now_text(), initial_pose["x"], initial_pose["y"], initial_pose["z"], initial_pose["r"], 42, robot.speed, "wireless"),
            )


def load_runtime(conn: sqlite3.Connection) -> dict[str, Any]:
    row = conn.execute("SELECT state_json FROM app_state WHERE state_key='runtime'").fetchone()
    if not row:
        raise RuntimeError("ECOBOT runtime state is missing.")
    return json.loads(row["state_json"])


def save_runtime(conn: sqlite3.Connection, runtime: dict[str, Any]) -> None:
    conn.execute(
        "UPDATE app_state SET state_json=?,updated_at=? WHERE state_key='runtime'",
        (json.dumps(runtime), now_text()),
    )


def update_system(**changes: Any) -> dict[str, Any]:
    with DB_LOCK, db_session() as conn:
        runtime = load_runtime(conn)
        runtime["system"].update(changes)
        runtime["system"]["lastUpdated"] = now_text()
        save_runtime(conn, runtime)
        return runtime["system"]


def add_event(event_type: str, detail: str, level: str = "info") -> None:
    with DB_LOCK, db_session() as conn:
        conn.execute(
            "INSERT INTO system_events(event_time,event_type,detail,level) VALUES(?,?,?,?)",
            (now_text(), event_type, detail, level),
        )


def add_telemetry() -> None:
    snapshot = robot.snapshot()
    c = snapshot["coordinates"]
    latency = float(snapshot.get("latencyMs", 14 if snapshot["mode"] == "wired" else 42))
    with DB_LOCK, db_session() as conn:
        conn.execute(
            """INSERT INTO telemetry
            (captured_at,x,y,z,r,latency_ms,speed_percent,communication_mode)
            VALUES(?,?,?,?,?,?,?,?)""",
            (now_text(), c["x"], c["y"], c["z"], c["r"], latency, snapshot["speed"], snapshot["mode"]),
        )
        runtime = load_runtime(conn)
        runtime["system"]["latency"] = latency
        save_runtime(conn, runtime)


def list_records(category: str | None = None, status: str | None = None) -> list[dict[str, Any]]:
    sql = "SELECT * FROM waste_records"
    clauses: list[str] = []
    args: list[Any] = []
    if category and category != "all":
        clauses.append("category=?")
        args.append(category)
    if status and status != "all":
        clauses.append("status=?")
        args.append(status)
    if clauses:
        sql += " WHERE " + " AND ".join(clauses)
    sql += " ORDER BY timestamp DESC, rowid DESC"
    with DB_LOCK, db_session() as conn:
        return [dict(row) for row in conn.execute(sql, args).fetchall()]


def build_activity(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    activity = []
    for row in records[:6]:
        activity.append({
            "category": row["category"],
            "item": row["item"],
            "action": f"Sorted to {row['route']}",
            "time": row["timestamp"].split(" ")[-1],
            "id": row.get("record_id", row.get("id", "")),
        })
    return activity


def get_full_state() -> dict[str, Any]:
    snapshot = robot.snapshot()
    with DB_LOCK, db_session() as conn:
        runtime = load_runtime(conn)
        records = [dict(row) for row in conn.execute(
            "SELECT * FROM waste_records ORDER BY timestamp DESC, rowid DESC LIMIT 500"
        ).fetchall()]
        events = [dict(row) for row in conn.execute(
            "SELECT event_time AS time,event_type AS type,detail,level FROM system_events ORDER BY event_id DESC LIMIT 20"
        ).fetchall()]
        # Keep the frontend's expected record property names.
        mapped_records = [
            {
                "id": row["record_id"], "timestamp": row["timestamp"], "category": row["category"],
                "item": row["item"], "confidence": row["confidence"], "route": row["route"],
                "status": row["status"], "duration": row["duration"], "mode": row["mode"],
            }
            for row in records
        ]
        system = dict(runtime["system"])
        system.update(snapshot)
        averages = conn.execute(
            "SELECT communication_mode,AVG(latency_ms) AS avg_ms FROM telemetry GROUP BY communication_mode"
        ).fetchall()
        latency_by_mode = {row["communication_mode"]: round(float(row["avg_ms"] or 0), 2) for row in averages}
        system["wiredLatency"] = latency_by_mode.get("wired", system.get("wiredLatency", 14))
        system["wirelessLatency"] = latency_by_mode.get("wireless", system.get("wirelessLatency", 42))
        system["latency"] = snapshot.get("latencyMs", system.get("latency", 42))
        system["sortStatus"] = system.get("sortStatus", "Idle · waiting for object")
        return {
            "system": system,
            "records": mapped_records,
            "activity": build_activity(mapped_records),
            "categoryTotals": runtime["categoryTotals"],
            "weekly": runtime["weekly"],
            "events": events,
        }


def api_error(message: str, status: int = 400):
    return jsonify({"ok": False, "error": message}), status


def json_body() -> dict[str, Any]:
    body = request.get_json(silent=True)
    if not isinstance(body, dict):
        raise ValueError("Request body must be a JSON object.")
    return body


@app.get("/")
def index():
    return send_from_directory(BASE_DIR, "index.html")


@app.get("/api/health")
def health():
    return jsonify({
        "ok": True,
        "backend": "ECOBOT Flask API",
        "mode": robot.mode,
        "database": str(DATABASE_PATH.name),
    })


@app.get("/api/state")
def api_state():
    return jsonify(get_full_state())


@app.get("/api/system/status")
def system_status():
    return jsonify(get_full_state()["system"])


@app.get("/api/waste-records")
def waste_records():
    return jsonify({"records": list_records(request.args.get("category"), request.args.get("status"))})


@app.get("/api/telemetry/latest")
def latest_telemetry():
    with DB_LOCK, db_session() as conn:
        row = conn.execute("SELECT * FROM telemetry ORDER BY telemetry_id DESC LIMIT 1").fetchone()
    return jsonify(dict(row) if row else {})


@app.get("/api/analytics/summary")
def analytics_summary():
    with DB_LOCK, db_session() as conn:
        rows = conn.execute(
            "SELECT category,COUNT(*) AS count,AVG(confidence) AS avg_confidence,AVG(duration) AS avg_duration "
            "FROM waste_records GROUP BY category"
        ).fetchall()
        total = conn.execute("SELECT COUNT(*) FROM waste_records").fetchone()[0]
        successful = conn.execute("SELECT COUNT(*) FROM waste_records WHERE status='success'").fetchone()[0]
        latency_rows = conn.execute(
            "SELECT communication_mode,AVG(latency_ms) AS avg_ms,COUNT(*) AS samples "
            "FROM telemetry GROUP BY communication_mode"
        ).fetchall()
    return jsonify({
        "totalRecords": total,
        "successRate": round((successful / total * 100), 1) if total else 0,
        "categories": [dict(row) for row in rows],
        "communicationLatency": {row["communication_mode"]: {
            "averageMs": round(float(row["avg_ms"] or 0), 2), "samples": row["samples"]
        } for row in latency_rows},
    })


@app.post("/api/robot/connect")
def robot_connect():
    try:
        body = json_body()
        link_mode = body.get("mode", get_full_state()["system"]["mode"])
        with robot_lock:
            snapshot = robot.connect(link_mode)
        update_system(**snapshot, lastAction=f"Robot connected using {link_mode} link")
        add_event("COMMUNICATION", f"Robot connected using {link_mode} link", "success")
        add_telemetry()
        return jsonify({"ok": True, "robot": snapshot})
    except (ValueError, RobotConnectionError, RobotSafetyError) as exc:
        return api_error(str(exc), 409)
    except Exception as exc:
        app.logger.exception("Robot connection failed")
        return api_error(f"Robot connection failed: {exc}", 500)


@app.post("/api/robot/disconnect")
def robot_disconnect():
    with robot_lock:
        snapshot = robot.disconnect()
    update_system(**snapshot, lastAction="Robot disconnected")
    add_event("COMMUNICATION", "Robot disconnected", "warning")
    return jsonify({"ok": True, "robot": snapshot})


@app.post("/api/robot/mode")
def robot_mode():
    try:
        body = json_body()
        mode = body.get("mode")
        if mode not in {"wired", "wireless"}:
            return api_error("mode must be 'wired' or 'wireless'.")
        with robot_lock:
            was_connected = robot.connected
            if robot.mode == "hardware" and was_connected:
                snapshot = robot.connect(mode)
            else:
                robot.communication_mode = mode
                snapshot = robot.snapshot()
        update_system(**snapshot, latency=snapshot.get("latencyMs", 14 if mode == "wired" else 42),
                      lastAction=f"Communication mode changed to {mode}")
        add_event("COMMUNICATION", f"Communication mode selected: {mode}", "info")
        add_telemetry()
        return jsonify({"ok": True, "robot": snapshot})
    except (ValueError, RobotConnectionError, RobotSafetyError) as exc:
        return api_error(str(exc), 409)


@app.post("/api/robot/jog")
def robot_jog():
    try:
        body = json_body()
        axis = str(body.get("axis", "")).lower()
        direction = int(body.get("direction", 0))
        step = float(body.get("step", 5.0))
        with robot_lock:
            coordinates = robot.jog(axis, direction, step)
        update_system(coordinates=coordinates,
                      lastAction=f"Jogged {axis.upper()} {'+' if direction > 0 else '-'}{step:g}")
        add_telemetry()
        return jsonify({"ok": True, "coordinates": coordinates})
    except (ValueError, RobotConnectionError, RobotSafetyError) as exc:
        return api_error(str(exc), 409)
    except Exception as exc:
        app.logger.exception("Jog command failed")
        return api_error(f"Jog command failed: {exc}", 500)


@app.post("/api/robot/move")
def robot_move():
    try:
        body = json_body()
        coordinates = {key: float(body[key]) for key in ("x", "y", "z", "r")}
        with robot_lock:
            result = robot.move_to(**coordinates)
        update_system(coordinates=result, lastAction="Moved to absolute target")
        add_telemetry()
        return jsonify({"ok": True, "coordinates": result})
    except (KeyError, ValueError, RobotConnectionError, RobotSafetyError) as exc:
        return api_error(str(exc), 409)


@app.post("/api/robot/home")
def robot_home():
    try:
        with robot_lock:
            coordinates = robot.home()
        update_system(coordinates=coordinates, lastAction="Home routine completed")
        add_event("HOME POSITION", "Robot home routine completed", "success")
        add_telemetry()
        return jsonify({"ok": True, "coordinates": coordinates})
    except (ValueError, RobotConnectionError, RobotSafetyError) as exc:
        return api_error(str(exc), 409)
    except Exception as exc:
        app.logger.exception("Home command failed")
        return api_error(f"Home command failed: {exc}", 500)


@app.post("/api/robot/tool")
def robot_tool():
    try:
        body = json_body()
        tool = str(body.get("tool", "suction"))
        active = bool(body.get("active", False))
        with robot_lock:
            result = robot.set_tool(tool, active)
        update_system(**result, lastAction=f"{tool.title()} {'activated' if active else 'released'}")
        add_event("END EFFECTOR", f"{tool.title()} {'activated' if active else 'released'}", "info")
        return jsonify({"ok": True, **result})
    except (ValueError, RobotConnectionError, RobotSafetyError) as exc:
        return api_error(str(exc), 409)


@app.post("/api/robot/speed")
def robot_speed():
    try:
        body = json_body()
        speed = int(body.get("speed", 45))
        with robot_lock:
            result = robot.set_speed(speed)
        update_system(speed=result, lastAction=f"Robot speed set to {result}%")
        return jsonify({"ok": True, "speed": result})
    except (ValueError, RobotConnectionError, RobotSafetyError) as exc:
        return api_error(str(exc), 409)


@app.post("/api/robot/emergency-stop")
def robot_estop():
    try:
        # Do not take robot_lock here: an emergency-stop request must not wait
        # behind a long pick-and-place routine. Hardware E-stop remains primary.
        robot.emergency_stop()
        update_system(emergencyStop=True, lastAction="Software emergency stop latched")
        add_event("EMERGENCY STOP", "Web emergency-stop request received", "warning")
        return jsonify({"ok": True, "robot": {"emergencyStop": True},
                        "warning": "Software stop only. The independent hardware E-stop remains the safety authority."})
    except Exception as exc:
        app.logger.exception("Emergency-stop request failed")
        return api_error(f"Software stop request error: {exc}", 500)


@app.post("/api/robot/reset-safety")
def robot_reset_safety():
    try:
        with robot_lock:
            robot.reset_software_estop()
            snapshot = robot.snapshot()
        update_system(**snapshot, sortStatus="Idle · software safety latch reset",
                      lastAction="Software safety latch reset")
        add_event("SAFETY RESET", "Software emergency-stop latch reset after operator inspection", "info")
        return jsonify({"ok": True, "robot": snapshot})
    except (ValueError, RobotConnectionError, RobotSafetyError) as exc:
        return api_error(str(exc), 409)


@app.post("/api/sorting/cycle")
def sorting_cycle():
    """Run a sample cycle in simulation, or a calibrated hardware pick-and-place."""
    try:
        body = json_body()
        category = str(body.get("category", "plastic")).lower()
        if category not in CATEGORY_META:
            return api_error("category must be plastic, paper, or metal.")
        system = get_full_state()["system"]
        if system.get("emergencyStop"):
            return api_error("Emergency stop is active.", 409)
        if not system.get("connected"):
            return api_error("Robot is disconnected.", 409)

        if robot.mode == "hardware":
            positions = load_sort_positions()
            with robot_lock:
                duration = robot.sort_to_bin(category, positions)
        else:
            # Deterministic mock duration; no hardware commands are sent.
            import time
            time.sleep(0.8)
            duration = 4.6

        meta = CATEGORY_META[category]
        record_id = next_record_id()
        timestamp = now_text()
        confidence = float(body.get("confidence", meta["confidence"]))
        confidence = max(0.0, min(100.0, confidence))
        mode = system.get("mode", "wireless")
        with DB_LOCK, db_session() as conn:
            conn.execute(
                """INSERT INTO waste_records
                (record_id,timestamp,category,item,confidence,route,status,duration,mode)
                VALUES(?,?,?,?,?,?,?,?,?)""",
                (record_id, timestamp, category, str(body.get("item", meta["item"])),
                 confidence, meta["route"], "success", duration, mode),
            )
            runtime = load_runtime(conn)
            runtime["categoryTotals"][category] = int(runtime["categoryTotals"].get(category, 0)) + 1
            runtime["system"]["cycleCount"] = int(runtime["system"].get("cycleCount", 0)) + 1
            runtime["system"]["selectedCategory"] = category
            runtime["system"]["sortStatus"] = f"Cycle complete · {record_id} sorted to {meta['route']}"
            runtime["system"]["lastAction"] = f"{meta['label']} → {meta['route']}"
            runtime["system"]["successRate"] = min(99.9, round(float(runtime["system"].get("successRate", 94.2)) + 0.04, 1))
            runtime["system"]["accuracy"] = min(99.9, round(float(runtime["system"].get("accuracy", 96.8)) + 0.01, 1))
            save_runtime(conn, runtime)
            conn.execute(
                "INSERT INTO system_events(event_time,event_type,detail,level) VALUES(?,?,?,?)",
                (timestamp, "SORT COMPLETE", f"{record_id} · {meta['item']} → {meta['route']}", "success"),
            )
        add_telemetry()
        return jsonify({"ok": True, "record": {
            "id": record_id, "timestamp": timestamp, "category": category,
            "item": str(body.get("item", meta["item"])), "confidence": confidence,
            "route": meta["route"], "status": "success", "duration": duration, "mode": mode,
        }})
    except (ValueError, RobotConnectionError, RobotSafetyError) as exc:
        return api_error(str(exc), 409)
    except Exception as exc:
        app.logger.exception("Sorting cycle failed")
        return api_error(f"Sorting cycle failed: {exc}", 500)


def next_record_id() -> str:
    with DB_LOCK, db_session() as conn:
        rows = conn.execute("SELECT record_id FROM waste_records").fetchall()
        numbers = []
        for row in rows:
            digits = "".join(char for char in row["record_id"] if char.isdigit())
            if digits:
                numbers.append(int(digits))
        current = max(numbers, default=2400)
        return f"EC-{current + 1}"


def load_sort_positions() -> dict[str, dict[str, float]]:
    """Load calibrated pick and bin coordinates from .env."""
    def position(prefix: str) -> dict[str, float] | None:
        keys = [f"{prefix}_X", f"{prefix}_Y", f"{prefix}_Z"]
        if not all(os.getenv(key) not in (None, "") for key in keys):
            return None
        return {
            "x": float(os.getenv(keys[0])),
            "y": float(os.getenv(keys[1])),
            "z": float(os.getenv(keys[2])),
            "r": float(os.getenv(f"{prefix}_R", "0")),
        }

    positions: dict[str, dict[str, float]] = {}
    for key, prefix in {
        "pick": "SORT_PICK",
        "plastic": "SORT_PLASTIC_BIN",
        "paper": "SORT_PAPER_BIN",
        "metal": "SORT_METAL_BIN",
    }.items():
        value = position(prefix)
        if value:
            positions[key] = value
    missing = {"pick", "plastic", "paper", "metal"} - set(positions)
    if missing:
        raise RobotSafetyError(
            "Hardware sorting needs calibrated coordinates in .env for: " + ", ".join(sorted(missing))
        )
    return positions


@app.post("/api/sensors/toggle")
def toggle_sensor():
    try:
        body = json_body()
        key = str(body.get("key", ""))
        allowed = {"cameraOnline", "inductiveOnline", "capacitiveOnline", "infraredOnline", "ultrasonicOnline"}
        if key not in allowed:
            return api_error("Unknown sensor key.")
        with DB_LOCK, db_session() as conn:
            runtime = load_runtime(conn)
            runtime["system"][key] = not bool(runtime["system"].get(key, False))
            enabled = runtime["system"][key]
            save_runtime(conn, runtime)
        add_event("SENSOR UPDATE", f"{key} {'enabled' if enabled else 'disabled'} in operator settings", "info")
        return jsonify({"ok": True, "key": key, "enabled": enabled})
    except (ValueError, KeyError) as exc:
        return api_error(str(exc))


@app.post("/api/system/settings")
def update_settings():
    try:
        body = json_body()
        allowed = {"autoSort"}
        changes = {key: bool(value) for key, value in body.items() if key in allowed}
        if not changes:
            return api_error("No supported system settings were provided.")
        system = update_system(**changes)
        return jsonify({"ok": True, "system": system})
    except ValueError as exc:
        return api_error(str(exc))


@app.post("/api/system/selection")
def set_selection():
    try:
        body = json_body()
        category = str(body.get("category", "")).lower()
        if category not in CATEGORY_META:
            return api_error("Unknown category.")
        update_system(selectedCategory=category)
        return jsonify({"ok": True, "selectedCategory": category})
    except ValueError as exc:
        return api_error(str(exc))


@app.post("/api/demo/reset")
def reset_demo():
    """Restore the provided mock dataset; does not home or move hardware."""
    if robot.mode == "hardware":
        return api_error("Demo reset is disabled in hardware mode; it will not reset real robot state.", 409)
    with DB_LOCK, db_session() as conn:
        conn.execute("DELETE FROM waste_records")
        conn.execute("DELETE FROM system_events")
        conn.execute("DELETE FROM telemetry")
        conn.execute("DELETE FROM app_state")
        # Reinitialize by closing this connection and calling init_database below.
    robot.reset_simulation()
    init_database()
    return jsonify({"ok": True})


@app.get("/<path:path>")
def frontend_assets(path: str):
    # Serve only browser assets. Never expose .env, Python source, or SQLite DB.
    allowed_assets = {"styles.css", "app.js", "data/mock-data.js"}
    if path not in allowed_assets:
        return api_error("File not found.", 404)
    return send_from_directory(BASE_DIR, path)


@app.errorhandler(404)
def not_found(_error):
    return jsonify({"ok": False, "error": "Endpoint not found."}), 404


@app.errorhandler(500)
def internal_error(_error):
    app.logger.exception("Unhandled backend error")
    return jsonify({"ok": False, "error": "Internal server error."}), 500


init_database()

if __name__ == "__main__":
    print("\nECOBOT API is starting")
    print(f"Mode: {robot.mode.upper()}")
    print(f"SQLite database: {DATABASE_PATH}")
    print("Open http://127.0.0.1:5000 in your browser\n")
    app.run(host=os.getenv("FLASK_HOST", "127.0.0.1"),
            port=int(os.getenv("FLASK_PORT", "5000")), debug=os.getenv("FLASK_DEBUG", "false").lower() == "true")
