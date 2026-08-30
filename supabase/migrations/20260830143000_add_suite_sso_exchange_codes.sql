create table if not exists public.suite_sso_exchange_codes (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  product_key text not null check (product_key in ('santaddeo','hotelprofitai','manubot')),
  property_id uuid not null references public.properties(id) on delete cascade,
  external_tenant_id uuid not null,
  source_user_id uuid not null,
  source_email text not null,
  source_name text,
  source_is_tenant_admin boolean not null default false,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.suite_sso_exchange_codes enable row level security;
revoke all on table public.suite_sso_exchange_codes from public, anon, authenticated;
grant select, insert, update, delete on table public.suite_sso_exchange_codes to service_role;

create index if not exists suite_sso_exchange_codes_expiry_idx
  on public.suite_sso_exchange_codes(expires_at)
  where consumed_at is null;
