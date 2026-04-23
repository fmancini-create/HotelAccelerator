-- Add progress tracking columns for full historical sync on Gmail channels.
-- Rationale: /api/channels/email/sync/full is a resumable paginated job.
-- These columns let the client resume across browser refreshes, show progress,
-- and prevent concurrent duplicate jobs.

ALTER TABLE email_channels
  ADD COLUMN IF NOT EXISTS full_sync_status text NOT NULL DEFAULT 'idle'
    CHECK (full_sync_status IN ('idle','running','completed','failed')),
  ADD COLUMN IF NOT EXISTS full_sync_page_token text,
  ADD COLUMN IF NOT EXISTS full_sync_processed integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS full_sync_imported integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS full_sync_duplicates integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS full_sync_errors integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS full_sync_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS full_sync_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS full_sync_last_error text;

-- Index to find channels whose full sync is still running (for possible
-- resume-on-login or cron recovery in the future).
CREATE INDEX IF NOT EXISTS idx_email_channels_full_sync_status
  ON email_channels (full_sync_status)
  WHERE full_sync_status = 'running';
