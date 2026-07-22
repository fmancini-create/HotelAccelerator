-- =============================================================================
-- FattureInCloud invoices log table
-- Traccia le fatture create su FIC a partire da pagamenti Stripe
-- Idempotenza garantita da stripe_invoice_id UNIQUE
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.fic_invoices_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Riferimenti Stripe
  stripe_invoice_id TEXT NOT NULL UNIQUE,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  stripe_checkout_session_id TEXT,
  
  -- Riferimenti interni Santaddeo
  hotel_id UUID REFERENCES hotels(id) ON DELETE SET NULL,
  organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  
  -- Riferimenti FattureInCloud
  fic_document_id BIGINT,
  fic_document_number TEXT,
  fic_client_id BIGINT,
  
  -- Dati fattura
  amount_cents INT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'EUR',
  description TEXT,
  product_type TEXT, -- 'addon', 'accelerator_fee', 'setup', etc.
  
  -- Dati cliente fiscali (snapshot al momento della fattura)
  customer_email TEXT,
  customer_name TEXT,
  customer_vat_number TEXT,
  customer_tax_code TEXT,
  customer_sdi_code TEXT,
  customer_pec TEXT,
  customer_address JSONB,
  
  -- Status tracking
  status TEXT NOT NULL DEFAULT 'pending' 
    CHECK (status IN ('pending', 'created', 'sent', 'failed', 'skipped')),
  error_message TEXT,
  retry_count INT NOT NULL DEFAULT 0,
  
  -- Email invio
  email_sent_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indici
CREATE INDEX IF NOT EXISTS idx_fic_log_stripe_invoice ON fic_invoices_log(stripe_invoice_id);
CREATE INDEX IF NOT EXISTS idx_fic_log_stripe_customer ON fic_invoices_log(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_fic_log_hotel ON fic_invoices_log(hotel_id);
CREATE INDEX IF NOT EXISTS idx_fic_log_organization ON fic_invoices_log(organization_id);
CREATE INDEX IF NOT EXISTS idx_fic_log_status ON fic_invoices_log(status);
CREATE INDEX IF NOT EXISTS idx_fic_log_created ON fic_invoices_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fic_log_fic_document ON fic_invoices_log(fic_document_id);

-- RLS: service_role only (webhook context, no user session)
ALTER TABLE fic_invoices_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_full_access" ON fic_invoices_log;
CREATE POLICY "service_role_full_access" ON fic_invoices_log
  FOR ALL USING (auth.role() = 'service_role');

-- Super admin read access per UI superadmin
DROP POLICY IF EXISTS "super_admin_read_access" ON fic_invoices_log;
CREATE POLICY "super_admin_read_access" ON fic_invoices_log
  FOR SELECT TO authenticated
  USING (is_super_admin());

-- Trigger updated_at (usa funzione esistente set_updated_at)
DROP TRIGGER IF EXISTS trg_fic_invoices_log_updated_at ON fic_invoices_log;
CREATE TRIGGER trg_fic_invoices_log_updated_at 
  BEFORE UPDATE ON fic_invoices_log 
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Commento tabella
COMMENT ON TABLE fic_invoices_log IS 'Log delle fatture create su FattureInCloud da webhook Stripe. stripe_invoice_id UNIQUE garantisce idempotenza.';
