-- Suite-wide addon entitlements.
-- Products remain independent; this table represents only cross-product addon ownership.

begin;

create table if not exists public.suite_addon_entitlements (
  id uuid primary key default gen_random_uuid(),
  customer_account_id uuid not null references public.customer_accounts(id) on delete restrict,
  addon_key text not null check (
    addon_key = lower(btrim(addon_key))
    and char_length(addon_key) between 1 and 80
  ),
  status text not null default 'active' check (
    status in ('active', 'trial', 'inactive', 'suspended', 'cancelled')
  ),
  source_product_key text not null check (
    source_product_key in ('hotelaccelerator', 'santaddeo', 'hotelprofitai', 'manubot')
  ),
  source_external_tenant_id text,
  activated_at timestamptz,
  expires_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint suite_addon_entitlements_account_addon_key unique (customer_account_id, addon_key)
);

create index if not exists suite_addon_entitlements_addon_status_idx
  on public.suite_addon_entitlements (addon_key, status);

alter table public.suite_addon_entitlements enable row level security;
revoke all on table public.suite_addon_entitlements from public, anon, authenticated;
grant select, insert, update, delete on table public.suite_addon_entitlements to service_role;

-- Existing HotelAccelerator Reviews access becomes the initial suite entitlement.
insert into public.suite_addon_entitlements (
  customer_account_id,
  addon_key,
  status,
  source_product_key,
  source_external_tenant_id,
  activated_at,
  expires_at,
  metadata
)
select
  a.id,
  'reviews',
  case when tm.status = 'active' then 'active' else 'inactive' end,
  'hotelaccelerator',
  tm.property_id::text,
  coalesce(tm.activated_at, tm.created_at),
  tm.expires_at,
  jsonb_build_object('backfill', true)
from public.tenant_modules tm
join public.customer_accounts a on a.property_id = tm.property_id
where tm.module_key = 'reviews'
on conflict (customer_account_id, addon_key) do nothing;

-- HotelAccelerator is also the Core database, so local Reviews changes can be
-- mirrored synchronously without HTTP or cross-database access.
create or replace function public.sync_reviews_suite_addon_entitlement_from_tenant_module()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_property_id uuid;
  v_account_id uuid;
  v_status text;
  v_activated_at timestamptz;
  v_expires_at timestamptz;
begin
  if tg_op = 'DELETE' then
    if old.module_key <> 'reviews' then return old; end if;
    v_property_id := old.property_id;
    v_status := 'inactive';
    v_activated_at := old.activated_at;
    v_expires_at := old.expires_at;
  else
    if new.module_key <> 'reviews' then return new; end if;
    v_property_id := new.property_id;
    v_status := case when new.status = 'active' then 'active' else 'inactive' end;
    v_activated_at := new.activated_at;
    v_expires_at := new.expires_at;
  end if;

  select id into v_account_id
  from public.customer_accounts
  where property_id = v_property_id
  limit 1;

  if v_account_id is null then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  insert into public.suite_addon_entitlements (
    customer_account_id,
    addon_key,
    status,
    source_product_key,
    source_external_tenant_id,
    activated_at,
    expires_at,
    metadata,
    updated_at
  ) values (
    v_account_id,
    'reviews',
    v_status,
    'hotelaccelerator',
    v_property_id::text,
    coalesce(v_activated_at, case when v_status = 'active' then now() else null end),
    v_expires_at,
    jsonb_build_object('mirrored_from', 'tenant_modules'),
    now()
  )
  on conflict (customer_account_id, addon_key) do update set
    status = excluded.status,
    source_product_key = excluded.source_product_key,
    source_external_tenant_id = excluded.source_external_tenant_id,
    activated_at = case
      when excluded.status in ('active', 'trial')
        then coalesce(public.suite_addon_entitlements.activated_at, excluded.activated_at, now())
      else public.suite_addon_entitlements.activated_at
    end,
    expires_at = excluded.expires_at,
    metadata = public.suite_addon_entitlements.metadata || excluded.metadata,
    updated_at = now();

  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

revoke all on function public.sync_reviews_suite_addon_entitlement_from_tenant_module() from public, anon, authenticated;

DROP TRIGGER IF EXISTS tenant_modules_sync_reviews_suite_entitlement ON public.tenant_modules;
create trigger tenant_modules_sync_reviews_suite_entitlement
after insert or update of status, activated_at, expires_at or delete on public.tenant_modules
for each row execute function public.sync_reviews_suite_addon_entitlement_from_tenant_module();

commit;
