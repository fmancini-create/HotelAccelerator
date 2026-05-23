-- Adds is_default flag on tracking_sites to deterministically select which
-- site is used when auto-injecting the tracker into CMS tenant pages.
-- A tenant may have several sites (main site, landing, promo microsite);
-- is_default picks the one used by the CMS. Max one default per property.

ALTER TABLE public.tracking_sites
  ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false;

-- Enforce "at most one default per property"
CREATE UNIQUE INDEX IF NOT EXISTS uq_tracking_sites_default_per_property
  ON public.tracking_sites(property_id)
  WHERE is_default = true;

-- Bootstrap: mark the oldest site of each property as default (so that any
-- property that already has a bootstrapped site gets sensible injection wiring
-- without admin intervention). Idempotent: only promotes if nothing is default yet.
WITH ranked AS (
  SELECT id, property_id,
         ROW_NUMBER() OVER (PARTITION BY property_id ORDER BY created_at ASC) AS rn
  FROM public.tracking_sites
)
UPDATE public.tracking_sites ts
SET is_default = true
FROM ranked r
WHERE ts.id = r.id AND r.rn = 1
  AND NOT EXISTS (
    SELECT 1 FROM public.tracking_sites ts2
    WHERE ts2.property_id = ts.property_id AND ts2.is_default = true
  );
