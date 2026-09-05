-- Scout auto-recharge: every automatic charge must originate from a Stripe
-- Invoice so HotelProfitAI can remain the single fiscal hub for all 4BID
-- products. Keep the PaymentIntent reference for payment reconciliation/audit.

alter table public.scout_auto_recharge_attempts
  add column if not exists stripe_invoice_id text;

create unique index if not exists scout_auto_recharge_attempts_stripe_invoice_id_uidx
  on public.scout_auto_recharge_attempts(stripe_invoice_id)
  where stripe_invoice_id is not null;

alter table public.scout_auto_recharge_settings
  add column if not exists last_stripe_invoice_id text;

comment on column public.scout_auto_recharge_attempts.stripe_invoice_id is
  'Stripe Invoice used for the off-session auto-recharge. HotelProfitAI consumes invoice.paid as the sole 4BID fiscal hub.';
comment on column public.scout_auto_recharge_settings.last_stripe_invoice_id is
  'Last successful Stripe Invoice for Scout auto-recharge; backend/audit only.';
