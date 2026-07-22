-- Create connector_health_logs table for PMS sync health monitoring
-- Detects inconsistencies between PMS raw data and RMS normalized bookings

CREATE TABLE IF NOT EXISTS connector_health_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  connector TEXT NOT NULL DEFAULT 'scidoo',
  raw_total INTEGER NOT NULL DEFAULT 0,
  rms_total INTEGER NOT NULL DEFAULT 0,
  raw_cancelled INTEGER NOT NULL DEFAULT 0,
  rms_cancelled INTEGER NOT NULL DEFAULT 0,
  diff_total INTEGER NOT NULL DEFAULT 0,
  diff_cancelled INTEGER NOT NULL DEFAULT 0,
  alert_triggered BOOLEAN NOT NULL DEFAULT FALSE,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_connector_health_logs_hotel_id ON connector_health_logs(hotel_id);
CREATE INDEX IF NOT EXISTS idx_connector_health_logs_checked_at ON connector_health_logs(checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_connector_health_logs_alert_triggered ON connector_health_logs(alert_triggered) WHERE alert_triggered = TRUE;

-- Add comment
COMMENT ON TABLE connector_health_logs IS 'Logs health checks comparing PMS raw bookings with RMS normalized bookings';
