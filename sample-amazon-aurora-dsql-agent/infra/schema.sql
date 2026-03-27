-- Aurora DSQL schema for grid investigation
-- Run as admin user against your DSQL cluster

CREATE TABLE IF NOT EXISTS grid_incidents (
    incident_id     TEXT PRIMARY KEY,
    feeder_id       TEXT NOT NULL,
    incident_type   TEXT NOT NULL,          -- 'voltage_instability', 'outage', 'fault'
    severity        TEXT NOT NULL,          -- 'low', 'medium', 'high', 'critical'
    started_at      TIMESTAMPTZ NOT NULL,
    resolved_at     TIMESTAMPTZ,
    description     TEXT,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS feeder_events (
    event_id        TEXT PRIMARY KEY,
    feeder_id       TEXT NOT NULL,
    event_type      TEXT NOT NULL,          -- 'voltage_spike', 'current_surge', 'phase_imbalance'
    voltage_kv      NUMERIC(8,3),
    current_amps    NUMERIC(10,3),
    frequency_hz    NUMERIC(6,3),
    recorded_at     TIMESTAMPTZ NOT NULL,
    sensor_id       TEXT
);

CREATE TABLE IF NOT EXISTS switching_events (
    switch_id       TEXT PRIMARY KEY,
    feeder_id       TEXT NOT NULL,
    switch_type     TEXT NOT NULL,          -- 'open', 'close', 'reclose'
    operator_id     TEXT,
    reason          TEXT,
    switched_at     TIMESTAMPTZ NOT NULL,
    automated       BOOLEAN DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS transformer_inspections (
    inspection_id   TEXT PRIMARY KEY,
    transformer_id  TEXT NOT NULL,
    feeder_id       TEXT NOT NULL,
    status          TEXT NOT NULL,          -- 'ok', 'degraded', 'failed', 'overloaded'
    load_percent    NUMERIC(5,2),
    oil_temp_c      NUMERIC(6,2),
    inspected_at    TIMESTAMPTZ NOT NULL,
    inspector_id    TEXT,
    notes           TEXT
);

CREATE TABLE IF NOT EXISTS incident_weather (
    weather_id      TEXT PRIMARY KEY,
    feeder_id       TEXT NOT NULL,
    recorded_at     TIMESTAMPTZ NOT NULL,
    temperature_c   NUMERIC(5,2),
    humidity_pct    NUMERIC(5,2),
    wind_speed_ms   NUMERIC(6,2),
    wind_direction  TEXT,
    precipitation   NUMERIC(6,2),           -- mm/hr
    lightning_dist  NUMERIC(8,2),           -- km to nearest strike
    condition       TEXT                    -- 'clear', 'storm', 'fog', 'ice'
);

CREATE TABLE IF NOT EXISTS maintenance_log (
    log_id          TEXT PRIMARY KEY,
    feeder_id       TEXT NOT NULL,
    asset_id        TEXT,
    work_type       TEXT NOT NULL,          -- 'repair', 'upgrade', 'inspection', 'replacement'
    status          TEXT NOT NULL,          -- 'scheduled', 'in_progress', 'completed', 'cancelled'
    scheduled_at    TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    technician_id   TEXT,
    notes           TEXT
);

-- Indexes for time-range queries (common in grid investigations)
-- Aurora DSQL requires ASYNC index creation
CREATE INDEX ASYNC IF NOT EXISTS idx_feeder_events_feeder_time  ON feeder_events  (feeder_id, recorded_at);
CREATE INDEX ASYNC IF NOT EXISTS idx_switching_events_feeder    ON switching_events (feeder_id, switched_at);
CREATE INDEX ASYNC IF NOT EXISTS idx_transformer_feeder         ON transformer_inspections (feeder_id, inspected_at);
CREATE INDEX ASYNC IF NOT EXISTS idx_weather_feeder_time        ON incident_weather (feeder_id, recorded_at);
CREATE INDEX ASYNC IF NOT EXISTS idx_incidents_feeder           ON grid_incidents (feeder_id, started_at);
CREATE INDEX ASYNC IF NOT EXISTS idx_maintenance_feeder         ON maintenance_log (feeder_id, scheduled_at);
