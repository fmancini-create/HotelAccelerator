-- Catalogo PUBBLICO dei gestionali (PMS) integrati con SANTADDEO.
-- IMPORTANTE: e' una tabella SOLO vetrina/commerciale, separata dal registry
-- tecnico dei connettori (public.pms_providers). Qui NON si nominano i
-- connettori intermedi: compaiono solo i nomi dei gestionali lato cliente.
-- Stato: connected | certifying | upcoming.

CREATE TABLE IF NOT EXISTS public.pms_public_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text UNIQUE NOT NULL,
  status text NOT NULL DEFAULT 'connected' CHECK (status IN ('connected', 'certifying', 'upcoming')),
  note text,
  display_order integer NOT NULL DEFAULT 0,
  is_public boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pms_public_catalog_status ON public.pms_public_catalog (status, display_order);

ALTER TABLE public.pms_public_catalog ENABLE ROW LEVEL SECURITY;

-- Lettura pubblica delle sole voci visibili (anche utenti anonimi: serve per la
-- pagina pubblica /integrazioni e per il sito vetrina).
DROP POLICY IF EXISTS "pms_public_catalog_public_read" ON public.pms_public_catalog;
CREATE POLICY "pms_public_catalog_public_read"
  ON public.pms_public_catalog FOR SELECT
  USING (is_public = true);

-- Gestione riservata ai super admin.
DROP POLICY IF EXISTS "pms_public_catalog_admin_all" ON public.pms_public_catalog;
CREATE POLICY "pms_public_catalog_admin_all"
  ON public.pms_public_catalog FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('super_admin', 'superadmin')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('super_admin', 'superadmin')
    )
  );

-- Seed idempotente (upsert per slug).
INSERT INTO public.pms_public_catalog (name, slug, status, note, display_order) VALUES
  ('Scidoo',        'scidoo',       'connected',  NULL,                1),
  ('Bedzzle',       'bedzzle',      'connected',  NULL,                2),
  ('5stelle*',      '5stelle',      'connected',  NULL,                3),
  ('Cloudbeds',     'cloudbeds',    'connected',  NULL,                4),
  ('Hotel Cube',    'hotel-cube',   'connected',  NULL,                5),
  ('Mews',          'mews',         'connected',  NULL,                6),
  ('Octorate',      'octorate',     'connected',  NULL,                7),
  ('Opera',         'opera',        'connected',  NULL,                8),
  ('Passepartout',  'passepartout', 'connected',  NULL,                9),
  ('Slope',         'slope',        'connected',  'solo prenotazioni', 10),
  ('Zak',           'zak',          'connected',  NULL,                11),
  ('Apaleo',        'apaleo',       'certifying', NULL,                20),
  ('SiteMinder',    'siteminder',   'upcoming',   NULL,                30),
  ('Exesoft',       'exesoft',      'upcoming',   NULL,                31)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  status = EXCLUDED.status,
  note = EXCLUDED.note,
  display_order = EXCLUDED.display_order,
  updated_at = now();
