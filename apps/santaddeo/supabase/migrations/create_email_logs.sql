-- email_logs: tracks all alert emails sent by the platform
-- Used for throttling (avoid spamming the same alert within 60 minutes)
-- and for auditing purposes

CREATE TABLE IF NOT EXISTS email_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id UUID REFERENCES hotels(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL,
  message TEXT,
  recipient_email TEXT,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  success BOOLEAN NOT NULL DEFAULT false
);

-- Index for the throttle lookup: hotel_id + alert_type + sent_at DESC
CREATE INDEX IF NOT EXISTS idx_email_logs_throttle
  ON email_logs (hotel_id, alert_type, sent_at DESC);

-- Enable RLS
ALTER TABLE email_logs ENABLE ROW LEVEL SECURITY;

-- Only super_admin can read email logs
CREATE POLICY "Super admins can view email_logs"
  ON email_logs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role IN ('super_admin', 'superadmin')
    )
  );

-- Service role full access (for writing from cron/API routes)
CREATE POLICY "Service role full access on email_logs"
  ON email_logs
  FOR ALL
  USING (true)
  WITH CHECK (true);
