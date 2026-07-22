-- Add GA4 Property ID column used by the Google Analytics Data API.
-- The Measurement ID (G-XXXXXXXXXX) is for the client-side tag only.
-- The Data API needs the numeric Property ID (e.g. 491853742).
ALTER TABLE public.hotel_integrations
  ADD COLUMN IF NOT EXISTS google_analytics_property_id text;

COMMENT ON COLUMN public.hotel_integrations.google_analytics_property_id IS
  'Numeric GA4 Property ID (e.g. 491853742). Required for the Analytics Data API. Found in Google Analytics > Admin > Property details.';
