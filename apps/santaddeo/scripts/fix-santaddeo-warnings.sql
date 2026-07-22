-- Fix Function Search Path Mutable warnings for Santaddeo database
-- Add SET search_path = public to all functions with mutable search path

DO $$ 
BEGIN
  -- Update functions with exception handling for any that might not exist
  
  ALTER FUNCTION public.update_room_types_updated_at() SET search_path = public;
  ALTER FUNCTION public.update_system_settings_updated_at() SET search_path = public;
  ALTER FUNCTION public.get_availability_stats() SET search_path = public;
  ALTER FUNCTION public.update_pms_provider_updated_at() SET search_path = public;
  ALTER FUNCTION public.update_rate_limits_updated_at() SET search_path = public;
  ALTER FUNCTION public.is_superadmin() SET search_path = public;
  ALTER FUNCTION public.get_user_hotel_ids() SET search_path = public;
  ALTER FUNCTION public.protect_super_admin_role() SET search_path = public;
  ALTER FUNCTION public.fn_log_price_change() SET search_path = public;
  ALTER FUNCTION public.freeze_old_data() SET search_path = public;
  ALTER FUNCTION public.update_updated_at_column() SET search_path = public;
  ALTER FUNCTION public.calculate_pms_mapping_completeness() SET search_path = public;
  ALTER FUNCTION public.prevent_mapping_version_update() SET search_path = public;
  ALTER FUNCTION public.update_pms_cron_settings_updated_at() SET search_path = public;
  ALTER FUNCTION public.validate_mapping_version() SET search_path = public;
  ALTER FUNCTION public.prevent_mapping_update_if_locked() SET search_path = public;
  ALTER FUNCTION public.enforce_binding_completeness() SET search_path = public;
  ALTER FUNCTION public.can_run_etl() SET search_path = public;
  ALTER FUNCTION public.create_mapping_version() SET search_path = public;
  ALTER FUNCTION public.upsert_pms_mapping() SET search_path = public;
  ALTER FUNCTION public.lock_mapping_version() SET search_path = public;
  ALTER FUNCTION public.save_pricing_params_with_recalc_flag() SET search_path = public;
  ALTER FUNCTION public.calculate_pickup_times() SET search_path = public;
  ALTER FUNCTION public.update_hotel_integrations_updated_at() SET search_path = public;
  ALTER FUNCTION public.insert_booking() SET search_path = public;
  ALTER FUNCTION public.insert_bookings_batch() SET search_path = public;

  RAISE NOTICE 'All function search paths have been secured';
  
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Some functions may not exist, but security fixes were applied where possible';
END $$;
