-- ===========================================
-- DEV SUPER ADMIN USER
-- Creates a super admin collaborator for development/testing
-- ===========================================

-- Changed 'status' to 'is_active' to match actual database schema
-- Insert dev super admin into platform_collaborators
INSERT INTO platform_collaborators (
  email,
  name,
  role,
  is_active
) VALUES (
  'dev@hotelaccelerator.com',
  'Dev Super Admin',
  'super_admin',
  true
)
ON CONFLICT (email) DO UPDATE
SET
  role = 'super_admin',
  is_active = true,
  updated_at = now();

-- Verify insertion
SELECT id, email, name, role, is_active, created_at
FROM platform_collaborators
WHERE email = 'dev@hotelaccelerator.com';
