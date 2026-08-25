-- A service-role bug must not be able to pair a user with another tenant.
-- The API already checks ownership; this composite FK makes the invariant
-- explicit and independently enforced by Postgres.

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.admin_users'::regclass
      and conname = 'admin_users_property_id_id_key'
  ) then
    alter table public.admin_users
      add constraint admin_users_property_id_id_key unique (property_id, id);
  end if;
end
$$;

alter table public.operator_kpi_settings
  drop constraint if exists operator_kpi_settings_user_id_fkey;

alter table public.operator_kpi_settings
  add constraint operator_kpi_settings_tenant_user_fkey
  foreign key (property_id, user_id)
  references public.admin_users(property_id, id)
  on delete cascade;
