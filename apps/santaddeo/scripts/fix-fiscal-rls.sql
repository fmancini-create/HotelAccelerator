-- Fix RLS on scidoo_raw_fiscal_production table
-- The table is in 'connectors' schema and needs to allow inserts from service role

-- First, check if the table has RLS enabled
-- SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'connectors' AND tablename = 'scidoo_raw_fiscal_production';

-- Option 1: Disable RLS completely (simpler, but less secure)
-- ALTER TABLE connectors.scidoo_raw_fiscal_production DISABLE ROW LEVEL SECURITY;

-- Option 2: Create permissive INSERT policy for service role (recommended)
-- This allows the service role (used by cron jobs) to insert data
CREATE POLICY "Allow service role insert" ON connectors.scidoo_raw_fiscal_production
  FOR INSERT
  WITH CHECK (true);

-- Also need SELECT and UPDATE for potential upserts
CREATE POLICY "Allow service role select" ON connectors.scidoo_raw_fiscal_production
  FOR SELECT
  USING (true);

CREATE POLICY "Allow service role update" ON connectors.scidoo_raw_fiscal_production
  FOR UPDATE
  USING (true);

-- Verify RLS is still enabled but now has permissive policies
-- SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'connectors' AND tablename = 'scidoo_raw_fiscal_production';

-- Check policies
-- SELECT * FROM pg_policies WHERE tablename = 'scidoo_raw_fiscal_production';
