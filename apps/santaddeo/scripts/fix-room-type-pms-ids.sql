-- Fix: populate pms_room_type_id from scidoo_room_type_id for all hotels
-- where pms_room_type_id is null but scidoo_room_type_id is set.
-- This ensures the PMSImportService room type mapping works for every hotel.

-- Show current state before fix
SELECT name, hotel_id, pms_room_type_id, scidoo_room_type_id 
FROM room_types 
WHERE pms_room_type_id IS NULL AND scidoo_room_type_id IS NOT NULL
ORDER BY hotel_id, name;

-- Apply fix: copy scidoo_room_type_id -> pms_room_type_id
UPDATE room_types 
SET pms_room_type_id = scidoo_room_type_id 
WHERE pms_room_type_id IS NULL 
  AND scidoo_room_type_id IS NOT NULL;

-- Verify fix
SELECT hotel_id, name, pms_room_type_id, scidoo_room_type_id 
FROM room_types 
ORDER BY hotel_id, name;
