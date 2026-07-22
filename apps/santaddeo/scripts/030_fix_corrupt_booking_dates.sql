-- ============================================================
-- FIX: Nullify corrupt booking_date values where booking_date == check_in_date
-- for Podere Casanova (Bedzzle/GSheets hotel).
-- 
-- The bug: normalizeDate() couldn't parse Bedzzle's BK_DATE format,
-- so the fallback silently used check_in_date as booking_date.
-- All 120 rows have booking_date == check_in_date (100% match = impossible).
--
-- After this UPDATE, the next GSheets sync will re-populate booking_date
-- with the correctly parsed BK_DATE from the spreadsheet.
-- ============================================================

-- 1. Verify before: count affected rows
SELECT 'BEFORE FIX' as phase,
  count(*) as total,
  count(*) FILTER (WHERE booking_date = check_in_date) as corrupt_rows,
  count(*) FILTER (WHERE booking_date IS NULL) as null_booking_date
FROM bookings
WHERE hotel_id = 'afedce7a-f8c7-48c1-9eae-4e7bae1c2dd6';

-- 2. SET booking_date = NULL and booking_datetime = NULL for corrupt rows
UPDATE bookings
SET 
  booking_date = NULL,
  booking_datetime = NULL
WHERE hotel_id = 'afedce7a-f8c7-48c1-9eae-4e7bae1c2dd6'
  AND booking_date = check_in_date;

-- 3. Verify after
SELECT 'AFTER FIX' as phase,
  count(*) as total,
  count(*) FILTER (WHERE booking_date = check_in_date) as corrupt_rows,
  count(*) FILTER (WHERE booking_date IS NULL) as null_booking_date
FROM bookings
WHERE hotel_id = 'afedce7a-f8c7-48c1-9eae-4e7bae1c2dd6';
