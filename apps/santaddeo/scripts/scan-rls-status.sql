-- =====================================================
-- DIAGNOSTIC: Scan all public tables for RLS status
-- Run this on the PRODUCTION database to get the full report
-- DO NOT modify any tables or policies -- read-only scan
-- =====================================================

-- 1. All public tables with RLS status
SELECT 
  t.tablename AS table_name,
  t.rowsecurity AS rls_enabled,
  COALESCE(
    (SELECT COUNT(*) FROM pg_policies p 
     WHERE p.schemaname = 'public' AND p.tablename = t.tablename),
    0
  ) AS policy_count,
  COALESCE(
    (SELECT COUNT(*) FROM pg_policies p 
     WHERE p.schemaname = 'public' AND p.tablename = t.tablename
     AND (
       p.qual::text ILIKE '%hotel_id%' 
       OR p.qual::text ILIKE '%organization_id%'
       OR p.qual::text ILIKE '%get_user_hotel_ids%'
     )),
    0
  ) AS hotel_policy_count,
  CASE 
    WHEN t.rowsecurity = true AND EXISTS (
      SELECT 1 FROM pg_policies p 
      WHERE p.schemaname = 'public' AND p.tablename = t.tablename
      AND (
        p.qual::text ILIKE '%hotel_id%' 
        OR p.qual::text ILIKE '%organization_id%'
        OR p.qual::text ILIKE '%get_user_hotel_ids%'
        OR p.qual::text ILIKE '%auth.uid()%'
        OR p.qual::text ILIKE '%user_id%'
      )
    ) THEN 'SAFE'
    WHEN t.rowsecurity = true THEN 'RLS_ON_NO_FILTER'
    ELSE 'NO_RLS'
  END AS status
FROM pg_tables t
WHERE t.schemaname = 'public'
ORDER BY 
  CASE 
    WHEN t.rowsecurity = false THEN 0
    WHEN t.rowsecurity = true AND NOT EXISTS (
      SELECT 1 FROM pg_policies p 
      WHERE p.schemaname = 'public' AND p.tablename = t.tablename
      AND (p.qual::text ILIKE '%hotel_id%' OR p.qual::text ILIKE '%organization_id%' OR p.qual::text ILIKE '%get_user_hotel_ids%')
    ) THEN 1
    ELSE 2
  END,
  t.tablename;

-- 2. Tables used by the 3 guarded API routes - specific check
SELECT 
  t.tablename AS table_name,
  t.rowsecurity AS rls_enabled,
  EXISTS (
    SELECT 1 FROM pg_policies p 
    WHERE p.schemaname = 'public' AND p.tablename = t.tablename
    AND (
      p.qual::text ILIKE '%hotel_id%' 
      OR p.qual::text ILIKE '%organization_id%'
      OR p.qual::text ILIKE '%get_user_hotel_ids%'
      OR p.qual::text ILIKE '%auth.uid()%'
    )
  ) AS has_hotel_policy,
  t.tablename IN (
    'pms_integrations', 'hotels', 'daily_availability', 
    'rms_daily_room_revenue', 'bookings',
    'room_types', 'scidoo_raw_bookings',
    'rates', 'rms_availability_daily'
  ) AS used_by_guarded_routes
FROM pg_tables t
WHERE t.schemaname = 'public'
AND t.tablename IN (
  'pms_integrations', 'hotels', 'daily_availability', 
  'rms_daily_room_revenue', 'bookings',
  'room_types', 'scidoo_raw_bookings',
  'rates', 'rms_availability_daily'
)
ORDER BY t.tablename;
