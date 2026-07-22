-- Create addon_subscriptions table for Premium Expert addon
-- This tracks users/hotels that have purchased additional addons like Premium Expert (consultant forwarding)

CREATE TABLE IF NOT EXISTS addon_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id UUID REFERENCES hotels(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  addon_type TEXT NOT NULL CHECK (addon_type IN ('premium_expert', 'custom_reports', 'api_access')),
  stripe_subscription_id TEXT,
  stripe_customer_id TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'canceled', 'past_due', 'trialing', 'unpaid')),
  price_cents INTEGER NOT NULL DEFAULT 49900, -- 499 EUR/year
  billing_interval TEXT NOT NULL DEFAULT 'year' CHECK (billing_interval IN ('month', 'year')),
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Ensure one addon type per hotel
  UNIQUE(hotel_id, addon_type)
);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_addon_subscriptions_hotel ON addon_subscriptions(hotel_id);
CREATE INDEX IF NOT EXISTS idx_addon_subscriptions_user ON addon_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_addon_subscriptions_stripe ON addon_subscriptions(stripe_subscription_id);

-- Add RLS policies
ALTER TABLE addon_subscriptions ENABLE ROW LEVEL SECURITY;

-- Users can read their own addon subscriptions
CREATE POLICY "Users can view own addon subscriptions" ON addon_subscriptions
  FOR SELECT USING (
    auth.uid() = user_id OR
    hotel_id IN (SELECT id FROM hotels WHERE owner_id = auth.uid())
  );

-- Only service role can insert/update (via API)
CREATE POLICY "Service role can manage addon subscriptions" ON addon_subscriptions
  FOR ALL USING (auth.role() = 'service_role');

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_addon_subscriptions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS addon_subscriptions_updated_at ON addon_subscriptions;
CREATE TRIGGER addon_subscriptions_updated_at
  BEFORE UPDATE ON addon_subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_addon_subscriptions_updated_at();
