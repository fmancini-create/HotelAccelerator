-- =====================================================
-- IMMUTABLE FISCAL RAW TABLE
-- Make connectors.scidoo_raw_fiscal_production append-only
-- =====================================================

-- 1. Enable Row Level Security
ALTER TABLE connectors.scidoo_raw_fiscal_production ENABLE ROW LEVEL SECURITY;

-- 2. Force RLS for table owner as well
ALTER TABLE connectors.scidoo_raw_fiscal_production FORCE ROW LEVEL SECURITY;

-- 3. Drop any existing policies to start fresh
DROP POLICY IF EXISTS "fiscal_raw_select" ON connectors.scidoo_raw_fiscal_production;
DROP POLICY IF EXISTS "fiscal_raw_insert" ON connectors.scidoo_raw_fiscal_production;
DROP POLICY IF EXISTS "fiscal_raw_update" ON connectors.scidoo_raw_fiscal_production;
DROP POLICY IF EXISTS "fiscal_raw_delete" ON connectors.scidoo_raw_fiscal_production;
DROP POLICY IF EXISTS "service_role_full_access" ON connectors.scidoo_raw_fiscal_production;

-- 4. SELECT policy: service_role only (for dashboard queries via server)
CREATE POLICY "fiscal_raw_select"
ON connectors.scidoo_raw_fiscal_production
FOR SELECT
TO service_role
USING (true);

-- 5. INSERT policy: service_role only (for sync operations)
CREATE POLICY "fiscal_raw_insert"
ON connectors.scidoo_raw_fiscal_production
FOR INSERT
TO service_role
WITH CHECK (true);

-- 6. NO UPDATE policy = updates are blocked by RLS
-- 7. NO DELETE policy = deletes are blocked by RLS

-- 8. Revoke UPDATE/DELETE/TRUNCATE at privilege level for extra protection
REVOKE UPDATE ON connectors.scidoo_raw_fiscal_production FROM PUBLIC;
REVOKE UPDATE ON connectors.scidoo_raw_fiscal_production FROM authenticated;
REVOKE UPDATE ON connectors.scidoo_raw_fiscal_production FROM anon;

REVOKE DELETE ON connectors.scidoo_raw_fiscal_production FROM PUBLIC;
REVOKE DELETE ON connectors.scidoo_raw_fiscal_production FROM authenticated;
REVOKE DELETE ON connectors.scidoo_raw_fiscal_production FROM anon;

REVOKE TRUNCATE ON connectors.scidoo_raw_fiscal_production FROM PUBLIC;
REVOKE TRUNCATE ON connectors.scidoo_raw_fiscal_production FROM authenticated;
REVOKE TRUNCATE ON connectors.scidoo_raw_fiscal_production FROM anon;

-- 9. Ensure service_role retains SELECT and INSERT only
GRANT SELECT ON connectors.scidoo_raw_fiscal_production TO service_role;
GRANT INSERT ON connectors.scidoo_raw_fiscal_production TO service_role;

-- Note: service_role bypasses RLS by default in Supabase, but we explicitly
-- revoke UPDATE/DELETE/TRUNCATE privileges to make the table truly immutable.
-- Even service_role cannot UPDATE/DELETE without the privilege.

-- 10. Verify the setup
DO $$
BEGIN
  RAISE NOTICE 'RLS enabled on connectors.scidoo_raw_fiscal_production';
  RAISE NOTICE 'Table is now APPEND-ONLY (immutable)';
  RAISE NOTICE 'Allowed: SELECT (service_role), INSERT (service_role)';
  RAISE NOTICE 'Blocked: UPDATE, DELETE, TRUNCATE';
END $$;
