-- Add VRBO and Airbnb review channels to hotel_integrations.
--
-- These behave exactly like the existing booking_com / tripadvisor / expedia
-- columns: one URL + one "last sync" timestamp per channel. The Apify review
-- service will pick them up and run the matching actor for each hotel that has
-- the URL configured.
--
-- Idempotent: safe to re-run.

ALTER TABLE public.hotel_integrations
  ADD COLUMN IF NOT EXISTS vrbo_url text,
  ADD COLUMN IF NOT EXISTS airbnb_url text,
  ADD COLUMN IF NOT EXISTS vrbo_last_sync_at timestamptz,
  ADD COLUMN IF NOT EXISTS airbnb_last_sync_at timestamptz;

COMMENT ON COLUMN public.hotel_integrations.vrbo_url IS
  'URL of the property page on VRBO. When set, the Apify review sync will pull reviews from VRBO for this hotel.';
COMMENT ON COLUMN public.hotel_integrations.airbnb_url IS
  'URL of the listing/room page on Airbnb. When set, the Apify review sync will pull reviews from Airbnb for this hotel.';
