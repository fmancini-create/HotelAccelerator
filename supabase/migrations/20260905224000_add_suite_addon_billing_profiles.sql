begin;

create table if not exists public.suite_addon_billing_profiles (
  customer_account_id uuid not null references public.customer_accounts(id) on delete restrict,
  addon_key text not null check (addon_key = lower(btrim(addon_key)) and char_length(addon_key) between 1 and 80),
  accommodation_count integer not null check (accommodation_count between 1 and 10000),
  source_product_key text not null check (source_product_key in ('hotelaccelerator','santaddeo','hotelprofitai','manubot')),
  confirmed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (customer_account_id, addon_key)
);

alter table public.suite_addon_billing_profiles enable row level security;
revoke all on table public.suite_addon_billing_profiles from public, anon, authenticated;
grant select, insert, update, delete on table public.suite_addon_billing_profiles to service_role;

create table if not exists public.suite_addon_commercial_subscriptions (
  id uuid primary key default gen_random_uuid(),
  customer_account_id uuid not null references public.customer_accounts(id) on delete restrict,
  addon_key text not null check (addon_key = lower(btrim(addon_key))),
  source_product_key text not null check (source_product_key in ('hotelaccelerator','santaddeo','hotelprofitai','manubot')),
  source_external_tenant_id text not null,
  stripe_checkout_session_id text unique,
  stripe_subscription_id text not null unique,
  stripe_customer_id text,
  status text not null,
  billing_cycle text not null check (billing_cycle in ('monthly','yearly')),
  accommodation_count integer not null check (accommodation_count between 1 and 10000),
  amount_cents integer not null check (amount_cents >= 0),
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists suite_addon_commercial_subscriptions_sync_idx
  on public.suite_addon_commercial_subscriptions (addon_key, status, updated_at);

alter table public.suite_addon_commercial_subscriptions enable row level security;
revoke all on table public.suite_addon_commercial_subscriptions from public, anon, authenticated;
grant select, insert, update, delete on table public.suite_addon_commercial_subscriptions to service_role;

commit;
