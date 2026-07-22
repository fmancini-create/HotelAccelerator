-- Fix RLS policies for hotel_events
-- Current policies only check hotel_users, but some users are associated via organization_id
-- Add alternative policies that also check organization membership

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "hotel_events_select" ON hotel_events;
DROP POLICY IF EXISTS "hotel_events_insert" ON hotel_events;
DROP POLICY IF EXISTS "hotel_events_update" ON hotel_events;
DROP POLICY IF EXISTS "hotel_events_delete" ON hotel_events;

-- Create new policies that check BOTH hotel_users AND organization membership
CREATE POLICY "hotel_events_select" ON hotel_events
  FOR SELECT USING (
    hotel_id IN (SELECT hotel_id FROM hotel_users WHERE user_id = auth.uid())
    OR
    hotel_id IN (
      SELECT h.id FROM hotels h
      JOIN profiles p ON p.organization_id = h.organization_id
      WHERE p.id = auth.uid()
    )
  );

CREATE POLICY "hotel_events_insert" ON hotel_events
  FOR INSERT WITH CHECK (
    hotel_id IN (SELECT hotel_id FROM hotel_users WHERE user_id = auth.uid())
    OR
    hotel_id IN (
      SELECT h.id FROM hotels h
      JOIN profiles p ON p.organization_id = h.organization_id
      WHERE p.id = auth.uid()
    )
  );

CREATE POLICY "hotel_events_update" ON hotel_events
  FOR UPDATE USING (
    hotel_id IN (SELECT hotel_id FROM hotel_users WHERE user_id = auth.uid())
    OR
    hotel_id IN (
      SELECT h.id FROM hotels h
      JOIN profiles p ON p.organization_id = h.organization_id
      WHERE p.id = auth.uid()
    )
  );

CREATE POLICY "hotel_events_delete" ON hotel_events
  FOR DELETE USING (
    hotel_id IN (SELECT hotel_id FROM hotel_users WHERE user_id = auth.uid())
    OR
    hotel_id IN (
      SELECT h.id FROM hotels h
      JOIN profiles p ON p.organization_id = h.organization_id
      WHERE p.id = auth.uid()
    )
  );
