-- Suggested relational schema for a future backend.
-- This is documentation only; no database server is configured by this prototype.

CREATE TABLE systems (
  system_id VARCHAR(40) PRIMARY KEY,
  system_name VARCHAR(80) NOT NULL,
  robot_model VARCHAR(80) NOT NULL,
  controller_id VARCHAR(40),
  site_name VARCHAR(120),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE waste_categories (
  category_id VARCHAR(40) PRIMARY KEY,
  category_name VARCHAR(60) NOT NULL,
  destination_bin VARCHAR(80) NOT NULL,
  display_color VARCHAR(20)
);

CREATE TABLE waste_records (
  record_id VARCHAR(40) PRIMARY KEY,
  system_id VARCHAR(40) NOT NULL,
  category_id VARCHAR(40) NOT NULL,
  detected_at TIMESTAMP NOT NULL,
  object_label VARCHAR(120),
  confidence_percent DECIMAL(5,2),
  destination_bin VARCHAR(80),
  sort_status VARCHAR(24) NOT NULL,
  cycle_duration_seconds DECIMAL(7,2),
  communication_mode VARCHAR(16),
  FOREIGN KEY (system_id) REFERENCES systems(system_id),
  FOREIGN KEY (category_id) REFERENCES waste_categories(category_id)
);

CREATE TABLE telemetry (
  telemetry_id BIGINT PRIMARY KEY,
  system_id VARCHAR(40) NOT NULL,
  captured_at TIMESTAMP NOT NULL,
  robot_x_mm DECIMAL(8,2), robot_y_mm DECIMAL(8,2),
  robot_z_mm DECIMAL(8,2), robot_r_deg DECIMAL(7,2),
  communication_latency_ms DECIMAL(8,2),
  robot_speed_percent DECIMAL(5,2),
  FOREIGN KEY (system_id) REFERENCES systems(system_id)
);

CREATE TABLE safety_events (
  event_id VARCHAR(40) PRIMARY KEY,
  system_id VARCHAR(40) NOT NULL,
  event_at TIMESTAMP NOT NULL,
  event_type VARCHAR(40) NOT NULL,
  description VARCHAR(255),
  severity VARCHAR(16),
  FOREIGN KEY (system_id) REFERENCES systems(system_id)
);

-- Suggested API boundaries for later integration:
-- GET  /api/system/status
-- GET  /api/waste-records?category=&from=&to=&status=
-- GET  /api/analytics/summary?range=
-- GET  /api/telemetry/latest
-- POST /api/robot/connect         (server validates mode and permissions)
-- POST /api/robot/move            (server validates workspace limits)
-- POST /api/robot/home
-- POST /api/robot/tool            (suction / gripper)
-- POST /api/robot/emergency-stop  (must map to a hardware safety circuit)
-- IMPORTANT: browser UI controls must never be the sole safety mechanism.
