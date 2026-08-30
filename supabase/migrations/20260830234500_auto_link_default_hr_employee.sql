-- Ensure the default tenant administrator also has an HR employee record
-- whenever the HR module is active. This keeps /admin/my-work usable without
-- requiring the hotel to recreate its primary account manually.

create or replace function public.hr_provision_default_employee(p_property_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin record;
  v_first_name text;
  v_last_name text;
begin
  if p_property_id is null then
    return;
  end if;

  if not exists (
    select 1
    from public.tenant_modules tm
    where tm.property_id = p_property_id
      and tm.module_key = 'hr'
      and tm.status = 'active'
  ) then
    return;
  end if;

  select a.id, a.email, nullif(trim(a.name), '') as full_name
    into v_admin
  from public.admin_users a
  where a.property_id = p_property_id
    and a.is_tenant_admin = true
  order by a.created_at asc, a.id asc
  limit 1;

  if v_admin.id is null then
    return;
  end if;

  if exists (
    select 1
    from public.hr_employees e
    where e.property_id = p_property_id
      and e.admin_user_id = v_admin.id
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

  insert into public.hr_employees (
    property_id,
    admin_user_id,
    first_name,
    last_name,
    email,
    employment_status
  )
  values (
    p_property_id,
    v_admin.id,
    v_first_name,
    coalesce(v_last_name, 'Tenant'),
    v_admin.email,
    'active'
  )
  on conflict (property_id, admin_user_id) do nothing;
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
  if new.is_tenant_admin = true and new.property_id is not null then
    perform public.hr_provision_default_employee(new.property_id);
  end if;
  return new;
end;
$$;

revoke all on function public.hr_provision_default_employee_from_admin_user() from public;
revoke all on function public.hr_provision_default_employee_from_admin_user() from anon;
revoke all on function public.hr_provision_default_employee_from_admin_user() from authenticated;

drop trigger if exists hr_default_employee_after_admin_user on public.admin_users;
create trigger hr_default_employee_after_admin_user
after insert or update of property_id, is_tenant_admin, name, email
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
  if new.module_key = 'hr' and new.status = 'active' then
    perform public.hr_provision_default_employee(new.property_id);
  end if;
  return new;
end;
$$;

revoke all on function public.hr_provision_default_employee_from_module() from public;
revoke all on function public.hr_provision_default_employee_from_module() from anon;
revoke all on function public.hr_provision_default_employee_from_module() from authenticated;

drop trigger if exists hr_default_employee_after_module_activation on public.tenant_modules;
create trigger hr_default_employee_after_module_activation
after insert or update of property_id, module_key, status
on public.tenant_modules
for each row
execute function public.hr_provision_default_employee_from_module();

-- Backfill existing HR-enabled tenants. The helper is idempotent because
-- hr_employees already has UNIQUE (property_id, admin_user_id).
do $$
declare
  v_property_id uuid;
begin
  for v_property_id in
    select distinct tm.property_id
    from public.tenant_modules tm
    where tm.module_key = 'hr'
      and tm.status = 'active'
  loop
    perform public.hr_provision_default_employee(v_property_id);
  end loop;
end;
$$;
