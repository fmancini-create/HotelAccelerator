-- Applied to the HotelAccelerator Supabase project as migration
-- 20260807003549_harden_public_database_surface.
-- Public tenant metadata is resolved server-side before these grants are removed.

alter view public.public_properties set (security_invoker = true);

revoke all privileges on table public.public_properties from anon, authenticated;
grant select on table public.public_properties to service_role;

revoke all privileges on table public.properties from anon;

revoke execute on function public.check_admin_exists() from public, anon, authenticated;
grant execute on function public.check_admin_exists() to service_role;

revoke execute on function public.sync_legacy_module_flag() from public, anon, authenticated;
grant execute on function public.sync_legacy_module_flag() to service_role;
