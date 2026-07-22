-- Migration: add retry fields to price_change_log for autopilot push reliability.
--
-- Context (29/04/2026): when /api/autopilot/push fails (timeout, 5xx, network),
-- the row stays at action_taken='none' and is never retried, leaving cells
-- "in attesa di invio auto" indefinitely. This migration enables a retry
-- sweep run by /api/cron/sync-and-etl every 15 minutes.
--
-- Idempotent: re-running is safe.

ALTER TABLE price_change_log
  ADD COLUMN IF NOT EXISTS retry_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS last_error TEXT NULL;

-- Partial index: only rows that are eligible for retry. Keeps the index
-- small even though price_change_log grows fast.
CREATE INDEX IF NOT EXISTS idx_price_change_log_retry
  ON price_change_log (next_retry_at)
  WHERE action_taken = 'none' AND next_retry_at IS NOT NULL;

-- Comment for docs.
COMMENT ON COLUMN price_change_log.retry_count IS
  'Number of retry attempts for autopilot push. Capped at 5; beyond that the row is considered permanently failed and reported to superadmin via daily health cron.';
COMMENT ON COLUMN price_change_log.next_retry_at IS
  'When the retry sweep should pick this row up again. NULL = no retry scheduled (either succeeded or permanently failed).';
COMMENT ON COLUMN price_change_log.last_error IS
  'Last error message captured from the failed push attempt. Useful for diagnostics.';
