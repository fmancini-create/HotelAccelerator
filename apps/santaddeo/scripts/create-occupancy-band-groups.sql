-- Create occupancy_band_groups table for seasonality-based band grouping
CREATE TABLE IF NOT EXISTS occupancy_band_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Default',
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_obg_hotel ON occupancy_band_groups(hotel_id);

-- Add group_id column to occupancy_bands (nullable for migration)
ALTER TABLE occupancy_bands
  ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES occupancy_band_groups(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_ob_group ON occupancy_bands(group_id);
