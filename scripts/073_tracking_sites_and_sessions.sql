-- ============================================================================
-- 073: Tracking sites registry + sessions table + events enrichment
-- ----------------------------------------------------------------------------
-- Script-first tracking ingestion:
--  - tracking_sites: per-tenant registry of trackable web properties. Issues
--    a public write_key and pins a list of allowed Origins, so a compromised
--    key cannot be reused from an arbitrary domain.
--  - tracking_sessions: first-class session object (first_seen, last_seen,
--    identified contact, UTM first-touch, device/browser from UA, last page).
--  - events: adds anonymous_id + contact_id so identified visitors can be
--    stitched to the CRM without losing the pre-identify history.
-- All additive; no breaking changes.
-- ============================================================================

-- --- tracking_sites ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tracking_sites (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id       uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  name              text NOT NULL,
  write_key         text NOT NULL UNIQUE,
  allowed_origins   text[] NOT NULL DEFAULT ARRAY[]::text[],
  is_active         boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.tracking_sites IS
  'Per-tenant trackable websites. Each issues a public write_key used by the browser tracker script; writes are only accepted when Origin matches allowed_origins.';

CREATE INDEX IF NOT EXISTS idx_tracking_sites_property ON public.tracking_sites(property_id);
CREATE INDEX IF NOT EXISTS idx_tracking_sites_write_key ON public.tracking_sites(write_key);

ALTER TABLE public.tracking_sites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tracking_sites_service_role ON public.tracking_sites;
CREATE POLICY tracking_sites_service_role
  ON public.tracking_sites AS PERMISSIVE FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS tracking_sites_tenant ON public.tracking_sites;
CREATE POLICY tracking_sites_tenant
  ON public.tracking_sites AS PERMISSIVE FOR ALL TO authenticated
  USING (property_id IN (SELECT au.property_id FROM public.admin_users au WHERE au.email = auth.jwt() ->> 'email'))
  WITH CHECK (property_id IN (SELECT au.property_id FROM public.admin_users au WHERE au.email = auth.jwt() ->> 'email'));

DROP TRIGGER IF EXISTS trg_tracking_sites_updated_at ON public.tracking_sites;
CREATE TRIGGER trg_tracking_sites_updated_at
  BEFORE UPDATE ON public.tracking_sites
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- --- tracking_sessions ------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tracking_sessions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id        uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  site_id            uuid REFERENCES public.tracking_sites(id) ON DELETE SET NULL,
  session_id         text NOT NULL,              -- browser-side id, stable per tab/session
  anonymous_id       text,                       -- long-lived cookie id, spans sessions on same device
  contact_id         uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  email              text,
  first_seen_at      timestamptz NOT NULL DEFAULT now(),
  last_seen_at       timestamptz NOT NULL DEFAULT now(),
  event_count        integer NOT NULL DEFAULT 0,
  landing_page       text,
  last_page          text,
  referrer           text,
  utm_source         text,
  utm_medium         text,
  utm_campaign       text,
  utm_content        text,
  utm_term           text,
  ip_address         text,
  user_agent         text,
  country            text,                       -- hydrated from Vercel geo headers
  city               text,
  device_type        text,                       -- mobile | tablet | desktop | bot
  browser            text,
  os                 text
);

COMMENT ON TABLE public.tracking_sessions IS
  'First-class visitor session; enriched by /api/identify and /api/track. Stitches to CRM via contact_id.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_tracking_sessions_property_session
  ON public.tracking_sessions(property_id, session_id);
CREATE INDEX IF NOT EXISTS idx_tracking_sessions_property_last_seen
  ON public.tracking_sessions(property_id, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_tracking_sessions_anon
  ON public.tracking_sessions(property_id, anonymous_id) WHERE anonymous_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tracking_sessions_contact
  ON public.tracking_sessions(contact_id) WHERE contact_id IS NOT NULL;

ALTER TABLE public.tracking_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tracking_sessions_service_role ON public.tracking_sessions;
CREATE POLICY tracking_sessions_service_role
  ON public.tracking_sessions AS PERMISSIVE FOR ALL TO service_role
  USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS tracking_sessions_tenant_read ON public.tracking_sessions;
CREATE POLICY tracking_sessions_tenant_read
  ON public.tracking_sessions AS PERMISSIVE FOR SELECT TO authenticated
  USING (property_id IN (SELECT au.property_id FROM public.admin_users au WHERE au.email = auth.jwt() ->> 'email'));

-- --- events enrichment ------------------------------------------------------
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS anonymous_id text;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS site_id uuid REFERENCES public.tracking_sites(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_events_property_created ON public.events(property_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_session_created ON public.events(property_id, session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_contact ON public.events(contact_id) WHERE contact_id IS NOT NULL;

-- --- bootstrap: default site for every existing property --------------------
-- Generates a write_key of the form tw_<base64url(24bytes)>. Bootstraps one
-- inactive site per property so admins can review + activate + set origins
-- before deploying the tracker on the real domain.
INSERT INTO public.tracking_sites (property_id, name, write_key, allowed_origins, is_active)
SELECT
  p.id,
  COALESCE(NULLIF(p.name,''), 'Default site'),
  'tw_' || replace(replace(encode(gen_random_bytes(24), 'base64'), '+', '-'), '/', '_'),
  ARRAY[]::text[],
  false
FROM public.properties p
WHERE NOT EXISTS (SELECT 1 FROM public.tracking_sites ts WHERE ts.property_id = p.id);

SELECT id, property_id, name, left(write_key, 12) || '...' AS key_preview, allowed_origins, is_active
FROM public.tracking_sites ORDER BY created_at DESC LIMIT 5;
