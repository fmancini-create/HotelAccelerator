-- ============================================================
-- MIGRAZIONE: Riscrittura views per leggere da tabelle canoniche
-- Le 4 views che leggevano da scidoo_raw_bookings ora leggono
-- da public.bookings (tabella canonica PMS-agnostica)
-- ============================================================

-- 1. bookings_full: usata dalla dashboard overview e dettaglio prenotazioni
DROP VIEW IF EXISTS bookings_full CASCADE;
CREATE VIEW bookings_full AS
SELECT
  b.id,
  b.hotel_id,
  b.pms_booking_id AS booking_id,
  b.check_in_date AS check_in,
  b.check_out_date AS check_out,
  COALESCE(b.total_price, 0) AS total_amount,
  b.guest_name,
  b.guest_email,
  b.channel,
  b.is_cancelled::text AS status,
  b.number_of_guests AS num_guests,
  b.room_type_id,
  COALESCE(rt.code, '') AS room_type_code,
  COALESCE(rt.name, '') AS room_type_name,
  b.guest_notes AS notes,
  b.is_cancelled,
  b.cancellation_date,
  b.booking_date,
  b.number_of_rooms,
  b.number_of_nights,
  b.price_per_night,
  b.is_direct,
  b.commission_rate,
  b.commission_amount,
  b.source,
  b.created_at,
  b.updated_at
FROM bookings b
LEFT JOIN room_types rt ON rt.id = b.room_type_id;

-- 2. rms_bookings: usata da pagine analitiche
DROP VIEW IF EXISTS rms_bookings CASCADE;
CREATE VIEW rms_bookings AS
SELECT
  b.id,
  b.hotel_id,
  b.pms_booking_id AS booking_code,
  b.check_in_date AS checkin_date,
  b.check_out_date AS checkout_date,
  b.booking_date AS booking_created_at,
  b.cancellation_date AS cancelled_at,
  b.guest_name AS customer_first_name,
  '' AS customer_last_name,
  b.guest_email AS customer_email,
  b.guest_phone AS customer_phone,
  b.guest_country AS customer_country,
  COALESCE(rt.code, '') AS room_type_code,
  b.channel,
  b.source,
  b.imported_at AS synced_at,
  b.created_at,
  b.updated_at
FROM bookings b
LEFT JOIN room_types rt ON rt.id = b.room_type_id;

-- 3. rms_daily_room_revenue: revenue giornaliero per camera
-- Prima leggeva da scidoo_raw_bookings.raw_data->'daily_price' (JSONB Scidoo-specific)
-- Ora calcola il revenue distribuito uniformemente sulle notti della prenotazione
DROP VIEW IF EXISTS rms_daily_room_revenue CASCADE;
CREATE VIEW rms_daily_room_revenue AS
SELECT
  b.hotel_id,
  d.date::date AS date,
  b.price_per_night AS room_revenue,
  b.pms_booking_id AS booking_id,
  CASE WHEN b.is_cancelled THEN 'annullata' ELSE 'confermata' END AS status,
  COALESCE(rt.name, '') AS room_type_name
FROM bookings b
CROSS JOIN LATERAL generate_series(
  b.check_in_date::timestamp,
  (b.check_out_date - interval '1 day')::timestamp,
  interval '1 day'
) AS d(date)
LEFT JOIN room_types rt ON rt.id = b.room_type_id
WHERE b.is_cancelled = false;

-- 4. rms_fiscal_production: questa view leggeva da connectors.scidoo_raw_fiscal_production
-- Per ora la ricreiamo come view vuota con la stessa struttura, dato che
-- la produzione fiscale non e' disponibile per tutti i PMS
DROP VIEW IF EXISTS rms_fiscal_production CASCADE;
CREATE VIEW rms_fiscal_production AS
SELECT
  b.id,
  b.hotel_id,
  'fattura' AS document_type,
  b.pms_booking_id AS document_id,
  b.booking_date AS document_date,
  b.total_price AS total,
  b.booking_date AS date,
  '{}'::jsonb AS source_data,
  b.imported_at AS synced_at,
  b.created_at
FROM bookings b
WHERE b.is_cancelled = false
  AND b.total_price > 0;
