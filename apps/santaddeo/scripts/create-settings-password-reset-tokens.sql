-- Table for settings password reset tokens
CREATE TABLE IF NOT EXISTS settings_password_reset_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  expires_at timestamptz NOT NULL,
  used boolean DEFAULT false,
  used_at timestamptz,
  created_at timestamptz DEFAULT now(),
  
  CONSTRAINT unique_hotel_token UNIQUE (hotel_id)
);

-- Index for token lookup
CREATE INDEX IF NOT EXISTS idx_settings_password_reset_tokens_token ON settings_password_reset_tokens(token);

-- RLS
ALTER TABLE settings_password_reset_tokens ENABLE ROW LEVEL SECURITY;

-- Allow service role full access
CREATE POLICY "Service role full access on settings_password_reset_tokens"
  ON settings_password_reset_tokens
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
