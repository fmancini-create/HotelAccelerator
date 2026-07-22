-- Price change log: tracks every price modification in the pricing grid
CREATE TABLE IF NOT EXISTS price_change_log (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  hotel_id uuid NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  room_type_id uuid NOT NULL REFERENCES room_types(id) ON DELETE CASCADE,
  rate_id uuid NOT NULL REFERENCES rates(id) ON DELETE CASCADE,
  occupancy integer NOT NULL DEFAULT 2,
  target_date date NOT NULL,
  old_price numeric,
  new_price numeric NOT NULL,
  changed_by uuid REFERENCES profiles(id),
  changed_at timestamptz DEFAULT now() NOT NULL,
  source text DEFAULT 'manual_grid' -- 'manual_grid', 'drag_fill', 'bulk_fill', 'publish_suggested', 'autopilot_push', 'autopilot_calculated'
);

-- Index for fast lookups by cell
CREATE INDEX IF NOT EXISTS idx_price_change_log_cell
  ON price_change_log (hotel_id, room_type_id, rate_id, occupancy, target_date, changed_at DESC);

-- Index for hotel-wide queries
CREATE INDEX IF NOT EXISTS idx_price_change_log_hotel
  ON price_change_log (hotel_id, changed_at DESC);

-- RLS
ALTER TABLE price_change_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "price_change_log_select" ON price_change_log;
CREATE POLICY "price_change_log_select" ON price_change_log
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "price_change_log_insert" ON price_change_log;
CREATE POLICY "price_change_log_insert" ON price_change_log
  FOR INSERT WITH CHECK (true);

-- DISABLED: Trigger removed to avoid double logging
-- The POST /api/accelerator/pricing-grid endpoint now handles all price_change_log writes
-- This ensures single point of truth and granular source tracking
-- DROP TRIGGER IF EXISTS trg_price_change_log ON pricing_grid;
