-- Preserve the account-level HotelAccelerator entitlement when provisioning a
-- property. A trial must remain a trial and inactive/suspended/cancelled accounts
-- must never create or reopen a property through a satellite launch.

begin;

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
  ha_entitlement_status text;
begin
  if p_customer_account_id is null or coalesce(nullif(btrim(p_property_name), ''), '') = '' then
    raise exception 'invalid suite provisioning request';
  end if;

  select ca.* into account_row
  from public.customer_accounts ca
  where ca.id = p_customer_account_id
  for update;

  if not found then
    raise exception 'suite customer account not found';
  end if;

  select e.status into ha_entitlement_status
  from public.suite_product_entitlements e
  where e.customer_account_id = p_customer_account_id
    and e.product_key = 'hotelaccelerator';

  if ha_entitlement_status is null or ha_entitlement_status not in ('active', 'trial') then
    raise exception 'hotelaccelerator entitlement is not active';
  end if;

  if account_row.property_id is not null then
    return query select account_row.property_id, account_row.account_number;
    return;
  end if;

  generated_slug := 'suite-' || account_row.account_number::text;

  insert into public.properties (name, slug, type, is_active, subscription_status)
  values (
    left(btrim(p_property_name), 255),
    generated_slug,
    'hotel',
    true,
    ha_entitlement_status
  )
  returning id into new_property_id;

  delete from public.customer_accounts ca
  where ca.property_id = new_property_id
    and ca.id <> p_customer_account_id;

  update public.customer_accounts ca
  set property_id = new_property_id,
      updated_at = now()
  where ca.id = p_customer_account_id
    and ca.property_id is null;

  if not found then
    raise exception 'suite customer account was attached concurrently';
  end if;

  insert into public.suite_tenant_links (
    customer_account_id, product_key, external_tenant_id, created_by_user_id
  ) values (
    p_customer_account_id, 'hotelaccelerator', new_property_id::text, null
  )
  on conflict (product_key, external_tenant_id) do nothing;

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
  on conflict on constraint tenant_modules_property_id_module_key_key do update set
    status = excluded.status,
    activated_at = coalesce(public.tenant_modules.activated_at, excluded.activated_at),
    expires_at = excluded.expires_at,
    updated_at = now();

  return query select new_property_id, account_row.account_number;
end;
$$;

revoke all on function public.provision_hotelaccelerator_property_for_account(uuid, text) from public, anon, authenticated;
grant execute on function public.provision_hotelaccelerator_property_for_account(uuid, text) to service_role;

commit;
