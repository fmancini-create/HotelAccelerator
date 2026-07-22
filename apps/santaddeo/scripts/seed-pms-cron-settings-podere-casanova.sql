-- Seed pms_cron_settings for Podere Casanova (hotel_id: afedce7a-...)
--
-- Context:
-- Podere Casanova is the only active hotel without rows in pms_cron_settings.
-- Current sync_configs.sync_interval_minutes = 360 (6 hours).
-- We seed 5 standard module rows (bookings, availability, minstay, occupied, production)
-- with frequencies derived from the current 6-hour cadence.
--
-- fiscal_production is NOT included because it exists only for Villa I Barronci (1 of 4 hotels)
-- and is therefore not part of the standard module set.
--
-- This insert does NOT change any cron behavior today: the cron sync-and-etl still reads from
-- sync_configs. It is a pre-migration step so that when the cron switches to read from
-- pms_cron_settings (Phase 2, tomorrow), Podere Casanova has rows to be picked up
-- without relying on the sync_configs fallback.

INSERT INTO pms_cron_settings (hotel_id, module, enabled, frequency)
VALUES
  ('afedce7a-0e11-4107-a3bc-6a9e05adf50e', 'bookings',     true, 'every_6_hours'),
  ('afedce7a-0e11-4107-a3bc-6a9e05adf50e', 'availability', true, 'every_6_hours'),
  ('afedce7a-0e11-4107-a3bc-6a9e05adf50e', 'minstay',      true, 'daily'),
  ('afedce7a-0e11-4107-a3bc-6a9e05adf50e', 'occupied',     true, 'every_6_hours'),
  ('afedce7a-0e11-4107-a3bc-6a9e05adf50e', 'production',   true, 'daily')
ON CONFLICT (hotel_id, module) DO NOTHING;
