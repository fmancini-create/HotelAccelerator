-- Stripe subscriptions tracking
CREATE TABLE IF NOT EXISTS public.stripe_subscriptions (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id            uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  plan_id                text NOT NULL,
  plan_type              text NOT NULL,
  stripe_customer_id     text,
  stripe_subscription_id text,
  status                 text NOT NULL DEFAULT 'active',
  room_count             integer NOT NULL DEFAULT 10,
  current_period_start   timestamptz,
  current_period_end     timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_stripe_subscriptions_property_plan
  ON public.stripe_subscriptions(property_id, plan_id);
CREATE INDEX IF NOT EXISTS idx_stripe_subscriptions_customer
  ON public.stripe_subscriptions(stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_stripe_subscriptions_status
  ON public.stripe_subscriptions(status);

ALTER TABLE public.stripe_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY stripe_subscriptions_service_role ON public.stripe_subscriptions
  AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY stripe_subscriptions_tenant_read ON public.stripe_subscriptions
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (property_id IN (SELECT au.property_id FROM public.admin_users au WHERE au.email = auth.jwt() ->> 'email'));

CREATE TRIGGER trg_stripe_subscriptions_updated_at BEFORE UPDATE ON public.stripe_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Invoices table (for FIC + Stripe tracking)
CREATE TABLE IF NOT EXISTS public.invoices (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id             uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  stripe_payment_intent_id text,
  stripe_invoice_id       text,
  fic_invoice_id          integer,
  fic_invoice_number      text,
  amount_cents            integer NOT NULL,
  status                  text NOT NULL DEFAULT 'draft',
  plan_id                 text,
  issue_date              date,
  period_start            date,
  period_end              date,
  pdf_url                 text,
  pdf_file_name           text,
  notes                   text,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoices_property ON public.invoices(property_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON public.invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_issue_date ON public.invoices(property_id, issue_date DESC);

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY invoices_service_role ON public.invoices
  AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY invoices_tenant_read ON public.invoices
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (property_id IN (SELECT au.property_id FROM public.admin_users au WHERE au.email = auth.jwt() ->> 'email'));

CREATE TRIGGER trg_invoices_updated_at BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Billing columns on properties
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS billing_company_name text;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS billing_vat text;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS billing_tax_code text;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS billing_address text;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS billing_city text;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS billing_postal_code text;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS billing_province text;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS billing_pec text;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS billing_sdi text;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS billing_email text;
