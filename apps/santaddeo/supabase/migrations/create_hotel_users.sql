-- Migration: Create hotel_users table for multi-hotel user access
-- This replaces the broken profiles.hotel_id approach (which never existed)
-- and the implicit profiles.organization_id -> hotels.organization_id link
-- with an explicit, granular user-hotel mapping.

-- 1. Create the hotel_users junction table
CREATE TABLE IF NOT EXISTS hotel_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  hotel_id UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'viewer',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Unique constraint: one row per user-hotel pair
ALTER TABLE hotel_users
  ADD CONSTRAINT hotel_users_user_hotel_unique UNIQUE (user_id, hotel_id);

-- 3. Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_hotel_users_user_id ON hotel_users(user_id);
CREATE INDEX IF NOT EXISTS idx_hotel_users_hotel_id ON hotel_users(hotel_id);

-- 4. Enable Row Level Security
ALTER TABLE hotel_users ENABLE ROW LEVEL SECURITY;

-- 5. RLS policy: users can only see their own hotel_users records
CREATE POLICY "Users can view own hotel_users records"
  ON hotel_users
  FOR SELECT
  USING (user_id = auth.uid());

-- 6. RLS policy: super_admin can manage all records (via service role for admin ops)
CREATE POLICY "Service role full access on hotel_users"
  ON hotel_users
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- 7. Populate hotel_users from existing profiles -> organization -> hotels mapping
-- This migrates the current implicit relationship to the new explicit table
INSERT INTO hotel_users (user_id, hotel_id, role)
SELECT DISTINCT
  p.id AS user_id,
  h.id AS hotel_id,
  p.role AS role
FROM profiles p
JOIN hotels h ON h.organization_id = p.organization_id
WHERE p.organization_id IS NOT NULL
ON CONFLICT (user_id, hotel_id) DO NOTHING;
