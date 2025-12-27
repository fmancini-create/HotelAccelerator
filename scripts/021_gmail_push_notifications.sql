-- Migration: Add Gmail Push Notification support to email_channels
-- Version: 021
-- Date: 2025-12-27

-- Add columns for Gmail Watch (Pub/Sub push notifications)
ALTER TABLE email_channels
ADD COLUMN IF NOT EXISTS gmail_watch_expiration TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS gmail_history_id BIGINT,
ADD COLUMN IF NOT EXISTS push_enabled BOOLEAN DEFAULT false;

-- Add index for efficient watch renewal queries
CREATE INDEX IF NOT EXISTS idx_email_channels_watch_expiration 
ON email_channels(gmail_watch_expiration) 
WHERE provider = 'gmail' AND push_enabled = true;

-- Comment
COMMENT ON COLUMN email_channels.gmail_watch_expiration IS 'When the Gmail watch expires (must be renewed every 7 days)';
COMMENT ON COLUMN email_channels.gmail_history_id IS 'Last known Gmail history ID for incremental sync';
COMMENT ON COLUMN email_channels.push_enabled IS 'Whether push notifications are enabled for this channel';
