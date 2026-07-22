-- Fix Function Search Path Mutable warnings
-- Only alter functions that exist in Santaddeo database
-- Use DO blocks with exception handling to skip non-existent functions

DO $$ 
BEGIN
  -- Try to alter each function, skip if it doesn't exist
  BEGIN
    ALTER FUNCTION public.update_updated_at_column() SET search_path = public;
    RAISE NOTICE 'Fixed: update_updated_at_column';
  EXCEPTION WHEN undefined_function THEN
    RAISE NOTICE 'Skipped: update_updated_at_column (does not exist)';
  END;
  
  BEGIN
    ALTER FUNCTION public.update_referral_events_updated_at() SET search_path = public;
    RAISE NOTICE 'Fixed: update_referral_events_updated_at';
  EXCEPTION WHEN undefined_function THEN
    RAISE NOTICE 'Skipped: update_referral_events_updated_at (does not exist)';
  END;
END $$;

-- Fix RLS Policy Always True warnings
-- Skip tables that don't exist in Santaddeo database

DO $$ 
BEGIN
  -- Only fix tables that exist - check each one individually
  
  -- dem_logs (likely exists in Santaddeo)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'dem_logs') THEN
    DROP POLICY IF EXISTS "Service role full access on dem_logs" ON public.dem_logs;
    CREATE POLICY "service_role_dem_logs_all" 
      ON public.dem_logs 
      FOR ALL 
      USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
    RAISE NOTICE 'Fixed: dem_logs RLS policy';
  END IF;

  -- page_stats
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'page_stats') THEN
    DROP POLICY IF EXISTS "service_all_page_stats" ON public.page_stats;
    CREATE POLICY "service_role_page_stats_all" 
      ON public.page_stats 
      FOR ALL 
      USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
    RAISE NOTICE 'Fixed: page_stats RLS policy';
  END IF;

  -- page_views
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'page_views') THEN
    DROP POLICY IF EXISTS "service_insert_page_views" ON public.page_views;
    CREATE POLICY "service_role_insert_page_views" 
      ON public.page_views 
      FOR INSERT 
      WITH CHECK (auth.role() = 'service_role');
    RAISE NOTICE 'Fixed: page_views RLS policy';
  END IF;

  -- credit_ledger
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'credit_ledger') THEN
    DROP POLICY IF EXISTS "service_insert_credit_ledger" ON public.credit_ledger;
    CREATE POLICY "service_insert_credit_ledger" 
      ON public.credit_ledger 
      FOR INSERT 
      WITH CHECK (auth.role() = 'service_role');
    RAISE NOTICE 'Fixed: credit_ledger RLS policy';
  END IF;

  -- referral_events
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'referral_events') THEN
    DROP POLICY IF EXISTS "service_insert_referral_events" ON public.referral_events;
    CREATE POLICY "service_role_insert_referral_events" 
      ON public.referral_events 
      FOR INSERT 
      WITH CHECK (auth.role() = 'service_role');
    
    DROP POLICY IF EXISTS "service_update_referral_events" ON public.referral_events;
    CREATE POLICY "service_role_update_referral_events" 
      ON public.referral_events 
      FOR UPDATE 
      USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
    RAISE NOTICE 'Fixed: referral_events RLS policies';
  END IF;

  -- admin_invites
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'admin_invites') THEN
    DROP POLICY IF EXISTS "service_role_all" ON public.admin_invites;
    CREATE POLICY "service_role_admin_invites_all" 
      ON public.admin_invites 
      FOR ALL 
      USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
    RAISE NOTICE 'Fixed: admin_invites RLS policy';
  END IF;

END $$;

-- Enable Leaked Password Protection
-- This is a Supabase Auth setting - enable from the Supabase dashboard:
-- 1. Go to Authentication → Providers → Email
-- 2. Enable "Leaked password protection"
