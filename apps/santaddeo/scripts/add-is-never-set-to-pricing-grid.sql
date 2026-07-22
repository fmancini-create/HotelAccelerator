-- MIGRATION: Add semantic distinction between "never set" vs "reset to 0" 
-- Adds two columns to pricing_grid to track whether a price has ever been explicitly set

-- 1. Add columns to pricing_grid
ALTER TABLE pricing_grid
ADD COLUMN IF NOT EXISTS is_never_set boolean NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS first_set_at timestamptz NULL;

-- 2. Create index for fast queries on is_never_set (useful for finding unfilled cells)
CREATE INDEX IF NOT EXISTS idx_pricing_grid_never_set
  ON pricing_grid (hotel_id, is_never_set, date, room_type_id, rate_id)
  WHERE is_never_set = true;

-- 3. MIGRATION: Set is_never_set = false for all existing records
-- Logic: if a record exists in pricing_grid, it means that cell was saved at least once
-- So it's NOT "never set" - it's been set at least once in the past
UPDATE pricing_grid
SET is_never_set = false,
    first_set_at = created_at
WHERE is_never_set = true;

-- 4. Add constraint to ensure consistency: if price = 0 but is_never_set = false, 
-- it means "azzerato/reset", not "never set"
-- (This is a logical constraint, not a DB constraint, but documented here)
COMMENT ON COLUMN pricing_grid.is_never_set IS 
  'Semantic flag: true = cell never explicitly set; false = cell set at least once (even if current price is 0)';
COMMENT ON COLUMN pricing_grid.first_set_at IS
  'Timestamp of first explicit assignment to this cell. NULL until first non-null insertion.';
