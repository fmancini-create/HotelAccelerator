-- Stripe applica un importo minimo di 0,50 EUR per addebiti in euro.
-- Manteniamo il vincolo anche nel database per evitare configurazioni non acquistabili.

alter table public.scout_billing_settings
  drop constraint if exists scout_activation_fee_non_negative;

alter table public.scout_billing_settings
  add constraint scout_activation_fee_stripe_minimum
  check (activation_fee_cents is null or activation_fee_cents >= 50);
