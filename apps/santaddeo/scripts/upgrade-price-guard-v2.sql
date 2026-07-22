-- =============================================================================
-- Upgrade Price Guard to v2
-- - Per-night checks (not just check_in_date)
-- - Time-tolerance in minutes (besides the existing % tolerance)
-- - Better dedup (booking_id + checkin_date instead of just booking_id)
-- =============================================================================

-- 1) autopilot_configs: add guard_time_tolerance_min (default 60 minutes)
ALTER TABLE autopilot_configs
  ADD COLUMN IF NOT EXISTS guard_time_tolerance_min INT NOT NULL DEFAULT 60;

COMMENT ON COLUMN autopilot_configs.guard_time_tolerance_min IS
  'Minutes of tolerance when matching a booking to the last-sent price. If the price was sent within this window before the booking, the PREVIOUS price is also considered valid (channels may not have propagated the new value yet).';

-- 2) price_guard_checks: add missing columns
ALTER TABLE price_guard_checks
  ADD COLUMN IF NOT EXISTS checkout_date DATE,
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS night_index INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS minutes_before_booking INT;

COMMENT ON COLUMN price_guard_checks.night_index IS
  'For multi-night bookings: 0 = first night, 1 = second, etc. Each stay produces N rows (N = nights booked).';
COMMENT ON COLUMN price_guard_checks.sent_at IS
  'sent_at timestamp of the last_sent_prices row that produced expected_price.';
COMMENT ON COLUMN price_guard_checks.minutes_before_booking IS
  'How many minutes before the booking the expected price was published.';

-- 3) Dedup key: allow scanning the same booking multiple times (once per night)
--    Drop any old unique constraint on booking_id alone and add a composite one.
DO $$
BEGIN
  -- try to drop legacy single-column unique if it exists (by convention name)
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'price_guard_checks_booking_id_key'
  ) THEN
    ALTER TABLE price_guard_checks DROP CONSTRAINT price_guard_checks_booking_id_key;
  END IF;
END $$;

-- A booking+night is the natural dedup key. We cannot enforce it as UNIQUE
-- because null hotel_id / null booking_id would cause issues, but we add a
-- regular index so the scan can efficiently skip already-checked rows.
CREATE INDEX IF NOT EXISTS idx_price_guard_checks_dedup
  ON price_guard_checks(hotel_id, booking_id, checkin_date);

-- 4) Helpful index for the UI (order by checked_at DESC with filter by result)
CREATE INDEX IF NOT EXISTS idx_price_guard_checks_hotel_checked
  ON price_guard_checks(hotel_id, checked_at DESC);

-- Verify outcome
SELECT 'autopilot_configs.guard_time_tolerance_min:' AS info,
       COUNT(*) FILTER (WHERE column_name = 'guard_time_tolerance_min') AS added
FROM information_schema.columns
WHERE table_schema='public' AND table_name='autopilot_configs';
