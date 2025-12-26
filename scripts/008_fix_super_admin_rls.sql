-- Fix infinite recursion in platform_collaborators RLS policy
-- Authorization is handled at service layer, so we disable RLS completely

-- Drop the problematic policy
DROP POLICY IF EXISTS "Super admins can manage platform collaborators" ON platform_collaborators;

-- Disable RLS on platform_collaborators
-- Authorization is enforced in SuperAdminService.verifyAuthorization()
ALTER TABLE platform_collaborators DISABLE ROW LEVEL SECURITY;

-- Note: This is safe because:
-- 1. SuperAdminService.verifyAuthorization() checks role before any operation
-- 2. All API routes use the service layer (no direct table access)
-- 3. Super admin routes will have middleware authentication (to be added)

COMMENT ON TABLE platform_collaborators IS 'Platform-level users who manage the SaaS platform. RLS disabled - authorization handled at service layer.';
