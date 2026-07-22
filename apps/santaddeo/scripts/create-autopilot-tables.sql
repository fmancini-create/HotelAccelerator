-- Autopilot configuration per hotel
CREATE TABLE IF NOT EXISTS autopilot_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  mode TEXT NOT NULL DEFAULT 'disabled' CHECK (mode IN ('disabled', 'notify', 'autopilot')),
  notify_emails TEXT[] DEFAULT '{}',
  last_notification_at TIMESTAMPTZ,
  last_push_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(hotel_id)
);

-- Log of all price change events (notifications sent, pushes executed)
CREATE TABLE IF NOT EXISTS autopilot_price_changes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  triggered_at TIMESTAMPTZ DEFAULT now(),
  mode TEXT NOT NULL CHECK (mode IN ('disabled', 'notify', 'autopilot', 'manual')),
  changes JSONB NOT NULL DEFAULT '[]',
  changes_hash TEXT,
  notification_sent BOOLEAN DEFAULT false,
  push_sent BOOLEAN DEFAULT false,
  push_result JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_autopilot_configs_hotel ON autopilot_configs(hotel_id);
CREATE INDEX IF NOT EXISTS idx_autopilot_price_changes_hotel ON autopilot_price_changes(hotel_id);
CREATE INDEX IF NOT EXISTS idx_autopilot_price_changes_hash ON autopilot_price_changes(hotel_id, changes_hash);
CREATE INDEX IF NOT EXISTS idx_autopilot_price_changes_triggered ON autopilot_price_changes(hotel_id, triggered_at DESC);

-- RLS policies
ALTER TABLE autopilot_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE autopilot_price_changes ENABLE ROW LEVEL SECURITY;

-- Service role can do everything (used by API routes)
CREATE POLICY "Service role full access autopilot_configs"
  ON autopilot_configs FOR ALL
  USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access autopilot_price_changes"
  ON autopilot_price_changes FOR ALL
  USING (true) WITH CHECK (true);
