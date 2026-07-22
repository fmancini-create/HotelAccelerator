-- Allinea accelerator_subscriptions a ciò che il flusso di attivazione Fee scrive.
-- Senza queste colonne l'insert in /api/accelerator/verify-payment fallisce e
-- il cliente paga su Stripe ma la sottoscrizione non viene mai creata.

ALTER TABLE accelerator_subscriptions
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text,
  ADD COLUMN IF NOT EXISTS stripe_customer_id text,
  ADD COLUMN IF NOT EXISTS pricing_config_id uuid;

-- Idempotenza: evita doppie sottoscrizioni per la stessa subscription Stripe.
CREATE UNIQUE INDEX IF NOT EXISTS accelerator_subscriptions_stripe_sub_uniq
  ON accelerator_subscriptions (stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;
