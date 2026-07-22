-- Create room_type_rate_limits table
-- Stores bottom_rate (floor) and rack_rate (ceiling) per hotel + room type
-- Used by the pricing algorithm to clamp suggested prices

CREATE TABLE IF NOT EXISTS room_type_rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  room_type_id UUID NOT NULL REFERENCES room_types(id) ON DELETE CASCADE,
  bottom_rate NUMERIC NOT NULL DEFAULT 0,
  rack_rate NUMERIC NOT NULL DEFAULT 999,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(hotel_id, room_type_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_rate_limits_hotel ON room_type_rate_limits(hotel_id);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_rate_limits_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_rate_limits_updated_at ON room_type_rate_limits;
CREATE TRIGGER trg_rate_limits_updated_at
  BEFORE UPDATE ON room_type_rate_limits
  FOR EACH ROW
  EXECUTE FUNCTION update_rate_limits_updated_at();
