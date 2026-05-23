-- Auto-capture settings per tenant: controlla se salvare automaticamente
-- mittenti (email inbound) e destinatari TO (email outbound) come contatti CRM.
--
-- Policy update: i contatti gia esistenti restano IMMUTABILI. L'auto-capture
-- e solo additive (create-if-missing).

CREATE TABLE IF NOT EXISTS public.crm_auto_capture_settings (
  property_id       uuid PRIMARY KEY REFERENCES public.properties(id) ON DELETE CASCADE,
  enabled           boolean NOT NULL DEFAULT true,
  capture_inbound   boolean NOT NULL DEFAULT true,
  capture_outbound  boolean NOT NULL DEFAULT true,
  blacklist_domains text[]  NOT NULL DEFAULT ARRAY[]::text[],
  blacklist_keywords text[] NOT NULL DEFAULT ARRAY[]::text[],
  default_tag       text    NOT NULL DEFAULT 'email_auto',
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.crm_auto_capture_settings IS
  'Per-tenant policy for auto-creating CRM contacts from email senders (inbound) and TO recipients (outbound). Existing contacts are never modified.';

CREATE INDEX IF NOT EXISTS idx_crm_auto_capture_settings_updated_at
  ON public.crm_auto_capture_settings(updated_at DESC);

-- RLS: tenant-scoped, standard platform pattern
ALTER TABLE public.crm_auto_capture_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS crm_auto_capture_settings_service_role ON public.crm_auto_capture_settings;
CREATE POLICY crm_auto_capture_settings_service_role
  ON public.crm_auto_capture_settings
  AS PERMISSIVE
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS crm_auto_capture_settings_tenant ON public.crm_auto_capture_settings;
CREATE POLICY crm_auto_capture_settings_tenant
  ON public.crm_auto_capture_settings
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (
    property_id IN (
      SELECT au.property_id FROM public.admin_users au
      WHERE au.email = auth.jwt() ->> 'email'
    )
  )
  WITH CHECK (
    property_id IN (
      SELECT au.property_id FROM public.admin_users au
      WHERE au.email = auth.jwt() ->> 'email'
    )
  );

-- Auto-update updated_at on row changes
CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_crm_auto_capture_settings_updated_at
  ON public.crm_auto_capture_settings;
CREATE TRIGGER trg_crm_auto_capture_settings_updated_at
  BEFORE UPDATE ON public.crm_auto_capture_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Bootstrap settings row for existing properties so the feature is "on" by default
-- (matches current behavior where inbound mittenti vengono gia auto-creati).
INSERT INTO public.crm_auto_capture_settings (property_id)
SELECT id FROM public.properties
WHERE id NOT IN (SELECT property_id FROM public.crm_auto_capture_settings)
ON CONFLICT (property_id) DO NOTHING;
