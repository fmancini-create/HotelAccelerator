-- Columns to persist the OAuth connection created by the hotel manager
-- when clicking "Connetti con Google" in /settings/advanced.
--
-- We store:
--   * the refresh token (long-lived, used to mint fresh access tokens)
--   * the email of the Google user who granted access (for display/audit)
--   * the timestamp at which the connection was made
--
-- Access tokens are NOT persisted: they expire after 1h and we obtain a
-- new one on every API call via the refresh token, which is simpler and
-- removes the need to lock around expiry.
ALTER TABLE public.hotel_integrations
  ADD COLUMN IF NOT EXISTS google_analytics_oauth_refresh_token text,
  ADD COLUMN IF NOT EXISTS google_analytics_oauth_email text,
  ADD COLUMN IF NOT EXISTS google_analytics_oauth_connected_at timestamptz;

COMMENT ON COLUMN public.hotel_integrations.google_analytics_oauth_refresh_token IS
  'OAuth 2.0 refresh token for the Google Analytics Data API. Issued when the user authorizes Santaddeo via /api/analytics/oauth/authorize.';
COMMENT ON COLUMN public.hotel_integrations.google_analytics_oauth_email IS
  'Email of the Google account that authorized the integration.';
COMMENT ON COLUMN public.hotel_integrations.google_analytics_oauth_connected_at IS
  'When the OAuth authorization was granted.';
