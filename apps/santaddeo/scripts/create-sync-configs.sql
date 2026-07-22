-- Create sync_configs table for per-hotel sync scheduling
CREATE TABLE IF NOT EXISTS sync_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  auto_sync_enabled BOOLEAN NOT NULL DEFAULT false,
  sync_interval_minutes INTEGER NOT NULL DEFAULT 360,
  sync_start_date DATE DEFAULT NULL,
  sync_end_date DATE DEFAULT NULL,
  last_sync_at TIMESTAMPTZ DEFAULT NULL,
  last_sync_status TEXT DEFAULT NULL,
  last_sync_error TEXT DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT sync_configs_hotel_id_unique UNIQUE (hotel_id)
);

-- Index for quick lookup by hotel
CREATE INDEX IF NOT EXISTS idx_sync_configs_hotel_id ON sync_configs(hotel_id);
-- Index for cron: find all hotels due for sync
CREATE INDEX IF NOT EXISTS idx_sync_configs_auto_enabled ON sync_configs(auto_sync_enabled) WHERE auto_sync_enabled = true;

-- Enable RLS
ALTER TABLE sync_configs ENABLE ROW LEVEL SECURITY;

-- Policy: service_role can do everything (cron + superadmin API use service_role)
CREATE POLICY "Service role full access" ON sync_configs FOR ALL USING (true) WITH CHECK (true);

-- Insert default configs for existing hotels with active PMS integrations
INSERT INTO sync_configs (hotel_id, auto_sync_enabled, sync_interval_minutes)
SELECT h.id, true, 360
FROM hotels h
JOIN pms_integrations pi ON pi.hotel_id = h.id AND pi.is_active = true
WHERE h.deleted_at IS NULL
  AND NOT EXISTS (SELECT 1 FROM sync_configs sc WHERE sc.hotel_id = h.id)
ON CONFLICT (hotel_id) DO NOTHING;
