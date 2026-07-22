-- chore: temporarily disable Casanova pms_cron_settings (gsheets integration, not Scidoo)
--
-- Podere Casanova uses pms_name='bedzzle' with integration_mode='gsheets',
-- NOT Scidoo. Leaving the 5 rows seeded earlier (bookings, availability,
-- minstay, occupied, production) with enabled=true would cause the
-- /api/cron/sync-modules cron to attempt Scidoo sync for this hotel at
-- the next 15-min tick, producing failed sync_logs entries.
--
-- This UPDATE disables all 5 rows so sync-modules skips them. Rows stay
-- in place for Phase 2 of the frequency migration (planned tomorrow);
-- re-enabling is a single UPDATE when the correct behavior for
-- gsheets-mode hotels is decided.

UPDATE pms_cron_settings
SET enabled = false, updated_at = NOW()
WHERE hotel_id = 'afedce7a-f8c7-48c1-9eae-4e7bae1c2dd6'
  AND module IN ('bookings', 'availability', 'minstay', 'occupied', 'production');
