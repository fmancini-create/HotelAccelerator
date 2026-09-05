-- Suite-wide addon entitlements.
-- Product subscriptions stay independent. Every selling product contributes one
-- source row; the effective entitlement is derived from all valid sources.

begin;

create table if not exists public.suite_addon_entitlement_sources (
  id uuid primary key default gen_random_uuid(),
  customer_account_id uuid not null references public.customer_accounts(id) on delete restrict,
  addon_key text not null check (
    addon_key = lower(btrim(addon_key))
    and char_length(addon_key) between 1 and 80
  ),
  source_product_key text not null check (
    source_product_key in ('hotelaccelerator', 'santaddeo', 'hotelprofitai', 'manubot')
  ),
  source_external_tenant_id text not null check (
    char_length(btrim(source_external_tenant_id)) between 1 and 160
  ),
  status text not null default 'active' check (
    status in ('active', 'trial', 'inactive', 'suspended', 'cancelled')
  ),
  activated_at timestamptz,
  expires_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint suite_addon_entitlement_sources_origin_key unique (
    customer_account_id, addon_key, source_product_key, source_external_tenant_id
  )
);

create index if not exists suite_addon_entitlement_sources_lookup_idx
  on public.suite_addon_entitlement_sources (customer_account_id, addon_key, status);

alter table public.suite_addon_entitlement_sources enable row level security;
revoke all on table public.suite_addon_entitlement_sources from public, anon, authenticated;
grant select, insert, update, delete on table public.suite_addon_entitlement_sources to service_role;

create table if not exists public.suite_addon_entitlements (
  id uuid primary key default gen_random_uuid(),
  customer_account_id uuid not null references public.customer_accounts(id) on delete restrict,
  addon_key text not null check (
    addon_key = lower(btrim(addon_key))
    and char_length(addon_key) between 1 and 80
  ),
  status text not null default 'inactive' check (
    status in ('active', 'trial', 'inactive', 'suspended', 'cancelled')
  ),
  activated_at timestamptz,
  expires_at timestamptz,
  active_source_count integer not null default 0 check (active_source_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint suite_addon_entitlements_account_addon_key unique (customer_account_id, addon_key)
);

create index if not exists suite_addon_entitlements_addon_status_idx
  on public.suite_addon_entitlements (addon_key, status);

alter table public.suite_addon_entitlements enable row level security;
revoke all on table public.suite_addon_entitlements from public, anon, authenticated;
grant select, insert, update, delete on table public.suite_addon_entitlements to service_role;

create or replace function public.refresh_suite_addon_entitlement(
  p_customer_account_id uuid,
  p_addon_key text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_status text;
  v_activated_at timestamptz;
  v_expires_at timestamptz;
  v_active_source_count integer;
  v_source_count integer;
  v_has_open_ended boolean;
begin
  select count(*)::integer
    into v_source_count
  from public.suite_addon_entitlement_sources s
  where s.customer_account_id = p_customer_account_id
    and s.addon_key = p_addon_key;

  if v_source_count = 0 then
    delete from public.suite_addon_entitlements
    where customer_account_id = p_customer_account_id
      and addon_key = p_addon_key;
    return;
  end if;

  select
    case
      when bool_or(s.status = 'active' and (s.expires_at is null or s.expires_at > now())) then 'active'
      when bool_or(s.status = 'trial' and (s.expires_at is null or s.expires_at > now())) then 'trial'
      when bool_or(s.status = 'suspended') then 'suspended'
      when bool_or(s.status = 'cancelled') and not bool_or(s.status = 'inactive') then 'cancelled'
      else 'inactive'
    end,
    min(s.activated_at) filter (
      where s.status in ('active', 'trial')
        and (s.expires_at is null or s.expires_at > now())
    ),
    count(*) filter (
      where s.status in ('active', 'trial')
        and (s.expires_at is null or s.expires_at > now())
    )::integer,
    bool_or(s.expires_at is null) filter (
      where s.status in ('active', 'trial')
        and (s.expires_at is null or s.expires_at > now())
    ),
    max(s.expires_at) filter (
      where s.status in ('active', 'trial')
        and s.expires_at > now()
    )
  into
    v_status,
    v_activated_at,
    v_active_source_count,
    v_has_open_ended,
    v_expires_at
  from public.suite_addon_entitlement_sources s
  where s.customer_account_id = p_customer_account_id
    and s.addon_key = p_addon_key;

  if coalesce(v_has_open_ended, false) then
    v_expires_at := null;
  end if;

  insert into public.suite_addon_entitlements (
    customer_account_id,
    addon_key,
    status,
    activated_at,
    expires_at,
    active_source_count,
    updated_at
  ) values (
    p_customer_account_id,
    p_addon_key,
    coalesce(v_status, 'inactive'),
    v_activated_at,
    v_expires_at,
    coalesce(v_active_source_count, 0),
    now()
  )
  on conflict (customer_account_id, addon_key) do update set
    status = excluded.status,
    activated_at = excluded.activated_at,
    expires_at = excluded.expires_at,
    active_source_count = excluded.active_source_count,
    updated_at = now();
end;
$$;

revoke all on function public.refresh_suite_addon_entitlement(uuid, text) from public, anon, authenticated;
grant execute on function public.refresh_suite_addon_entitlement(uuid, text) to service_role;

-- Existing HotelAccelerator Reviews rows seed an HA commercial/configuration
-- source. No other product is inferred from a mere tenant link.
insert into public.suite_addon_entitlement_sources (
  customer_account_id,
  addon_key,
  source_product_key,
  source_external_tenant_id,
  status,
  activated_at,
  expires_at,
  metadata
)
select
  a.id,
  'reviews',
  'hotelaccelerator',
  tm.property_id::text,
  case when tm.status = 'active' then 'active' else 'inactive' end,
  coalesce(tm.activated_at, tm.created_at),
  tm.expires_at,
  jsonb_build_object('backfill', true)
from public.tenant_modules tm
join public.customer_accounts a on a.property_id = tm.property_id
where tm.module_key = 'reviews'
on conflict (customer_account_id, addon_key, source_product_key, source_external_tenant_id)
do update set
  status = excluded.status,
  activated_at = coalesce(public.suite_addon_entitlement_sources.activated_at, excluded.activated_at),
  expires_at = excluded.expires_at,
  metadata = public.suite_addon_entitlement_sources.metadata || excluded.metadata,
  updated_at = now();

select public.refresh_suite_addon_entitlement(a.id, 'reviews')
from public.customer_accounts a
where exists (
  select 1
  from public.suite_addon_entitlement_sources s
  where s.customer_account_id = a.id
    and s.addon_key = 'reviews'
);

-- HA is the Core database, therefore a local Reviews change can update its own
-- source synchronously. Satellite purchases are written through the Core API.
create or replace function public.sync_reviews_suite_addon_source_from_tenant_module()
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

  insert into public.suite_addon_entitlement_sources (
    customer_account_id,
    addon_key,
    source_product_key,
    source_external_tenant_id,
    status,
    activated_at,
    expires_at,
    metadata,
    updated_at
  ) values (
    v_account_id,
    'reviews',
    'hotelaccelerator',
    v_property_id::text,
    v_status,
    coalesce(v_activated_at, case when v_status = 'active' then now() else null end),
    v_expires_at,
    jsonb_build_object('mirrored_from', 'tenant_modules'),
    now()
  )
  on conflict (customer_account_id, addon_key, source_product_key, source_external_tenant_id)
  do update set
    status = excluded.status,
    activated_at = case
      when excluded.status in ('active', 'trial')
        then coalesce(public.suite_addon_entitlement_sources.activated_at, excluded.activated_at, now())
      else public.suite_addon_entitlement_sources.activated_at
    end,
    expires_at = excluded.expires_at,
    metadata = public.suite_addon_entitlement_sources.metadata || excluded.metadata,
    updated_at = now();

  perform public.refresh_suite_addon_entitlement(v_account_id, 'reviews');

  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

revoke all on function public.sync_reviews_suite_addon_source_from_tenant_module() from public, anon, authenticated;

DROP TRIGGER IF EXISTS tenant_modules_sync_reviews_suite_entitlement ON public.tenant_modules;
create trigger tenant_modules_sync_reviews_suite_entitlement
after insert or delete or update of status, activated_at, expires_at on public.tenant_modules
for each row execute function public.sync_reviews_suite_addon_source_from_tenant_module();

commit;
