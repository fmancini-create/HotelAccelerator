-- Migration 033: Add Google Sheets integration mode to pms_integrations
-- Allows each PMS integration to work via API or via Google Sheets

-- Add integration_mode column (default 'api' for backward compatibility)
ALTER TABLE pms_integrations 
  ADD COLUMN IF NOT EXISTS integration_mode TEXT NOT NULL DEFAULT 'api';

-- Add Google Sheets specific configuration fields
ALTER TABLE pms_integrations 
  ADD COLUMN IF NOT EXISTS gsheet_spreadsheet_id TEXT,
  ADD COLUMN IF NOT EXISTS gsheet_spreadsheet_url TEXT,
  ADD COLUMN IF NOT EXISTS gsheet_service_account_email TEXT,
  ADD COLUMN IF NOT EXISTS gsheet_last_sync_at TIMESTAMPTZ;

-- Add constraint for valid integration modes
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pms_integrations_integration_mode_check'
  ) THEN
    ALTER TABLE pms_integrations 
      ADD CONSTRAINT pms_integrations_integration_mode_check 
      CHECK (integration_mode IN ('api', 'gsheets'));
  END IF;
END$$;

-- Add comment for documentation
COMMENT ON COLUMN pms_integrations.integration_mode IS 'How data is fetched: api (direct API calls) or gsheets (via Google Sheets)';
COMMENT ON COLUMN pms_integrations.gsheet_spreadsheet_id IS 'Google Sheets spreadsheet ID for gsheets mode';
COMMENT ON COLUMN pms_integrations.gsheet_spreadsheet_url IS 'Full URL to the Google Sheet for easy reference';
COMMENT ON COLUMN pms_integrations.gsheet_service_account_email IS 'Service account email that needs read access to the sheet';
COMMENT ON COLUMN pms_integrations.gsheet_last_sync_at IS 'Last time data was synced from Google Sheets';
