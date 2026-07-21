-- Backfill: resolve bookings.room_type_id via rate fallback
-- 
-- Problem: Scidoo sends room_type_id=0 for ~64% of bookings.
-- Solution: use the booking's rate_code to look up the room_type via
--   scidoo_raw_rates.scidoo_rate_id -> .room_type_id -> room_types.scidoo_room_type_id -> room_types.id
--
-- This is a ONE-TIME fix for existing data. Going forward, the ETL
-- (scidoo-sync-service.ts + bookings-processor.ts) uses the same fallback.

-- Preview: show how many bookings will be fixed
SELECT 
  h.name AS hotel,
  COUNT(*) AS bookings_to_fix
FROM bookings b
JOIN hotels h ON h.id = b.hotel_id
JOIN scidoo_raw_bookings srb ON srb.hotel_id = b.hotel_id 
  AND srb.pms_booking_id = b.pms_booking_id
JOIN scidoo_raw_rates srr ON srr.hotel_id = b.hotel_id 
  AND srr.scidoo_rate_id = srb.rate_code
JOIN room_types rt ON rt.hotel_id = b.hotel_id 
  AND rt.scidoo_room_type_id = CAST(srr.room_type_id AS text)
WHERE b.room_type_id IS NULL
  AND srb.rate_code IS NOT NULL
GROUP BY h.name
ORDER BY h.name;

-- Execute: update bookings.room_type_id using rate-based fallback
UPDATE bookings b
SET room_type_id = rt.id,
    updated_at = NOW()
FROM scidoo_raw_bookings srb
JOIN scidoo_raw_rates srr ON srr.hotel_id = srb.hotel_id 
  AND srr.scidoo_rate_id = srb.rate_code
JOIN room_types rt ON rt.hotel_id = srb.hotel_id 
  AND rt.scidoo_room_type_id = CAST(srr.room_type_id AS text)
WHERE b.hotel_id = srb.hotel_id
  AND b.pms_booking_id = srb.pms_booking_id
  AND b.room_type_id IS NULL
  AND srb.rate_code IS NOT NULL;
