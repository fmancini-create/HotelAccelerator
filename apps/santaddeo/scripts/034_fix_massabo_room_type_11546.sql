-- Fix: Reset processed flag for CAMERA MASTER DELUXE (scidoo room type 11546)
-- for Tenuta Massabò so the ETL will process it into rms_availability_daily
-- The ETL previously may have skipped it or marked it processed with errors.

UPDATE scidoo_raw_availability 
SET processed = false, processing_error = NULL 
WHERE hotel_id = '7e3ccbd4-f7f1-464c-ba6d-6e806cc3f3a9' 
  AND scidoo_room_type_id = '11546';

-- Also reset for any other hotels that might have room types stuck as processed with errors
UPDATE scidoo_raw_availability 
SET processed = false, processing_error = NULL 
WHERE processing_error IS NOT NULL 
  AND processing_error != '';
