-- HR user/account invariant.
--
-- When HR is effectively active, every HotelAccelerator tenant account must
-- have one linked hr_employees row. This is required by time clock, shifts,
-- leave and the mobile login gate. Standalone HR employees without a login
-- remain supported.

create or replace function public.hr_sync_admin_user_employee(p_admin_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin record;
  v_employee_id uuid;
  v_email_match_id uuid;
  v_email_match_count integer := 0;
  v_first_name text;
  v_last_name text;
begin
  if p_admin_user_id is null then
    return;
  end if;

  select a.id, a.property_id, a.email, nullif(trim(a.name), '') as full_name
    into v_admin
  from public.admin_users a
  where a.id = p_admin_user_id;

  if v_admin.id is null or v_admin.property_id is null then
    return;
  end if;

  if not exists (
    select 1
    from public.tenant_modules tm
    where tm.property_id = v_admin.property_id
      and tm.module_key = 'hr'
      and tm.status in ('active', 'trial')
      and (tm.expires_at is null or tm.expires_at >= now())
  ) then
    return;
  end if;

  v_first_name := coalesce(
    nullif(split_part(v_admin.full_name, ' ', 1), ''),
    nullif(split_part(v_admin.email, '@', 1), ''),
    'Utente'
  );

  if v_admin.full_name is not null and position(' ' in v_admin.full_name) > 0 then
    v_last_name := nullif(trim(substr(v_admin.full_name, position(' ' in v_admin.full_name) + 1)), '');
  end if;
  v_last_name := coalesce(v_last_name, 'HotelAccelerator');

  -- Existing account link: keep employment status, attendance flag and HR data
  -- that are not identity fields. Name/email follow the Core account.
  select e.id
    into v_employee_id
  from public.hr_employees e
  where e.property_id = v_admin.property_id
    and e.admin_user_id = v_admin.id
  order by e.created_at asc, e.id asc
  limit 1;

  if v_employee_id is not null then
    update public.hr_employees
    set first_name = v_first_name,
        last_name = v_last_name,
        email = v_admin.email,
        updated_at = now()
    where id = v_employee_id;
    return;
  end if;

  -- If the employee was entered manually before the login account existed,
  -- link only an unambiguous same-tenant email match. Never guess among
  -- duplicates.
  if nullif(trim(v_admin.email), '') is not null then
    select count(*)
      into v_email_match_count
    from public.hr_employees e
    where e.property_id = v_admin.property_id
      and e.admin_user_id is null
      and e.email is not null
      and lower(trim(e.email)) = lower(trim(v_admin.email));

    if v_email_match_count = 1 then
      select e.id
        into v_email_match_id
      from public.hr_employees e
      where e.property_id = v_admin.property_id
        and e.admin_user_id is null
        and e.email is not null
        and lower(trim(e.email)) = lower(trim(v_admin.email))
      order by e.created_at asc, e.id asc
      limit 1;
    end if;

    if v_email_match_id is not null then
      update public.hr_employees
      set admin_user_id = v_admin.id,
          first_name = v_first_name,
          last_name = v_last_name,
          email = v_admin.email,
          updated_at = now()
      where id = v_email_match_id;
      return;
    end if;
  end if;

  insert into public.hr_employees (
    property_id,
    admin_user_id,
    first_name,
    last_name,
    email,
    employment_status
  )
  values (
    v_admin.property_id,
    v_admin.id,
    v_first_name,
    v_last_name,
    v_admin.email,
    'active'
  )
  on conflict (property_id, admin_user_id) do update
    set first_name = excluded.first_name,
        last_name = excluded.last_name,
        email = excluded.email,
        updated_at = now();
end;
$$;

revoke all on function public.hr_sync_admin_user_employee(uuid) from public;
revoke all on function public.hr_sync_admin_user_employee(uuid) from anon;
revoke all on function public.hr_sync_admin_user_employee(uuid) from authenticated;

create or replace function public.hr_provision_property_users(p_property_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin_user_id uuid;
begin
  if p_property_id is null then
    return;
  end if;

  if not exists (
    select 1
    from public.tenant_modules tm
    where tm.property_id = p_property_id
      and tm.module_key = 'hr'
      and tm.status in ('active', 'trial')
      and (tm.expires_at is null or tm.expires_at >= now())
  ) then
    return;
  end if;

  for v_admin_user_id in
    select a.id
    from public.admin_users a
    where a.property_id = p_property_id
    order by a.created_at asc, a.id asc
  loop
    perform public.hr_sync_admin_user_employee(v_admin_user_id);
  end loop;
end;
$$;

revoke all on function public.hr_provision_property_users(uuid) from public;
revoke all on function public.hr_provision_property_users(uuid) from anon;
revoke all on function public.hr_provision_property_users(uuid) from authenticated;

-- Compatibility: historical callers can keep using this helper, but the rule
-- is no longer limited to the first tenant administrator.
create or replace function public.hr_provision_default_employee(p_property_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.hr_provision_property_users(p_property_id);
end;
$$;

revoke all on function public.hr_provision_default_employee(uuid) from public;
revoke all on function public.hr_provision_default_employee(uuid) from anon;
revoke all on function public.hr_provision_default_employee(uuid) from authenticated;

create or replace function public.hr_provision_default_employee_from_admin_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.property_id is not null then
    perform public.hr_sync_admin_user_employee(new.id);
  end if;
  return new;
end;
$$;

revoke all on function public.hr_provision_default_employee_from_admin_user() from public;
revoke all on function public.hr_provision_default_employee_from_admin_user() from anon;
revoke all on function public.hr_provision_default_employee_from_admin_user() from authenticated;

drop trigger if exists hr_default_employee_after_admin_user on public.admin_users;
create trigger hr_default_employee_after_admin_user
after insert or update of property_id, name, email
on public.admin_users
for each row
execute function public.hr_provision_default_employee_from_admin_user();

create or replace function public.hr_provision_default_employee_from_module()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.module_key = 'hr'
     and new.status in ('active', 'trial')
     and (new.expires_at is null or new.expires_at >= now()) then
    perform public.hr_provision_property_users(new.property_id);
  end if;
  return new;
end;
$$;

revoke all on function public.hr_provision_default_employee_from_module() from public;
revoke all on function public.hr_provision_default_employee_from_module() from anon;
revoke all on function public.hr_provision_default_employee_from_module() from authenticated;

drop trigger if exists hr_default_employee_after_module_activation on public.tenant_modules;
create trigger hr_default_employee_after_module_activation
after insert or update of property_id, module_key, status, expires_at
on public.tenant_modules
for each row
execute function public.hr_provision_default_employee_from_module();

-- Existing HR tenants are repaired in-place. The helpers are idempotent.
do $$
declare
  v_property_id uuid;
begin
  for v_property_id in
    select distinct tm.property_id
    from public.tenant_modules tm
    where tm.module_key = 'hr'
      and tm.status in ('active', 'trial')
      and (tm.expires_at is null or tm.expires_at >= now())
  loop
    perform public.hr_provision_property_users(v_property_id);
  end loop;
end;
$$;
