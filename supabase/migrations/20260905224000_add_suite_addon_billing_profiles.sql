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

commit;
