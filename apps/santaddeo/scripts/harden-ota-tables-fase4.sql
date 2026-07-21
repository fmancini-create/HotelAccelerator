-- ============================================================================
-- FASE 4 — OTA storage hardening (12/05/2026)
-- ============================================================================
-- Companion to FASE 2 (generalization to multiple OTA platforms) and
-- FASE 3 (signal scorer). Goals:
--
--   1. Enforce platform whitelist via CHECK constraint to prevent typos
--      (e.g. "booking" instead of "booking_com") from creating shadow rows
--      that no UI scopes correctly.
--   2. Add composite indexes on (hotel_id, platform, period_end DESC) to
--      keep per-platform tab queries fast as the snapshot volume grows.
--   3. Add missing columns (monthly_breakdown, report_type) that the
--      application code already writes but the original DDL did not include.
--      They were added ad-hoc; we make them official.
--   4. Add normalized_scores JSONB column as cache for the K-driven bridge:
--      stores the output of computeOtaSignalScores() so we can skip
--      recomputation between cron runs.
--   5. Add index on hotel_ota_reports (hotel_id, platform, created_at DESC)
--      for the per-platform history view in the settings tab.
--
-- Idempotent: safe to re-run.
-- ============================================================================

-- 1) Add columns first (must exist before we add CHECK using them).
--    The "monthly_breakdown" and "report_type" columns are referenced by the
--    UI today but were never in the canonical DDL — see hotel_ota_kpi_snapshots
--    in lib/database.types.ts. We bring them in as official columns now.
ALTER TABLE hotel_ota_kpi_snapshots
  ADD COLUMN IF NOT EXISTS monthly_breakdown JSONB,
  ADD COLUMN IF NOT EXISTS report_type TEXT,
  -- New: production fields (used by AI extractor + manual form).
  -- These were added ad-hoc by the booking-pdf-extractor flow.
  ADD COLUMN IF NOT EXISTS total_room_nights INTEGER,
  ADD COLUMN IF NOT EXISTS total_revenue NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS adr NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS prev_total_room_nights INTEGER,
  ADD COLUMN IF NOT EXISTS prev_total_revenue NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS prev_adr NUMERIC(10, 2),
  -- FASE 4: normalized signal scores cache (output of computeOtaSignalScores)
  ADD COLUMN IF NOT EXISTS normalized_scores JSONB DEFAULT '{}'::jsonb;

-- 2) Backfill `report_type` for legacy rows based on which fields are populated.
--    Rows with traffic AND production → 'mixed'; only one → that type;
--    neither → 'manual' (the user typed in something).
--    Skip rows that already have a value (so re-runs are no-ops).
UPDATE hotel_ota_kpi_snapshots
SET report_type = CASE
  WHEN (search_views IS NOT NULL OR property_views IS NOT NULL OR bookings_count IS NOT NULL)
       AND (total_revenue IS NOT NULL OR total_room_nights IS NOT NULL OR adr IS NOT NULL)
    THEN 'mixed'
  WHEN (total_revenue IS NOT NULL OR total_room_nights IS NOT NULL OR adr IS NOT NULL)
    THEN 'production'
  WHEN (search_views IS NOT NULL OR property_views IS NOT NULL OR bookings_count IS NOT NULL)
    THEN 'performance'
  ELSE 'manual'
END
WHERE report_type IS NULL;

-- 3) CHECK constraints. Wrap in DO block to make the ADD CONSTRAINT idempotent.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.hotel_ota_kpi_snapshots'::regclass
      AND conname = 'hotel_ota_kpi_snapshots_platform_check'
  ) THEN
    ALTER TABLE hotel_ota_kpi_snapshots
      ADD CONSTRAINT hotel_ota_kpi_snapshots_platform_check
      CHECK (platform IN ('booking_com', 'expedia'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.hotel_ota_kpi_snapshots'::regclass
      AND conname = 'hotel_ota_kpi_snapshots_report_type_check'
  ) THEN
    ALTER TABLE hotel_ota_kpi_snapshots
      ADD CONSTRAINT hotel_ota_kpi_snapshots_report_type_check
      CHECK (report_type IS NULL OR report_type IN ('performance','production','mixed','manual'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.hotel_ota_reports'::regclass
      AND conname = 'hotel_ota_reports_platform_check'
  ) THEN
    ALTER TABLE hotel_ota_reports
      ADD CONSTRAINT hotel_ota_reports_platform_check
      CHECK (platform IN ('booking_com', 'expedia'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.ota_reminder_settings'::regclass
      AND conname = 'ota_reminder_settings_platform_check'
  ) THEN
    ALTER TABLE ota_reminder_settings
      ADD CONSTRAINT ota_reminder_settings_platform_check
      CHECK (platform IN ('booking_com', 'expedia'));
  END IF;
END $$;

-- 4) Indexes. Composite (hotel_id, platform, period_end DESC) covers the
--    common query pattern from the per-platform tabs:
--    `WHERE hotel_id = $1 AND platform = $2 ORDER BY period_end DESC LIMIT 24`.
CREATE INDEX IF NOT EXISTS idx_ota_kpi_hotel_platform_period
  ON hotel_ota_kpi_snapshots(hotel_id, platform, period_end DESC);

CREATE INDEX IF NOT EXISTS idx_ota_reports_hotel_platform_date
  ON hotel_ota_reports(hotel_id, platform, created_at DESC);

-- 5) Final sanity: log how many rows in each table per platform, so the
--    operator running the migration sees the distribution.
DO $$
DECLARE
  k_booking INT;
  k_expedia INT;
  r_booking INT;
  r_expedia INT;
BEGIN
  SELECT COUNT(*) INTO k_booking FROM hotel_ota_kpi_snapshots WHERE platform = 'booking_com';
  SELECT COUNT(*) INTO k_expedia FROM hotel_ota_kpi_snapshots WHERE platform = 'expedia';
  SELECT COUNT(*) INTO r_booking FROM hotel_ota_reports WHERE platform = 'booking_com';
  SELECT COUNT(*) INTO r_expedia FROM hotel_ota_reports WHERE platform = 'expedia';
  RAISE NOTICE '[FASE 4] kpi_snapshots: booking_com=%, expedia=%', k_booking, k_expedia;
  RAISE NOTICE '[FASE 4] ota_reports:   booking_com=%, expedia=%', r_booking, r_expedia;
END $$;
