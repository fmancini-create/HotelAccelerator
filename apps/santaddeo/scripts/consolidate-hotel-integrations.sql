-- Consolidates all integration config into `hotel_integrations`.
--
-- Context: historically some integration fields lived on `hotels`
-- (google_places_api_key, google_maps_place_id, etc.) and some on
-- `hotel_integrations`. This mixed model caused the Advanced Settings form
-- to appear "not saving" values: the PATCH wrote to hotel_integrations while
-- the form kept reading from hotels. We now make hotel_integrations the
-- canonical source and backfill any legacy data.
--
-- Idempotent. Safe to run multiple times.

ALTER TABLE hotel_integrations
  ADD COLUMN IF NOT EXISTS google_maps_place_name TEXT,
  ADD COLUMN IF NOT EXISTS google_maps_place_address TEXT,
  ADD COLUMN IF NOT EXISTS google_analytics_api_key TEXT;

-- Backfill from `hotels` only where hotel_integrations has no row yet, and
-- where existing values win (COALESCE on ON CONFLICT).
INSERT INTO hotel_integrations (
  hotel_id,
  google_places_api_key,
  google_maps_place_id,
  google_maps_url,
  google_maps_place_name,
  google_maps_place_address,
  google_analytics_id,
  google_analytics_api_key,
  weather_api_key,
  weather_api_provider,
  booking_com_username,
  booking_com_password,
  created_at,
  updated_at
)
SELECT
  h.id,
  h.google_places_api_key,
  h.google_maps_place_id,
  h.google_maps_url,
  h.google_maps_place_name,
  h.google_maps_place_address,
  h.google_analytics_id,
  h.google_analytics_api_key,
  h.weather_api_key,
  h.weather_api_provider,
  h.booking_com_username,
  h.booking_com_password,
  NOW(),
  NOW()
FROM hotels h
WHERE (
  h.google_maps_place_id IS NOT NULL
  OR h.google_places_api_key IS NOT NULL
  OR h.google_analytics_id IS NOT NULL
  OR h.weather_api_key IS NOT NULL
  OR h.booking_com_username IS NOT NULL
)
ON CONFLICT (hotel_id) DO UPDATE SET
  google_places_api_key     = COALESCE(hotel_integrations.google_places_api_key, EXCLUDED.google_places_api_key),
  google_maps_place_id      = COALESCE(hotel_integrations.google_maps_place_id, EXCLUDED.google_maps_place_id),
  google_maps_url           = COALESCE(hotel_integrations.google_maps_url, EXCLUDED.google_maps_url),
  google_maps_place_name    = COALESCE(hotel_integrations.google_maps_place_name, EXCLUDED.google_maps_place_name),
  google_maps_place_address = COALESCE(hotel_integrations.google_maps_place_address, EXCLUDED.google_maps_place_address),
  google_analytics_id       = COALESCE(hotel_integrations.google_analytics_id, EXCLUDED.google_analytics_id),
  google_analytics_api_key  = COALESCE(hotel_integrations.google_analytics_api_key, EXCLUDED.google_analytics_api_key),
  weather_api_key           = COALESCE(hotel_integrations.weather_api_key, EXCLUDED.weather_api_key),
  weather_api_provider      = COALESCE(hotel_integrations.weather_api_provider, EXCLUDED.weather_api_provider),
  booking_com_username      = COALESCE(hotel_integrations.booking_com_username, EXCLUDED.booking_com_username),
  booking_com_password      = COALESCE(hotel_integrations.booking_com_password, EXCLUDED.booking_com_password),
  updated_at                = NOW();
