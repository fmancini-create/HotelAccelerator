-- Create table for commission plan requests
CREATE TABLE IF NOT EXISTS commission_plan_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  
  -- Request details
  algorithm_type TEXT NOT NULL DEFAULT 'basic',
  auto_pilot BOOLEAN NOT NULL DEFAULT false,
  requested_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  -- Status: pending, approved, rejected, cancelled
  status TEXT NOT NULL DEFAULT 'pending',
  status_changed_at TIMESTAMP WITH TIME ZONE,
  status_changed_by UUID REFERENCES auth.users(id),
  status_notes TEXT,
  
  -- Contract acceptance
  contract_accepted BOOLEAN NOT NULL DEFAULT false,
  contract_accepted_at TIMESTAMP WITH TIME ZONE,
  contract_version TEXT DEFAULT '1.0',
  
  -- Admin notification tracking
  admin_notified BOOLEAN NOT NULL DEFAULT false,
  admin_notified_at TIMESTAMP WITH TIME ZONE,
  
  -- User notification tracking
  user_email_sent BOOLEAN NOT NULL DEFAULT false,
  user_email_sent_at TIMESTAMP WITH TIME ZONE,
  
  -- Additional data
  notes TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_commission_requests_hotel ON commission_plan_requests(hotel_id);
CREATE INDEX IF NOT EXISTS idx_commission_requests_user ON commission_plan_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_commission_requests_status ON commission_plan_requests(status);
CREATE INDEX IF NOT EXISTS idx_commission_requests_requested_at ON commission_plan_requests(requested_at DESC);

-- RLS policies
ALTER TABLE commission_plan_requests ENABLE ROW LEVEL SECURITY;

-- Users can see their own requests
CREATE POLICY "Users can view own commission requests"
  ON commission_plan_requests FOR SELECT
  USING (user_id = auth.uid());

-- Users can create requests for their hotels
CREATE POLICY "Users can create commission requests"
  ON commission_plan_requests FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Superadmins can do everything
CREATE POLICY "Superadmins can manage all commission requests"
  ON commission_plan_requests FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND (profiles.role = 'system_admin' OR profiles.is_superadmin = true)
    )
  );

-- Add contract_accepted column to accelerator_subscriptions for fee plans
ALTER TABLE accelerator_subscriptions 
  ADD COLUMN IF NOT EXISTS contract_accepted BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS contract_accepted_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS contract_version TEXT DEFAULT '1.0';

COMMENT ON TABLE commission_plan_requests IS 'Richieste di attivazione piano a commissione - richiedono approvazione manuale';
