-- Migration: Add rate mapping fields for parent-child relationships and rate types
-- This enables proper mapping of NR (Non-Refundable) and derived rates

-- Add parent_rate_id to establish rate hierarchy
-- NULL = base rate (e.g., "Standard", "Superior")
-- UUID = derived rate that inherits from parent (e.g., "Standard NR" -> "Standard")
ALTER TABLE rates ADD COLUMN IF NOT EXISTS parent_rate_id UUID REFERENCES rates(id);

-- Add rate_type to categorize rates
-- 'standard' = base rate (default)
-- 'nr' = non-refundable rate
-- 'promo' = promotional rate
-- 'package' = package rate
-- 'derived' = other derived rate
ALTER TABLE rates ADD COLUMN IF NOT EXISTS rate_type VARCHAR(20) DEFAULT 'standard';

-- Add applicable_room_type_ids to specify which room types this rate applies to
-- NULL = applies to all room types
-- Array of UUIDs = applies only to specified room types
ALTER TABLE rates ADD COLUMN IF NOT EXISTS applicable_room_type_ids UUID[] DEFAULT NULL;

-- Add min/max occupancy for this rate
ALTER TABLE rates ADD COLUMN IF NOT EXISTS min_occupancy INTEGER DEFAULT 1;
ALTER TABLE rates ADD COLUMN IF NOT EXISTS max_occupancy INTEGER DEFAULT NULL;

-- Add discount_percentage for derived rates (e.g., -10 for 10% discount on NR)
ALTER TABLE rates ADD COLUMN IF NOT EXISTS discount_percentage NUMERIC(5,2) DEFAULT NULL;

-- Add release_days for NR rates (how many days before check-in the rate closes)
ALTER TABLE rates ADD COLUMN IF NOT EXISTS release_days INTEGER DEFAULT NULL;

-- Add is_mapped flag to track if rate has been properly configured
ALTER TABLE rates ADD COLUMN IF NOT EXISTS is_mapped BOOLEAN DEFAULT FALSE;

-- Add mapping_notes for admin notes during mapping process
ALTER TABLE rates ADD COLUMN IF NOT EXISTS mapping_notes TEXT DEFAULT NULL;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_rates_parent_rate_id ON rates(parent_rate_id);
CREATE INDEX IF NOT EXISTS idx_rates_rate_type ON rates(rate_type);
CREATE INDEX IF NOT EXISTS idx_rates_hotel_id_rate_type ON rates(hotel_id, rate_type);

-- Add check constraint for rate_type
ALTER TABLE rates DROP CONSTRAINT IF EXISTS rates_rate_type_check;
ALTER TABLE rates ADD CONSTRAINT rates_rate_type_check 
  CHECK (rate_type IN ('standard', 'nr', 'promo', 'package', 'derived'));

-- Create a view for unmapped rates (useful for onboarding)
CREATE OR REPLACE VIEW v_unmapped_rates AS
SELECT 
  r.id,
  r.hotel_id,
  h.name as hotel_name,
  r.name as rate_name,
  r.code as rate_code,
  r.rate_type,
  r.parent_rate_id,
  pr.name as parent_rate_name,
  r.is_mapped,
  r.created_at
FROM rates r
JOIN hotels h ON r.hotel_id = h.id
LEFT JOIN rates pr ON r.parent_rate_id = pr.id
WHERE r.is_mapped = FALSE
ORDER BY r.hotel_id, r.name;

-- Add RLS policy for the view
DROP POLICY IF EXISTS "Users can view unmapped rates for their hotels" ON rates;

-- Comment for documentation
COMMENT ON COLUMN rates.parent_rate_id IS 'Reference to parent rate for derived rates (NR, promo). NULL for base rates.';
COMMENT ON COLUMN rates.rate_type IS 'Type of rate: standard, nr, promo, package, derived';
COMMENT ON COLUMN rates.applicable_room_type_ids IS 'Array of room type IDs this rate applies to. NULL means all room types.';
COMMENT ON COLUMN rates.discount_percentage IS 'Discount percentage for derived rates (e.g., -10 for 10% off)';
COMMENT ON COLUMN rates.release_days IS 'Days before check-in when rate closes (for NR rates)';
COMMENT ON COLUMN rates.is_mapped IS 'Whether this rate has been properly configured during onboarding';
