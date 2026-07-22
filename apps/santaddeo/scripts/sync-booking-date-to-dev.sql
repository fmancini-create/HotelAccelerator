-- ============================================
-- SCRIPT: Sincronizza booking_date su DB DEV
-- Eseguire manualmente su: dshdmkmhhbjractpvojp.supabase.co
-- ============================================

-- STEP 1: Verifica le colonne disponibili nelle tabelle
SELECT 'bookings' as tabella, column_name 
FROM information_schema.columns 
WHERE table_name = 'bookings' AND table_schema = 'public'
AND column_name IN ('id', 'pms_booking_id', 'booking_date', 'hotel_id')
UNION ALL
SELECT 'scidoo_raw_bookings' as tabella, column_name 
FROM information_schema.columns 
WHERE table_name = 'scidoo_raw_bookings' AND table_schema = 'public'
AND column_name IN ('scidoo_booking_id', 'pms_booking_id', 'booking_date', 'hotel_id');

-- STEP 2: Verifica quanti record hanno booking_date sbagliato
-- NOTA: Nel DB dev, usa il join appropriato in base alle colonne esistenti.
-- Se scidoo_raw_bookings ha pms_booking_id che corrisponde a bookings.id:
SELECT COUNT(*) as records_to_update
FROM bookings b
JOIN scidoo_raw_bookings s ON s.pms_booking_id = b.id::text AND s.hotel_id = b.hotel_id
WHERE b.booking_date IS NULL OR b.booking_date != s.booking_date::date;

-- STEP 3: FIX - Aggiorna booking_date (decommentare dopo verifica)
/*
UPDATE bookings b
SET 
  booking_date = s.booking_date::date,
  booking_datetime = s.booking_date,
  updated_at = NOW()
FROM scidoo_raw_bookings s
WHERE s.pms_booking_id = b.id::text
AND s.hotel_id = b.hotel_id
AND (b.booking_date IS NULL OR b.booking_date != s.booking_date::date);
*/

-- STEP 4: Verifica risultato
SELECT 
  h.name as hotel,
  EXTRACT(YEAR FROM b.check_in_date) as anno_checkin,
  COUNT(*) as count,
  MIN(b.booking_date) as min_booking_date,
  MAX(b.booking_date) as max_booking_date
FROM bookings b
JOIN hotels h ON h.id = b.hotel_id
WHERE EXTRACT(YEAR FROM b.check_in_date) >= 2024
GROUP BY h.name, EXTRACT(YEAR FROM b.check_in_date)
ORDER BY h.name, anno_checkin;
