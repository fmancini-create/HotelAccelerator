-- Super Admin Platform Management Schema

-- Platform collaborators table (users who manage the platform itself)
CREATE TABLE IF NOT EXISTS platform_collaborators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  name text NOT NULL,
  role text NOT NULL CHECK (role IN ('super_admin', 'support', 'viewer')),
  is_active boolean DEFAULT true,
  last_login_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  created_by uuid REFERENCES platform_collaborators(id)
);

-- Add metadata fields to properties table for tenant management
ALTER TABLE properties 
  ADD COLUMN IF NOT EXISTS plan text DEFAULT 'trial' CHECK (plan IN ('trial', 'basic', 'pro', 'enterprise')),
  ADD COLUMN IF NOT EXISTS trial_ends_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS subscription_status text DEFAULT 'active' CHECK (subscription_status IN ('active', 'trial', 'suspended', 'cancelled')),
  ADD COLUMN IF NOT EXISTS monthly_price_cents integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS inbox_enabled boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS cms_enabled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_enabled boolean DEFAULT false;

-- Command logs table (already created in previous migration, ensure it has property_id)
-- This tracks all write operations for audit and analysis

-- Create indexes for super admin queries
CREATE INDEX IF NOT EXISTS idx_properties_subscription_status ON properties(subscription_status);
CREATE INDEX IF NOT EXISTS idx_properties_plan ON properties(plan);
CREATE INDEX IF NOT EXISTS idx_properties_trial_ends ON properties(trial_ends_at);
CREATE INDEX IF NOT EXISTS idx_platform_collaborators_email ON platform_collaborators(email);
CREATE INDEX IF NOT EXISTS idx_platform_collaborators_role ON platform_collaborators(role);

-- Enable RLS on platform_collaborators
ALTER TABLE platform_collaborators ENABLE ROW LEVEL SECURITY;

-- Only super admins can access platform_collaborators
CREATE POLICY "Super admins can manage platform collaborators"
  ON platform_collaborators
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM platform_collaborators pc
      WHERE pc.email = auth.jwt() ->> 'email'
      AND pc.role = 'super_admin'
      AND pc.is_active = true
    )
  );

-- Insert first super admin (replace with your email)
INSERT INTO platform_collaborators (email, name, role, is_active)
VALUES ('admin@hotelaccelerator.com', 'Platform Admin', 'super_admin', true)
ON CONFLICT (email) DO NOTHING;

COMMENT ON TABLE platform_collaborators IS 'Platform-level users who manage the SaaS platform itself';
COMMENT ON TABLE properties IS 'Tenant structures (hotels, villas, etc.) - each is an isolated tenant';
