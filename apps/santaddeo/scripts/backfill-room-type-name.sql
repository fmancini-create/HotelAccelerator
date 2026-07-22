-- Backfill room_type_name in rms_daily_room_revenue
-- Uses: rms_daily_room_revenue.booking_id = bookings.pms_booking_id -> room_types.name
-- Note: booking_id in ETL table is TEXT, pms_booking_id in bookings is INTEGER

-- Step 1: Update room_type_name where we can find a match via bookings
UPDATE rms_daily_room_revenue rdr
SET room_type_name = rt.name
FROM bookings b
JOIN room_types rt ON rt.id = b.room_type_id
WHERE rdr.hotel_id = b.hotel_id
  AND rdr.booking_id = b.pms_booking_id::text
  AND rdr.room_type_name IS NULL;

-- Step 2: For records that still have NULL room_type_name after step 1,
-- try matching via scidoo_raw_bookings if that table has data
UPDATE rms_daily_room_revenue rdr
SET room_type_name = rt.name
FROM scidoo_raw_bookings srb
JOIN room_types rt ON rt.hotel_id = srb.hotel_id
  AND rt.pms_room_type_id::text = srb.room_type_code::text
WHERE rdr.hotel_id = srb.hotel_id
  AND rdr.booking_id = srb.scidoo_booking_id::text
  AND rdr.room_type_name IS NULL;

-- Step 3: Report results
SELECT 
  CASE WHEN room_type_name IS NULL THEN 'NULL' ELSE 'POPULATED' END as status,
  COUNT(*) as count
FROM rms_daily_room_revenue
WHERE hotel_id = '8dd3f8c1-284a-43f1-b24f-e6a9d428edca'
GROUP BY 1;
