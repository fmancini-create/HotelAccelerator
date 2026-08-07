-- These tables are intentionally backend-only. Keep RLS as defense in depth,
-- make the denial explicit for Data API roles, and remove their SQL privileges.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'cms_media_assets',
    'group_area_permissions',
    'user_area_permissions',
    'whatsapp_number_quota'
  ]
  loop
    execute format(
      'revoke all privileges on table public.%I from anon, authenticated',
      table_name
    );
    execute format(
      'create policy "backend_only_deny" on public.%I as restrictive for all to anon, authenticated using (false) with check (false)',
      table_name
    );
  end loop;
end
$$;
