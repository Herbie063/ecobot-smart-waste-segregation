"""Dobot Magician adapter used by the ECOBOT Flask backend.

Default behavior is SIMULATION. Hardware motion is deliberately disabled until
both ENABLE_HARDWARE_MOTION=true and WORKSPACE_CONFIRMED=true are configured.

The hardware adapter uses pydobotlab. See requirements.txt and README.md.
"""
from __future__ import annotations

import os
import threading
import time
from dataclasses import dataclass, asdict
from typing import Any


class RobotSafetyError(RuntimeError):
    """Raised when a requested robot operation is blocked by a safety check."""


class RobotConnectionError(RuntimeError):
    """Raised when the Dobot cannot be reached."""


@dataclass
class Pose:
    x: float = 248.0
    y: float = 12.0
    z: float = 42.0
    r: float = 0.0

    def to_dict(self) -> dict[str, float]:
        return {key: round(float(value), 2) for key, value in asdict(self).items()}


class DobotController:
    """Single-arm controller with simulation and pydobotlab hardware modes."""

    AXIS_LIMITS = {
        # These are example software limits. Configure and validate them for
        # the installed robot, end-effector, fixture, and physical workspace.
        "x": (150.0, 320.0),
        "y": (-120.0, 120.0),
        "z": (0.0, 150.0),
        "r": (-180.0, 180.0),
    }

    def __init__(self) -> None:
        self.mode = os.getenv("ECOBOT_MODE", "simulation").strip().lower()
        if self.mode not in {"simulation", "hardware"}:
            raise ValueError("ECOBOT_MODE must be 'simulation' or 'hardware'.")

        self.wired_port = os.getenv("DOBOT_WIRED_PORT", "COM3").strip()
        self.wireless_port = os.getenv("DOBOT_WIRELESS_PORT", "").strip()
        self.baudrate = int(os.getenv("DOBOT_BAUDRATE", "115200"))
        self.motion_enabled = self._env_bool("ENABLE_HARDWARE_MOTION", False)
        self.workspace_confirmed = self._env_bool("WORKSPACE_CONFIRMED", False)
        self.estop = False
        self.connected = self.mode == "simulation"
        self.communication_mode = os.getenv("ECOBOT_DEFAULT_LINK", "wireless").lower()
        self.speed = 45
        self.tool = "suction"
        self.tool_active = False
        self.pose = Pose()
        self._robot: Any | None = None
        self._lock = threading.RLock()

        self.limits = {
            axis: (
                float(os.getenv(f"DOBOT_{axis.upper()}_MIN", str(bounds[0]))),
                float(os.getenv(f"DOBOT_{axis.upper()}_MAX", str(bounds[1]))),
            )
            for axis, bounds in self.AXIS_LIMITS.items()
        }

    @staticmethod
    def _env_bool(name: str, default: bool) -> bool:
        value = os.getenv(name)
        if value is None:
            return default
        return value.strip().lower() in {"1", "true", "yes", "on"}

    def _get_port(self, link_mode: str) -> str:
        port = self.wired_port if link_mode == "wired" else self.wireless_port
        if not port:
            raise RobotConnectionError(
                "No wireless serial port is configured. Set DOBOT_WIRELESS_PORT "
                "to the COM/TTY port exposed by your wireless serial bridge."
            )
        return port

    def _require_connected(self) -> None:
        if not self.connected:
            raise RobotConnectionError("The Dobot is not connected.")

    def _require_motion_permission(self) -> None:
        self._require_connected()
        if self.estop:
            raise RobotSafetyError("Software emergency-stop latch is active.")
        if self.mode == "hardware":
            if not self.motion_enabled:
                raise RobotSafetyError(
                    "Hardware movement is disabled. Set ENABLE_HARDWARE_MOTION=true "
                    "after validating the robot cell."
                )
            if not self.workspace_confirmed:
                raise RobotSafetyError(
                    "Workspace is not confirmed. Validate the physical workspace and "
                    "set WORKSPACE_CONFIRMED=true before enabling movement."
                )

    def _read_hardware_pose(self) -> Pose:
        if self._robot is None:
            raise RobotConnectionError("Dobot driver is not initialized.")
        current = self._robot.get_pose()
        self.pose = Pose(float(current.x), float(current.y), float(current.z), float(current.r))
        return self.pose

    def _open_hardware(self, link_mode: str) -> None:
        try:
            from pydobotlab import Magician
        except ImportError as exc:
            raise RobotConnectionError(
                "pydobotlab is not installed. Run: python -m pip install -r requirements.txt"
            ) from exc

        port = self._get_port(link_mode)
        try:
            robot = Magician(port=port, baudrate=self.baudrate, via_broker=False, verbose=True)
            robot.connect()
            self._robot = robot
            self.connected = True
            self._read_hardware_pose()
            # Set low starting speed. The operator can later adjust it through
            # the remote page after checking the physical cell.
            robot.motion_params = (min(self.speed, 30), min(self.speed, 30))
        except Exception as exc:  # driver surfaces device-specific errors
            self._robot = None
            self.connected = False
            raise RobotConnectionError(f"Could not connect to Dobot on {port}: {exc}") from exc

    def connect(self, link_mode: str) -> dict[str, Any]:
        if link_mode not in {"wired", "wireless"}:
            raise ValueError("Link mode must be 'wired' or 'wireless'.")
        with self._lock:
            self.communication_mode = link_mode
            if self.mode == "simulation":
                self.connected = True
            else:
                if self._robot is not None:
                    self.disconnect()
                self._open_hardware(link_mode)
            return self.snapshot()

    def disconnect(self) -> dict[str, Any]:
        with self._lock:
            if self._robot is not None:
                try:
                    self._robot.disconnect()
                finally:
                    self._robot = None
            self.connected = False
            self.tool_active = False
            return self.snapshot()

    def snapshot(self) -> dict[str, Any]:
        with self._lock:
            latency_ms = 14.0 if self.communication_mode == "wired" else 42.0
            if self.mode == "hardware" and self.connected and self._robot is not None:
                try:
                    started = time.perf_counter()
                    self._read_hardware_pose()
                    # This is a robot serial command/response measurement, not
                    # end-to-end browser network latency or motion duration.
                    latency_ms = round((time.perf_counter() - started) * 1000.0, 2)
                except Exception:
                    # Keep the last valid pose; status endpoint remains usable.
                    pass
            return {
                "backendMode": self.mode,
                "mode": self.communication_mode,
                "connected": self.connected,
                "emergencyStop": self.estop,
                "coordinates": self.pose.to_dict(),
                "speed": self.speed,
                "tool": self.tool,
                "toolActive": self.tool_active,
                "robotModel": "Dobot Magician",
                "latencyMs": latency_ms,
            }

    def _check_target(self, target: Pose) -> None:
        values = target.to_dict()
        for axis, value in values.items():
            low, high = self.limits[axis]
            if not low <= value <= high:
                raise RobotSafetyError(
                    f"Requested {axis.upper()}={value} is outside configured range {low} to {high}."
                )

    def _move_to(self, target: Pose, timeout: float = 20.0) -> Pose:
        self._require_motion_permission()
        self._check_target(target)
        if self.mode == "simulation":
            self.pose = target
            return self.pose

        if self._robot is None:
            raise RobotConnectionError("Dobot driver is not initialized.")
        from pydobotlab import PTPMode

        self._robot.move_to(
            target.x, target.y, target.z, r=target.r,
            mode=PTPMode.MOVJ_XYZ, wait=True, timeout=timeout,
        )
        return self._read_hardware_pose()

    def jog(self, axis: str, direction: int, step: float = 5.0) -> dict[str, float]:
        if axis not in {"x", "y", "z", "r"}:
            raise ValueError("Axis must be x, y, z, or r.")
        if direction not in {-1, 1}:
            raise ValueError("Direction must be -1 or 1.")
        if not 0.5 <= float(step) <= 20.0:
            raise ValueError("Jog step must be between 0.5 and 20 units.")

        with self._lock:
            self._require_motion_permission()
            if self.mode == "hardware":
                self._read_hardware_pose()
            next_pose = Pose(**self.pose.to_dict())
            setattr(next_pose, axis, getattr(next_pose, axis) + direction * float(step))
            self._move_to(next_pose)
            return self.pose.to_dict()

    def move_to(self, x: float, y: float, z: float, r: float) -> dict[str, float]:
        with self._lock:
            self._move_to(Pose(float(x), float(y), float(z), float(r)))
            return self.pose.to_dict()

    def home(self) -> dict[str, float]:
        with self._lock:
            self._require_motion_permission()
            if self.mode == "simulation":
                self.pose = Pose()
            else:
                if self._robot is None:
                    raise RobotConnectionError("Dobot driver is not initialized.")
                self._robot.set_home()
                self._read_hardware_pose()
            return self.pose.to_dict()

    def set_speed(self, speed: int) -> int:
        speed = int(speed)
        if not 10 <= speed <= 100:
            raise ValueError("Speed must be between 10 and 100 percent.")
        with self._lock:
            self._require_connected()
            if self.estop:
                raise RobotSafetyError("Cannot change speed while emergency stop is active.")
            self.speed = speed
            if self.mode == "hardware":
                if self._robot is None:
                    raise RobotConnectionError("Dobot driver is not initialized.")
                if not self.motion_enabled or not self.workspace_confirmed:
                    raise RobotSafetyError("Hardware command permission is not enabled.")
                self._robot.motion_params = (speed, speed)
            return self.speed

    def set_tool(self, tool: str, active: bool) -> dict[str, Any]:
        if tool not in {"suction", "gripper"}:
            raise ValueError("Tool must be 'suction' or 'gripper'.")
        with self._lock:
            self._require_motion_permission()
            if self.mode == "hardware":
                if self._robot is None:
                    raise RobotConnectionError("Dobot driver is not initialized.")
                if tool == "suction":
                    self._robot.set_endeffector_suctioncup(True, bool(active))
                else:
                    self._robot.set_endeffector_gripper(True, bool(active))
            self.tool = tool
            self.tool_active = bool(active)
            return {"tool": self.tool, "toolActive": self.tool_active}

    def emergency_stop(self) -> None:
        """Latch a software stop and request driver-level motion interruption.

        This is NOT a safety-rated emergency stop and cannot replace a wired
        mushroom switch, safety relay, or other independent hardware circuit.
        """
        # Intentionally do not acquire self._lock. This method must be able to
        # interrupt a long-running sort_to_bin() call that currently owns it.
        self.estop = True
        if self.mode == "hardware" and self._robot is not None:
            errors = []
            stop_confirmed = False
            for method_name in ("jog_stop", "force_stop_queue"):
                try:
                    getattr(self._robot, method_name)()
                    stop_confirmed = True
                except Exception as exc:
                    errors.append(f"{method_name}: {exc}")
            if not stop_confirmed:
                raise RobotConnectionError(
                    "Software stop was latched, but driver stop commands failed: " + "; ".join(errors)
                )

    def reset_software_estop(self) -> None:
        """Clear only the web application's software latch after inspection."""
        with self._lock:
            if self.mode == "hardware":
                # The physical stop chain must be physically reset and checked
                # by the operator before this software latch can be cleared.
                if not self.connected:
                    raise RobotSafetyError("Reconnect and inspect the robot before software reset.")
            self.estop = False

    def sort_to_bin(self, category: str, positions: dict[str, dict[str, float]]) -> float:
        """Execute a calibrated pick-and-place sequence; returns elapsed seconds.

        `positions` is deliberately supplied from environment configuration.
        Do not use this routine until all coordinates have been calibrated with
        the real end-effector, bins, fixtures, and hardware safety setup.
        """
        if category not in {"plastic", "paper", "metal"}:
            raise ValueError("Unknown waste category.")
        required = {"pick", category}
        if not required.issubset(positions):
            raise RobotSafetyError(f"Missing calibrated pick/drop position for {category}.")
        pick = positions["pick"]
        drop = positions[category]
        approach = float(os.getenv("SORT_APPROACH_MM", "35"))
        speed_backup = self.speed

        def point(base: dict[str, float], z_offset: float = 0.0) -> Pose:
            return Pose(
                float(base["x"]), float(base["y"]), float(base["z"]) + z_offset,
                float(base.get("r", 0.0)),
            )

        with self._lock:
            self._require_motion_permission()
            started = time.perf_counter()
            self._robot_speed_for_sort(speed_backup)
            try:
                self._move_to(point(pick, approach))
                self._move_to(point(pick))
                self.set_tool(self.tool, True)
                time.sleep(0.35)
                self._move_to(point(pick, approach))
                self._move_to(point(drop, approach))
                self._move_to(point(drop))
                self.set_tool(self.tool, False)
                time.sleep(0.2)
                self._move_to(point(drop, approach))
                return round(time.perf_counter() - started, 2)
            except Exception:
                # Stop queued motion if any operation fails. Do not automatically
                # release a carried object while recovering from an error.
                self.emergency_stop()
                raise

    def _robot_speed_for_sort(self, speed: int) -> None:
        if self.mode == "hardware" and self._robot is not None:
            self._robot.motion_params = (speed, speed)

    def reset_simulation(self) -> None:
        """Restore the safe in-memory simulation state (never moves hardware)."""
        if self.mode != "simulation":
            raise RobotSafetyError("Simulation reset is unavailable in hardware mode.")
        with self._lock:
            self.connected = True
            self.communication_mode = "wireless"
            self.estop = False
            self.speed = 45
            self.tool = "suction"
            self.tool_active = False
            self.pose = Pose()

    def close(self) -> None:
        try:
            self.disconnect()
        except Exception:
            pass
