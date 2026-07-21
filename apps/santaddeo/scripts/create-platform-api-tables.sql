-- ============================================================
-- Platform API Keys + Webhooks tables for Santaddeo Public API
-- ============================================================

-- 1. API Keys for inter-service authentication
CREATE TABLE IF NOT EXISTS platform_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  key_prefix TEXT NOT NULL,
  scopes TEXT[] NOT NULL DEFAULT '{}',
  allowed_ips TEXT[],
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  rate_limit_per_minute INT NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_platform_api_keys_hash ON platform_api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_platform_api_keys_org ON platform_api_keys(organization_id);
CREATE INDEX IF NOT EXISTS idx_platform_api_keys_prefix ON platform_api_keys(key_prefix);

-- 2. Webhooks for event-driven communication
CREATE TABLE IF NOT EXISTS platform_webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  events TEXT[] NOT NULL,
  secret TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_triggered_at TIMESTAMPTZ,
  last_status_code INT,
  failure_count INT NOT NULL DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_platform_webhooks_org ON platform_webhooks(organization_id);
CREATE INDEX IF NOT EXISTS idx_platform_webhooks_events ON platform_webhooks USING GIN(events);

-- 3. Webhook delivery log for debugging
CREATE TABLE IF NOT EXISTS platform_webhook_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id UUID NOT NULL REFERENCES platform_webhooks(id) ON DELETE CASCADE,
  event TEXT NOT NULL,
  payload JSONB NOT NULL,
  response_status INT,
  response_body TEXT,
  attempt INT NOT NULL DEFAULT 1,
  delivered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  duration_ms INT
);

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_webhook ON platform_webhook_deliveries(webhook_id);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_event ON platform_webhook_deliveries(event);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_date ON platform_webhook_deliveries(delivered_at DESC);

-- RLS policies
ALTER TABLE platform_api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_webhooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_webhook_deliveries ENABLE ROW LEVEL SECURITY;

-- Service role can do everything (used by API middleware)
CREATE POLICY "service_role_all_api_keys" ON platform_api_keys
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "service_role_all_webhooks" ON platform_webhooks
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "service_role_all_deliveries" ON platform_webhook_deliveries
  FOR ALL USING (true) WITH CHECK (true);
