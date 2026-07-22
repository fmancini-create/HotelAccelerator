-- Estende module_catalog per supportare pricing mensile + annuale scontato.
-- Modello: price_monthly_cents = prezzo mensile base.
--          annuale = price_monthly_cents * 12 * (1 - annual_discount_pct/100)
-- Trial separati per intervallo. Due Price Stripe (mensile/annuale).

ALTER TABLE module_catalog
  ADD COLUMN IF NOT EXISTS price_monthly_cents integer,
  ADD COLUMN IF NOT EXISTS annual_discount_pct numeric(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS trial_days_monthly integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS trial_days_annual integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS allow_monthly boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS allow_annual boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS stripe_price_monthly_id text,
  ADD COLUMN IF NOT EXISTS stripe_price_annual_id text;

-- Seed mensile dai valori annuali esistenti (price_cents era annuale).
-- monthly = round(annuale / 12). Sconto iniziale 0 -> annuale calcolato ~ uguale.
UPDATE module_catalog
SET price_monthly_cents = ROUND(price_cents / 12.0)
WHERE price_monthly_cents IS NULL;

-- Trial: replica il trial esistente su entrambi gli intervalli.
UPDATE module_catalog
SET trial_days_monthly = COALESCE(trial_days, 0),
    trial_days_annual = COALESCE(trial_days, 0)
WHERE trial_days_monthly = 0 AND trial_days_annual = 0 AND COALESCE(trial_days,0) > 0;

-- Migra gli stripe price id legacy: il vecchio stripe_price_id (annuale) -> annual.
UPDATE module_catalog
SET stripe_price_annual_id = stripe_price_id
WHERE stripe_price_id IS NOT NULL AND stripe_price_annual_id IS NULL;

NOTIFY pgrst, 'reload schema';
