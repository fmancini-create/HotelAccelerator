-- =====================================================
-- SECURITY FIX: Enable RLS and fix SECURITY DEFINER views
-- Run this script on the PRODUCTION database
-- =====================================================

-- =====================================================
-- PART 1: Enable RLS on all public tables without it
-- =====================================================

-- Scidoo raw tables (hotel-specific data)
ALTER TABLE IF EXISTS public.scidoo_raw_minstay ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.scidoo_raw_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.scidoo_raw_room_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.scidoo_raw_availability ENABLE ROW LEVEL SECURITY;

-- Chat tables
ALTER TABLE IF EXISTS public.chat_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.chat_tier_config ENABLE ROW LEVEL SECURITY;

-- KPI tables
ALTER TABLE IF EXISTS public.kpi_plan_defaults ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.kpi_thresholds ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.kpi_suggestions ENABLE ROW LEVEL SECURITY;

-- Pricing tables
ALTER TABLE IF EXISTS public.pricing_variables ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.pricing_algo_params ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.pricing_grid ENABLE ROW LEVEL SECURITY;

-- Configuration tables
ALTER TABLE IF EXISTS public.occupancy_bands ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.occupancy_band_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.last_minute_levels ENABLE ROW LEVEL SECURITY;

-- Other tables
ALTER TABLE IF EXISTS public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.rms_metrics_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.upgrade_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.platform_knowledge ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.pms_available_endpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.pms_cron_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.user_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.marketing_contacts ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- PART 2: Create RLS Policies for hotel-specific tables
-- =====================================================

-- Helper function to get user's hotel IDs via profiles → organizations → hotels
CREATE OR REPLACE FUNCTION public.get_user_hotel_ids()
RETURNS SETOF uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT h.id 
  FROM public.hotels h 
  INNER JOIN public.profiles p ON p.organization_id = h.organization_id 
  WHERE p.id = auth.uid()
$$;

-- Scidoo raw tables policies (hotel_id based)
DO $$ BEGIN
  -- scidoo_raw_minstay
  DROP POLICY IF EXISTS "Users can view their hotel minstay data" ON public.scidoo_raw_minstay;
  CREATE POLICY "Users can view their hotel minstay data" ON public.scidoo_raw_minstay
    FOR SELECT USING (hotel_id IN (SELECT public.get_user_hotel_ids()));
    
  DROP POLICY IF EXISTS "Service role full access minstay" ON public.scidoo_raw_minstay;
  CREATE POLICY "Service role full access minstay" ON public.scidoo_raw_minstay
    FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN undefined_column THEN NULL; END $$;

DO $$ BEGIN
  -- scidoo_raw_rates
  DROP POLICY IF EXISTS "Users can view their hotel rates data" ON public.scidoo_raw_rates;
  CREATE POLICY "Users can view their hotel rates data" ON public.scidoo_raw_rates
    FOR SELECT USING (hotel_id IN (SELECT public.get_user_hotel_ids()));
    
  DROP POLICY IF EXISTS "Service role full access rates" ON public.scidoo_raw_rates;
  CREATE POLICY "Service role full access rates" ON public.scidoo_raw_rates
    FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN undefined_column THEN NULL; END $$;

DO $$ BEGIN
  -- scidoo_raw_room_types
  DROP POLICY IF EXISTS "Users can view their hotel room types" ON public.scidoo_raw_room_types;
  CREATE POLICY "Users can view their hotel room types" ON public.scidoo_raw_room_types
    FOR SELECT USING (hotel_id IN (SELECT public.get_user_hotel_ids()));
    
  DROP POLICY IF EXISTS "Service role full access room types" ON public.scidoo_raw_room_types;
  CREATE POLICY "Service role full access room types" ON public.scidoo_raw_room_types
    FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN undefined_column THEN NULL; END $$;

DO $$ BEGIN
  -- scidoo_raw_availability
  DROP POLICY IF EXISTS "Users can view their hotel availability" ON public.scidoo_raw_availability;
  CREATE POLICY "Users can view their hotel availability" ON public.scidoo_raw_availability
    FOR SELECT USING (hotel_id IN (SELECT public.get_user_hotel_ids()));
    
  DROP POLICY IF EXISTS "Service role full access availability" ON public.scidoo_raw_availability;
  CREATE POLICY "Service role full access availability" ON public.scidoo_raw_availability
    FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN undefined_column THEN NULL; END $$;

-- =====================================================
-- PART 3: Chat tables policies (user_id or hotel_id based)
-- =====================================================

DO $$ BEGIN
  -- chat_sessions
  DROP POLICY IF EXISTS "Users can view their own chat sessions" ON public.chat_sessions;
  CREATE POLICY "Users can view their own chat sessions" ON public.chat_sessions
    FOR SELECT USING (user_id = auth.uid() OR hotel_id IN (SELECT public.get_user_hotel_ids()));
    
  DROP POLICY IF EXISTS "Users can create their own chat sessions" ON public.chat_sessions;
  CREATE POLICY "Users can create their own chat sessions" ON public.chat_sessions
    FOR INSERT WITH CHECK (user_id = auth.uid());
    
  DROP POLICY IF EXISTS "Users can update their own chat sessions" ON public.chat_sessions;
  CREATE POLICY "Users can update their own chat sessions" ON public.chat_sessions
    FOR UPDATE USING (user_id = auth.uid());
    
  DROP POLICY IF EXISTS "Service role full access chat sessions" ON public.chat_sessions;
  CREATE POLICY "Service role full access chat sessions" ON public.chat_sessions
    FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN undefined_column THEN NULL; END $$;

DO $$ BEGIN
  -- chat_messages
  DROP POLICY IF EXISTS "Users can view their own chat messages" ON public.chat_messages;
  CREATE POLICY "Users can view their own chat messages" ON public.chat_messages
    FOR SELECT USING (
      session_id IN (SELECT id FROM public.chat_sessions WHERE user_id = auth.uid())
    );
    
  DROP POLICY IF EXISTS "Users can create their own chat messages" ON public.chat_messages;
  CREATE POLICY "Users can create their own chat messages" ON public.chat_messages
    FOR INSERT WITH CHECK (
      session_id IN (SELECT id FROM public.chat_sessions WHERE user_id = auth.uid())
    );
    
  DROP POLICY IF EXISTS "Service role full access chat messages" ON public.chat_messages;
  CREATE POLICY "Service role full access chat messages" ON public.chat_messages
    FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN undefined_column THEN NULL; END $$;

-- chat_tier_config (admin/service role only)
DROP POLICY IF EXISTS "Service role full access chat tier config" ON public.chat_tier_config;
CREATE POLICY "Service role full access chat tier config" ON public.chat_tier_config
  FOR ALL USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Authenticated users can read chat tier config" ON public.chat_tier_config;
CREATE POLICY "Authenticated users can read chat tier config" ON public.chat_tier_config
  FOR SELECT USING (auth.role() = 'authenticated');

-- =====================================================
-- PART 4: KPI tables policies (hotel_id based)
-- =====================================================

DO $$ BEGIN
  -- kpi_thresholds
  DROP POLICY IF EXISTS "Users can view their hotel kpi thresholds" ON public.kpi_thresholds;
  CREATE POLICY "Users can view their hotel kpi thresholds" ON public.kpi_thresholds
    FOR SELECT USING (hotel_id IN (SELECT public.get_user_hotel_ids()));
    
  DROP POLICY IF EXISTS "Users can manage their hotel kpi thresholds" ON public.kpi_thresholds;
  CREATE POLICY "Users can manage their hotel kpi thresholds" ON public.kpi_thresholds
    FOR ALL USING (hotel_id IN (SELECT public.get_user_hotel_ids()));
    
  DROP POLICY IF EXISTS "Service role full access kpi thresholds" ON public.kpi_thresholds;
  CREATE POLICY "Service role full access kpi thresholds" ON public.kpi_thresholds
    FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN undefined_column THEN NULL; END $$;

DO $$ BEGIN
  -- kpi_suggestions
  DROP POLICY IF EXISTS "Users can view their hotel kpi suggestions" ON public.kpi_suggestions;
  CREATE POLICY "Users can view their hotel kpi suggestions" ON public.kpi_suggestions
    FOR SELECT USING (hotel_id IN (SELECT public.get_user_hotel_ids()));
    
  DROP POLICY IF EXISTS "Service role full access kpi suggestions" ON public.kpi_suggestions;
  CREATE POLICY "Service role full access kpi suggestions" ON public.kpi_suggestions
    FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN undefined_column THEN NULL; END $$;

-- kpi_plan_defaults (read-only for all, managed by service role)
DROP POLICY IF EXISTS "Authenticated users can read kpi plan defaults" ON public.kpi_plan_defaults;
CREATE POLICY "Authenticated users can read kpi plan defaults" ON public.kpi_plan_defaults
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Service role full access kpi plan defaults" ON public.kpi_plan_defaults;
CREATE POLICY "Service role full access kpi plan defaults" ON public.kpi_plan_defaults
  FOR ALL USING (auth.role() = 'service_role');

-- =====================================================
-- PART 5: Pricing tables policies (hotel_id based)
-- =====================================================

DO $$ BEGIN
  -- pricing_variables
  DROP POLICY IF EXISTS "Users can view their hotel pricing variables" ON public.pricing_variables;
  CREATE POLICY "Users can view their hotel pricing variables" ON public.pricing_variables
    FOR SELECT USING (hotel_id IN (SELECT public.get_user_hotel_ids()));
    
  DROP POLICY IF EXISTS "Users can manage their hotel pricing variables" ON public.pricing_variables;
  CREATE POLICY "Users can manage their hotel pricing variables" ON public.pricing_variables
    FOR ALL USING (hotel_id IN (SELECT public.get_user_hotel_ids()));
    
  DROP POLICY IF EXISTS "Service role full access pricing variables" ON public.pricing_variables;
  CREATE POLICY "Service role full access pricing variables" ON public.pricing_variables
    FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN undefined_column THEN NULL; END $$;

DO $$ BEGIN
  -- pricing_algo_params
  DROP POLICY IF EXISTS "Users can view their hotel pricing algo params" ON public.pricing_algo_params;
  CREATE POLICY "Users can view their hotel pricing algo params" ON public.pricing_algo_params
    FOR SELECT USING (hotel_id IN (SELECT public.get_user_hotel_ids()));
    
  DROP POLICY IF EXISTS "Users can manage their hotel pricing algo params" ON public.pricing_algo_params;
  CREATE POLICY "Users can manage their hotel pricing algo params" ON public.pricing_algo_params
    FOR ALL USING (hotel_id IN (SELECT public.get_user_hotel_ids()));
    
  DROP POLICY IF EXISTS "Service role full access pricing algo params" ON public.pricing_algo_params;
  CREATE POLICY "Service role full access pricing algo params" ON public.pricing_algo_params
    FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN undefined_column THEN NULL; END $$;

DO $$ BEGIN
  -- pricing_grid
  DROP POLICY IF EXISTS "Users can view their hotel pricing grid" ON public.pricing_grid;
  CREATE POLICY "Users can view their hotel pricing grid" ON public.pricing_grid
    FOR SELECT USING (hotel_id IN (SELECT public.get_user_hotel_ids()));
    
  DROP POLICY IF EXISTS "Users can manage their hotel pricing grid" ON public.pricing_grid;
  CREATE POLICY "Users can manage their hotel pricing grid" ON public.pricing_grid
    FOR ALL USING (hotel_id IN (SELECT public.get_user_hotel_ids()));
    
  DROP POLICY IF EXISTS "Service role full access pricing grid" ON public.pricing_grid;
  CREATE POLICY "Service role full access pricing grid" ON public.pricing_grid
    FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN undefined_column THEN NULL; END $$;

-- =====================================================
-- PART 6: Configuration tables (hotel_id based)
-- =====================================================

DO $$ BEGIN
  -- occupancy_bands
  DROP POLICY IF EXISTS "Users can view their hotel occupancy bands" ON public.occupancy_bands;
  CREATE POLICY "Users can view their hotel occupancy bands" ON public.occupancy_bands
    FOR SELECT USING (hotel_id IN (SELECT public.get_user_hotel_ids()));
    
  DROP POLICY IF EXISTS "Users can manage their hotel occupancy bands" ON public.occupancy_bands;
  CREATE POLICY "Users can manage their hotel occupancy bands" ON public.occupancy_bands
    FOR ALL USING (hotel_id IN (SELECT public.get_user_hotel_ids()));
    
  DROP POLICY IF EXISTS "Service role full access occupancy bands" ON public.occupancy_bands;
  CREATE POLICY "Service role full access occupancy bands" ON public.occupancy_bands
    FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN undefined_column THEN NULL; END $$;

DO $$ BEGIN
  -- occupancy_band_groups
  DROP POLICY IF EXISTS "Users can view their hotel occupancy band groups" ON public.occupancy_band_groups;
  CREATE POLICY "Users can view their hotel occupancy band groups" ON public.occupancy_band_groups
    FOR SELECT USING (hotel_id IN (SELECT public.get_user_hotel_ids()));
    
  DROP POLICY IF EXISTS "Users can manage their hotel occupancy band groups" ON public.occupancy_band_groups;
  CREATE POLICY "Users can manage their hotel occupancy band groups" ON public.occupancy_band_groups
    FOR ALL USING (hotel_id IN (SELECT public.get_user_hotel_ids()));
    
  DROP POLICY IF EXISTS "Service role full access occupancy band groups" ON public.occupancy_band_groups;
  CREATE POLICY "Service role full access occupancy band groups" ON public.occupancy_band_groups
    FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN undefined_column THEN NULL; END $$;

DO $$ BEGIN
  -- last_minute_levels
  DROP POLICY IF EXISTS "Users can view their hotel last minute levels" ON public.last_minute_levels;
  CREATE POLICY "Users can view their hotel last minute levels" ON public.last_minute_levels
    FOR SELECT USING (hotel_id IN (SELECT public.get_user_hotel_ids()));
    
  DROP POLICY IF EXISTS "Users can manage their hotel last minute levels" ON public.last_minute_levels;
  CREATE POLICY "Users can manage their hotel last minute levels" ON public.last_minute_levels
    FOR ALL USING (hotel_id IN (SELECT public.get_user_hotel_ids()));
    
  DROP POLICY IF EXISTS "Service role full access last minute levels" ON public.last_minute_levels;
  CREATE POLICY "Service role full access last minute levels" ON public.last_minute_levels
    FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN undefined_column THEN NULL; END $$;

-- =====================================================
-- PART 7: Other tables
-- =====================================================

-- tenants (admin/service role only)
DROP POLICY IF EXISTS "Service role full access tenants" ON public.tenants;
CREATE POLICY "Service role full access tenants" ON public.tenants
  FOR ALL USING (auth.role() = 'service_role');

-- rms_metrics_history (hotel_id based)
DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can view their hotel metrics history" ON public.rms_metrics_history;
  CREATE POLICY "Users can view their hotel metrics history" ON public.rms_metrics_history
    FOR SELECT USING (hotel_id IN (SELECT public.get_user_hotel_ids()));
    
  DROP POLICY IF EXISTS "Service role full access metrics history" ON public.rms_metrics_history;
  CREATE POLICY "Service role full access metrics history" ON public.rms_metrics_history
    FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN undefined_column THEN NULL; END $$;

-- upgrade_requests (user_id based)
DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can view their own upgrade requests" ON public.upgrade_requests;
  CREATE POLICY "Users can view their own upgrade requests" ON public.upgrade_requests
    FOR SELECT USING (user_id = auth.uid());
    
  DROP POLICY IF EXISTS "Users can create upgrade requests" ON public.upgrade_requests;
  CREATE POLICY "Users can create upgrade requests" ON public.upgrade_requests
    FOR INSERT WITH CHECK (user_id = auth.uid());
    
  DROP POLICY IF EXISTS "Service role full access upgrade requests" ON public.upgrade_requests;
  CREATE POLICY "Service role full access upgrade requests" ON public.upgrade_requests
    FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN undefined_column THEN NULL; END $$;

-- platform_knowledge (read-only for authenticated, managed by service role)
DROP POLICY IF EXISTS "Authenticated users can read platform knowledge" ON public.platform_knowledge;
CREATE POLICY "Authenticated users can read platform knowledge" ON public.platform_knowledge
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Service role full access platform knowledge" ON public.platform_knowledge;
CREATE POLICY "Service role full access platform knowledge" ON public.platform_knowledge
  FOR ALL USING (auth.role() = 'service_role');

-- pms_available_endpoints (read-only for authenticated)
DROP POLICY IF EXISTS "Authenticated users can read pms endpoints" ON public.pms_available_endpoints;
CREATE POLICY "Authenticated users can read pms endpoints" ON public.pms_available_endpoints
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Service role full access pms endpoints" ON public.pms_available_endpoints;
CREATE POLICY "Service role full access pms endpoints" ON public.pms_available_endpoints
  FOR ALL USING (auth.role() = 'service_role');

-- pms_cron_settings (hotel_id based)
DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can view their hotel cron settings" ON public.pms_cron_settings;
  CREATE POLICY "Users can view their hotel cron settings" ON public.pms_cron_settings
    FOR SELECT USING (hotel_id IN (SELECT public.get_user_hotel_ids()));
    
  DROP POLICY IF EXISTS "Users can manage their hotel cron settings" ON public.pms_cron_settings;
  CREATE POLICY "Users can manage their hotel cron settings" ON public.pms_cron_settings
    FOR ALL USING (hotel_id IN (SELECT public.get_user_hotel_ids()));
    
  DROP POLICY IF EXISTS "Service role full access cron settings" ON public.pms_cron_settings;
  CREATE POLICY "Service role full access cron settings" ON public.pms_cron_settings
    FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN undefined_column THEN NULL; END $$;

-- user_feedback (user_id based)
DO $$ BEGIN
  DROP POLICY IF EXISTS "Users can view their own feedback" ON public.user_feedback;
  CREATE POLICY "Users can view their own feedback" ON public.user_feedback
    FOR SELECT USING (user_id = auth.uid());
    
  DROP POLICY IF EXISTS "Users can create feedback" ON public.user_feedback;
  CREATE POLICY "Users can create feedback" ON public.user_feedback
    FOR INSERT WITH CHECK (user_id = auth.uid());
    
  DROP POLICY IF EXISTS "Service role full access user feedback" ON public.user_feedback;
  CREATE POLICY "Service role full access user feedback" ON public.user_feedback
    FOR ALL USING (auth.role() = 'service_role');
EXCEPTION WHEN undefined_column THEN NULL; END $$;

-- marketing_contacts (admin/service role only)
DROP POLICY IF EXISTS "Service role full access marketing contacts" ON public.marketing_contacts;
CREATE POLICY "Service role full access marketing contacts" ON public.marketing_contacts
  FOR ALL USING (auth.role() = 'service_role');

-- =====================================================
-- PART 8: Fix SECURITY DEFINER views
-- Recreate views without SECURITY DEFINER
-- =====================================================

-- Note: These views need to be recreated without SECURITY DEFINER
-- First, get the view definitions and recreate them
-- This requires knowing the exact view definitions

-- For rms_room_types view
DO $$ 
DECLARE
  view_def text;
BEGIN
  SELECT pg_get_viewdef('public.rms_room_types', true) INTO view_def;
  IF view_def IS NOT NULL THEN
    EXECUTE 'DROP VIEW IF EXISTS public.rms_room_types CASCADE';
    EXECUTE 'CREATE VIEW public.rms_room_types AS ' || view_def;
  END IF;
EXCEPTION WHEN undefined_table THEN NULL; END $$;

-- For rms_daily_room_revenue view
DO $$ 
DECLARE
  view_def text;
BEGIN
  SELECT pg_get_viewdef('public.rms_daily_room_revenue', true) INTO view_def;
  IF view_def IS NOT NULL THEN
    EXECUTE 'DROP VIEW IF EXISTS public.rms_daily_room_revenue CASCADE';
    EXECUTE 'CREATE VIEW public.rms_daily_room_revenue AS ' || view_def;
  END IF;
EXCEPTION WHEN undefined_table THEN NULL; END $$;

-- For rms_bookings view
DO $$ 
DECLARE
  view_def text;
BEGIN
  SELECT pg_get_viewdef('public.rms_bookings', true) INTO view_def;
  IF view_def IS NOT NULL THEN
    EXECUTE 'DROP VIEW IF EXISTS public.rms_bookings CASCADE';
    EXECUTE 'CREATE VIEW public.rms_bookings AS ' || view_def;
  END IF;
EXCEPTION WHEN undefined_table THEN NULL; END $$;

-- For fiscal_connector_health view in connectors schema
DO $$ 
DECLARE
  view_def text;
BEGIN
  SELECT pg_get_viewdef('connectors.fiscal_connector_health', true) INTO view_def;
  IF view_def IS NOT NULL THEN
    EXECUTE 'DROP VIEW IF EXISTS connectors.fiscal_connector_health CASCADE';
    EXECUTE 'CREATE VIEW connectors.fiscal_connector_health AS ' || view_def;
  END IF;
EXCEPTION WHEN undefined_table THEN NULL; END $$;

-- =====================================================
-- VERIFICATION: List tables still without RLS
-- =====================================================

-- Run this query to verify all tables have RLS enabled:
-- SELECT schemaname, tablename, rowsecurity 
-- FROM pg_tables 
-- WHERE schemaname = 'public' 
-- AND rowsecurity = false;

SELECT 'Security fixes applied successfully. Please verify by running the linter again.' as status;
