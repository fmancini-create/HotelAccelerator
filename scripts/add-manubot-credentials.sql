-- Aggiunge colonne per autenticazione Manubot su properties
-- Queste colonne permettono ad HotelAccelerator di autenticarsi su Manubot
-- tramite il JWT Supabase di Manubot (POST /auth/v1/token?grant_type=password)

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS manubot_email        TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS manubot_password     TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS manubot_supabase_url TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS manubot_company_id   UUID DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS api_token            TEXT DEFAULT NULL;

-- Index per ricerca rapida tramite api_token (usato dal webhook receiver)
CREATE UNIQUE INDEX IF NOT EXISTS idx_properties_api_token
  ON properties(api_token)
  WHERE api_token IS NOT NULL;

-- Commenti descrittivi
COMMENT ON COLUMN properties.manubot_email        IS 'Email account Manubot per questa struttura';
COMMENT ON COLUMN properties.manubot_password     IS 'Password account Manubot (cifrata a riposo da Supabase)';
COMMENT ON COLUMN properties.manubot_supabase_url IS 'URL Supabase di Manubot per il login JWT';
COMMENT ON COLUMN properties.manubot_company_id   IS 'UUID company su Manubot corrispondente a questa property';
COMMENT ON COLUMN properties.api_token            IS 'Bearer token statico per webhook in ingresso da Manubot';
