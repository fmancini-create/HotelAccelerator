-- =============================================================================
-- Fix: hotel_integrations RLS - allow users to manage their own hotel integrations
--
-- Problem: The hotel_integrations table only has super_admin_all_access policy.
-- Regular users (property_admin, staff) cannot read or write their hotel's
-- integration settings, causing the "data not saving" bug.
--
-- Solution: Add policies allowing users to manage integrations for hotels they
-- have access to via hotel_users table.
-- =============================================================================

-- Drop existing policies if any (except super_admin which we keep)
DROP POLICY IF EXISTS "users_can_read_own_hotel_integrations" ON public.hotel_integrations;
DROP POLICY IF EXISTS "users_can_write_own_hotel_integrations" ON public.hotel_integrations;

-- Policy: Users can READ integrations for hotels they have access to
CREATE POLICY "users_can_read_own_hotel_integrations" ON public.hotel_integrations
FOR SELECT TO authenticated
USING (
  hotel_id IN (
    SELECT hu.hotel_id 
    FROM hotel_users hu 
    WHERE hu.user_id = auth.uid()
  )
);

-- Policy: Users can INSERT/UPDATE integrations for hotels they have access to
-- (property_admin or higher roles typically, but we allow any hotel_user for simplicity)
CREATE POLICY "users_can_write_own_hotel_integrations" ON public.hotel_integrations
FOR ALL TO authenticated
USING (
  hotel_id IN (
    SELECT hu.hotel_id 
    FROM hotel_users hu 
    WHERE hu.user_id = auth.uid()
  )
)
WITH CHECK (
  hotel_id IN (
    SELECT hu.hotel_id 
    FROM hotel_users hu 
    WHERE hu.user_id = auth.uid()
  )
);
