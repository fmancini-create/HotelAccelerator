-- 4BID Suite Identity & Provisioning.
-- Additive rollout: existing SSO and tenant links remain valid and untouched.

begin;

create table if not exists public.suite_product_entitlements (
  id uuid primary key default gen_random_uuid(),
  customer_account_id uuid not null references public.customer_accounts(id) on delete restrict,
  product_key text not null check (product_key in ('hotelaccelerator', 'santaddeo', 'hotelprofitai', 'manubot')),
  status text not null default 'active' check (status in ('active', 'trial', 'inactive', 'suspended', 'cancelled')),
  activated_at timestamptz,
  expires_at timestamptz,
  source text not null default 'registry',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint suite_product_entitlements_account_product_key unique (customer_account_id, product_key)
);

create index if not exists suite_product_entitlements_product_status_idx
  on public.suite_product_entitlements (product_key, status);

alter table public.suite_product_entitlements enable row level security;
revoke all on table public.suite_product_entitlements from public, anon, authenticated;
grant select, insert, update, delete on table public.suite_product_entitlements to service_role;

create table if not exists public.suite_identities (
  id uuid primary key default gen_random_uuid(),
  customer_account_id uuid not null references public.customer_accounts(id) on delete restrict,
  primary_email text not null,
  display_name text,
  status text not null default 'active' check (status in ('active', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint suite_identities_normalized_email_check check (
    primary_email = lower(btrim(primary_email)) and char_length(primary_email) between 3 and 320
  ),
  constraint suite_identities_account_email_key unique (customer_account_id, primary_email)
);

create index if not exists suite_identities_account_status_idx
  on public.suite_identities (customer_account_id, status);

alter table public.suite_identities enable row level security;
revoke all on table public.suite_identities from public, anon, authenticated;
grant select, insert, update, delete on table public.suite_identities to service_role;

create table if not exists public.suite_identity_links (
  id uuid primary key default gen_random_uuid(),
  suite_identity_id uuid not null references public.suite_identities(id) on delete cascade,
  product_key text not null check (product_key in ('hotelaccelerator', 'santaddeo', 'hotelprofitai', 'manubot')),
  external_tenant_id text not null check (char_length(btrim(external_tenant_id)) between 1 and 160),
  external_user_id uuid not null,
  verified_email text not null,
  role_label text,
  is_tenant_admin boolean not null default false,
  last_verified_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint suite_identity_links_normalized_email_check check (
    verified_email = lower(btrim(verified_email)) and char_length(verified_email) between 3 and 320
  ),
  constraint suite_identity_links_external_user_key unique (product_key, external_tenant_id, external_user_id),
  constraint suite_identity_links_identity_product_tenant_key unique (suite_identity_id, product_key, external_tenant_id)
);

create index if not exists suite_identity_links_identity_idx
  on public.suite_identity_links (suite_identity_id);
create index if not exists suite_identity_links_product_tenant_idx
  on public.suite_identity_links (product_key, external_tenant_id);

alter table public.suite_identity_links enable row level security;
revoke all on table public.suite_identity_links from public, anon, authenticated;
grant select, insert, update, delete on table public.suite_identity_links to service_role;

alter table public.suite_sso_exchange_codes
  add column if not exists suite_identity_id uuid references public.suite_identities(id) on delete set null;

create index if not exists suite_sso_exchange_codes_suite_identity_idx
  on public.suite_sso_exchange_codes (suite_identity_id)
  where suite_identity_id is not null;

-- Existing explicit tenant links prove that the account owns/uses that product.
-- This is a one-time seed only: future billing changes update entitlement status
-- independently and do not delete the tenant mapping.
insert into public.suite_product_entitlements (
  customer_account_id, product_key, status, activated_at, source
)
select distinct
  l.customer_account_id,
  l.product_key,
  'active',
  l.created_at,
  'existing_tenant_link'
from public.suite_tenant_links l
where l.product_key in ('santaddeo', 'hotelprofitai', 'manubot')
on conflict (customer_account_id, product_key) do nothing;

-- An existing HotelAccelerator property proves the Core product entitlement.
insert into public.suite_product_entitlements (
  customer_account_id, product_key, status, activated_at, source
)
select
  a.id,
  'hotelaccelerator',
  case
    when p.subscription_status = 'trial' then 'trial'
    when p.subscription_status = 'suspended' then 'suspended'
    when p.subscription_status = 'cancelled' then 'cancelled'
    else 'active'
  end,
  coalesce(p.created_at, a.created_at),
  'existing_property'
from public.customer_accounts a
join public.properties p on p.id = a.property_id
on conflict (customer_account_id, product_key) do nothing;

-- Keep the central product entitlement aligned when a satellite module is
-- activated or revoked inside HotelAccelerator. The tenant mapping is not
-- changed by this trigger.
create or replace function public.sync_suite_product_entitlement_from_tenant_module()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  account_id uuid;
  entitlement_status text;
begin
  if new.module_key not in ('santaddeo', 'hotelprofitai', 'manubot') then
    return new;
  end if;

  select id into account_id
  from public.customer_accounts
  where property_id = new.property_id;

  if account_id is null then
    return new;
  end if;

  entitlement_status := case new.status
    when 'active' then 'active'
    when 'trial' then 'trial'
    else 'inactive'
  end;

  insert into public.suite_product_entitlements (
    customer_account_id, product_key, status, activated_at, expires_at, source, updated_at
  ) values (
    account_id,
    new.module_key,
    entitlement_status,
    case when new.status in ('active', 'trial') then coalesce(new.activated_at, now()) else null end,
    new.expires_at,
    'tenant_module',
    now()
  )
  on conflict (customer_account_id, product_key) do update set
    status = excluded.status,
    activated_at = excluded.activated_at,
    expires_at = excluded.expires_at,
    source = excluded.source,
    updated_at = now();

  return new;
end;
$$;

revoke all on function public.sync_suite_product_entitlement_from_tenant_module() from public, anon, authenticated;

drop trigger if exists tenant_modules_sync_suite_entitlement on public.tenant_modules;
create trigger tenant_modules_sync_suite_entitlement
after insert or update of status, expires_at, activated_at
on public.tenant_modules
for each row execute function public.sync_suite_product_entitlement_from_tenant_module();

-- Atomically attaches a new HotelAccelerator property to a customer account
-- that was born as a satellite-only account. A normal INSERT on properties
-- creates a temporary customer_account through the legacy trigger; this
-- function removes that temporary row and reuses the original suite account in
-- the same transaction, so no duplicate account can become externally visible.
create or replace function public.provision_hotelaccelerator_property_for_account(
  p_customer_account_id uuid,
  p_property_name text
)
returns table(property_id uuid, account_number bigint)
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  account_row public.customer_accounts%rowtype;
  new_property_id uuid;
  generated_slug text;
begin
  if p_customer_account_id is null or coalesce(nullif(btrim(p_property_name), ''), '') = '' then
    raise exception 'invalid suite provisioning request';
  end if;

  select * into account_row
  from public.customer_accounts
  where id = p_customer_account_id
  for update;

  if not found then
    raise exception 'suite customer account not found';
  end if;

  if account_row.property_id is not null then
    return query select account_row.property_id, account_row.account_number;
    return;
  end if;

  generated_slug := 'suite-' || account_row.account_number::text;

  insert into public.properties (name, slug, type, is_active, subscription_status)
  values (left(btrim(p_property_name), 255), generated_slug, 'hotel', true, 'active')
  returning id into new_property_id;

  -- The properties_create_customer_account trigger has created a temporary
  -- account. No other request can observe this intermediate state before this
  -- transaction commits.
  delete from public.customer_accounts
  where property_id = new_property_id
    and id <> p_customer_account_id;

  update public.customer_accounts
  set property_id = new_property_id,
      updated_at = now()
  where id = p_customer_account_id
    and property_id is null;

  if not found then
    raise exception 'suite customer account was attached concurrently';
  end if;

  insert into public.suite_product_entitlements (
    customer_account_id, product_key, status, activated_at, source, updated_at
  ) values (
    p_customer_account_id, 'hotelaccelerator', 'active', now(), 'suite_provisioning', now()
  )
  on conflict (customer_account_id, product_key) do update set
    status = 'active',
    activated_at = coalesce(public.suite_product_entitlements.activated_at, excluded.activated_at),
    source = excluded.source,
    updated_at = now();

  insert into public.suite_tenant_links (
    customer_account_id, product_key, external_tenant_id, created_by_user_id
  ) values (
    p_customer_account_id, 'hotelaccelerator', new_property_id::text, null
  )
  on conflict (product_key, external_tenant_id) do nothing;

  -- Mirror already-owned satellite products into the new HA tenant so the
  -- existing module/SSO guards keep working without special cases.
  insert into public.tenant_modules (
    property_id, module_key, status, activated_at, expires_at
  )
  select
    new_property_id,
    e.product_key,
    case when e.status = 'trial' then 'trial' else 'active' end,
    coalesce(e.activated_at, now()),
    e.expires_at
  from public.suite_product_entitlements e
  where e.customer_account_id = p_customer_account_id
    and e.product_key in ('santaddeo', 'hotelprofitai', 'manubot')
    and e.status in ('active', 'trial')
  on conflict (property_id, module_key) do update set
    status = excluded.status,
    activated_at = coalesce(public.tenant_modules.activated_at, excluded.activated_at),
    expires_at = excluded.expires_at,
    updated_at = now();

  return query select new_property_id, account_row.account_number;
end;
$$;

revoke all on function public.provision_hotelaccelerator_property_for_account(uuid, text) from public, anon, authenticated;
grant execute on function public.provision_hotelaccelerator_property_for_account(uuid, text) to service_role;

comment on table public.suite_product_entitlements is
  'Account-level ownership of 4BID suite products; independent from local tenant mappings and local module UI state.';
comment on table public.suite_identities is
  'Central person identity scoped to one 4BID customer account; email matching never crosses customer accounts.';
comment on table public.suite_identity_links is
  'Verified mapping from a central suite identity to one local auth user inside one product tenant.';
comment on function public.provision_hotelaccelerator_property_for_account(uuid, text) is
  'Backend-only atomic attach of a new HA property to an existing standalone suite customer account.';

commit;
