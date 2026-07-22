-- Fix RLS policies on revenue_objectives.
--
-- Background
-- ----------
-- `revenue_objectives` had RLS enabled but only a "service_role full access" policy.
-- Any API route using the anon+cookie client (i.e. role = `authenticated`)
-- received an empty row-set because no SELECT policy matched.
-- Symptom: `/app/dati/objectives` showed all monthly "Obiettivi" as 0 even
-- though the DB held correct values (updated 2026-03-20).
--
-- Fix
-- ---
-- Add two policies matching the convention already used on sibling tables
-- (e.g. pricing_algo_params), scoping rows by the hotel membership helper.
--
-- Safety
-- ------
-- Uses DROP POLICY IF EXISTS to make the script idempotent and safe to
-- re-run. No data is modified.

-- Readable by users who belong to the hotel's tenant.
DROP POLICY IF EXISTS "Users can view their hotel revenue objectives" ON revenue_objectives;
CREATE POLICY "Users can view their hotel revenue objectives"
ON revenue_objectives
FOR SELECT
TO authenticated
USING (hotel_id IN (SELECT get_user_hotel_ids()));

-- Writable (INSERT/UPDATE/DELETE) by users who belong to the hotel's tenant.
-- Using FOR ALL so the PUT handler in app/api/dati/objectives/route.ts works
-- without needing a service-role bypass.
DROP POLICY IF EXISTS "Users can manage their hotel revenue objectives" ON revenue_objectives;
CREATE POLICY "Users can manage their hotel revenue objectives"
ON revenue_objectives
FOR ALL
TO authenticated
USING (hotel_id IN (SELECT get_user_hotel_ids()))
WITH CHECK (hotel_id IN (SELECT get_user_hotel_ids()));
