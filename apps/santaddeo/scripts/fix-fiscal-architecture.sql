-- ============================================
-- FISCAL ARCHITECTURE FIX
-- ============================================
-- Problem: rms_fiscal_production is a legacy unused table.
-- The actual fiscal pipeline is:
--   Scidoo API → connectors.scidoo_raw_fiscal_production (immutable raw)
--              → daily_production (aggregated totals)
--
-- This script:
-- 1. Drops the unused rms_fiscal_production table
-- 2. Adds RLS policy to BLOCK DELETE on scidoo_raw_fiscal_production
-- 3. Creates monitoring view for broken connectors
-- ============================================

-- 1. DROP LEGACY TABLE
-- rms_fiscal_production was never used - dashboard reads from
-- connectors.scidoo_raw_fiscal_production and daily_production
DROP TABLE IF EXISTS public.rms_fiscal_production CASCADE;

-- 2. PROTECT RAW FISCAL DATA FROM DELETION
-- Enable RLS on the raw fiscal table
ALTER TABLE connectors.scidoo_raw_fiscal_production ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "block_delete_fiscal_raw" ON connectors.scidoo_raw_fiscal_production;
DROP POLICY IF EXISTS "allow_select_fiscal_raw" ON connectors.scidoo_raw_fiscal_production;
DROP POLICY IF EXISTS "allow_insert_fiscal_raw" ON connectors.scidoo_raw_fiscal_production;
DROP POLICY IF EXISTS "allow_update_fiscal_raw" ON connectors.scidoo_raw_fiscal_production;

-- Allow SELECT for all authenticated users (service role bypasses RLS anyway)
CREATE POLICY "allow_select_fiscal_raw" ON connectors.scidoo_raw_fiscal_production
  FOR SELECT USING (true);

-- Allow INSERT (sync cron needs to insert new records)
CREATE POLICY "allow_insert_fiscal_raw" ON connectors.scidoo_raw_fiscal_production
  FOR INSERT WITH CHECK (true);

-- Allow UPDATE (sync cron updates processed flag)
CREATE POLICY "allow_update_fiscal_raw" ON connectors.scidoo_raw_fiscal_production
  FOR UPDATE USING (true) WITH CHECK (true);

-- BLOCK DELETE - no policy = no delete allowed
-- Service role can still delete if absolutely needed (bypasses RLS)
-- But regular queries will fail

-- 3. CREATE MONITORING VIEW FOR CONNECTOR HEALTH
CREATE OR REPLACE VIEW connectors.fiscal_connector_health AS
SELECT 
  h.id as hotel_id,
  h.name as hotel_name,
  pi.pms_name,
  pi.is_active,
  pi.integration_mode,
  COALESCE(stats.records_last_24h, 0) as records_last_24h,
  COALESCE(stats.records_last_7d, 0) as records_last_7d,
  stats.last_sync_at,
  CASE 
    WHEN pi.is_active = false THEN 'INACTIVE'
    WHEN stats.records_last_24h IS NULL THEN 'NO_DATA'
    WHEN stats.records_last_24h = 0 AND pi.integration_mode = 'api' THEN 'BROKEN'
    ELSE 'HEALTHY'
  END as status
FROM hotels h
LEFT JOIN pms_integrations pi ON pi.hotel_id = h.id
LEFT JOIN LATERAL (
  SELECT 
    COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours') as records_last_24h,
    COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days') as records_last_7d,
    MAX(created_at) as last_sync_at
  FROM connectors.scidoo_raw_fiscal_production rf
  WHERE rf.hotel_id = h.id
) stats ON true
WHERE pi.id IS NOT NULL;

-- Grant access to the view
GRANT SELECT ON connectors.fiscal_connector_health TO authenticated;
GRANT SELECT ON connectors.fiscal_connector_health TO service_role;

-- 4. ADD COMMENT FOR DOCUMENTATION
COMMENT ON TABLE connectors.scidoo_raw_fiscal_production IS 
'IMMUTABLE RAW DATA - DO NOT DELETE. 
Fiscal documents from Scidoo API. 
Pipeline: Scidoo API → this table → daily_production.
RLS enabled: DELETE operations blocked by policy.';
