-- Fix Podere Casanova: nullify booking_date where it was wrongly set to check_in_date
-- The GSheets sync was failing to parse BK_DATE from the Bedzzle export,
-- so booking_date was silently set to check_in_date. 
-- Setting to NULL so the next sync with the fixed normalizeDate() will populate correctly.

-- Step 1: Check current state (diagnostic)
SELECT 'BEFORE FIX' as status,
  count(*) as total,
  count(*) FILTER (WHERE booking_date = check_in_date) as dates_match,
  count(*) FILTER (WHERE booking_date != check_in_date) as dates_differ,
  count(*) FILTER (WHERE booking_date IS NULL) as dates_null
FROM bookings
WHERE hotel_id = 'afedce7a-f8c7-48c1-9eae-4e7bae1c2dd6';

-- Step 2: Nullify booking_date where it equals check_in_date
-- This is safe because:
-- - booking_date IS nullable
-- - The next GSheets sync will re-populate with the correct BK_DATE from the sheet
-- - We only touch records where booking_date == check_in_date (the bug pattern)
UPDATE bookings
SET booking_date = NULL,
    booking_datetime = NULL
WHERE hotel_id = 'afedce7a-f8c7-48c1-9eae-4e7bae1c2dd6'
AND booking_date = check_in_date;

-- Step 3: Verify fix
SELECT 'AFTER FIX' as status,
  count(*) as total,
  count(*) FILTER (WHERE booking_date = check_in_date) as dates_match,
  count(*) FILTER (WHERE booking_date != check_in_date) as dates_differ,
  count(*) FILTER (WHERE booking_date IS NULL) as dates_null
FROM bookings
WHERE hotel_id = 'afedce7a-f8c7-48c1-9eae-4e7bae1c2dd6';
