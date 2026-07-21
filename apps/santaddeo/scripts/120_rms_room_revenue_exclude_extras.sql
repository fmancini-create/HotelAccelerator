-- 120_rms_room_revenue_exclude_extras.sql
--
-- Incident 01/06/2026: la card "Dati Anno in Corso" della dashboard
-- (Revenue Totale del mese) non coincideva con la tabella Obiettivi.
-- Esempio Villa I Barronci, maggio 2026:
--   dashboard = 200.724 EUR   |   obiettivi = 160.229 EUR   (delta ~40.500)
--
-- Causa: la view rms_daily_room_revenue (che alimenta Revenue/RevPAR/RevPOR/ADR
-- di tutta la dashboard via get_rms_revenue_summary e i servizi KPI) usava
-- b.price_per_night come "room_revenue". Ma per i booking Scidoo
-- price_per_night = total_price / notti e total_price INCLUDE GLI EXTRA
-- (F&B, spa, ecc.). Quindi la "revenue camera" era gonfiata dagli extra,
-- mentre la tabella Obiettivi (fonte di verita', allineata al PDF Scidoo)
-- conta SOLO la camera. Il tooltip della card promette "prezzi giornalieri
-- delle camere", quindi era un bug di correttezza, non una scelta di prodotto.
--
-- Fix (richiesto: Revenue Totale = SOLO CAMERA, su TUTTI gli hotel):
-- room_revenue per notte = camera pura spalmata sulle notti.
--   - net_price = totale camera della prenotazione (popolato dal connettore
--     Scidoo: net_price = total_price - extras_revenue). Usato quando presente.
--   - Fallback per i PMS che non valorizzano net_price (es. BRiG/Cavallino,
--     dove net_price e' NULL ma total_price e' GIA' solo-camera ed extras=0):
--     total_price - COALESCE(extras_revenue, 0).
-- Divido per (check_out_date - check_in_date), cioe' ESATTAMENTE il numero di
-- righe generate da generate_series sotto: cosi' la somma per-notte ricostruisce
-- il totale camera senza dipendere da number_of_nights.
--
-- Impatto verificato (maggio 2026):
--   Barronci 200.727 -> 159.696 (allineato a obiettivi 160.229, residuo ~0.3%
--                                 per differenze di filtro stato tra le pipeline)
--   Cavallino 115.761 -> 115.761 (INVARIATO: fallback non tocca BRiG)
--   Massabo    32.652 ->  32.647 (rimossi solo gli extra)

CREATE OR REPLACE VIEW rms_daily_room_revenue AS
SELECT
  b.hotel_id,
  d.date::date AS date,
  (
    COALESCE(b.net_price, b.total_price - COALESCE(b.extras_revenue, 0))
    / NULLIF((b.check_out_date - b.check_in_date), 0)
  )::numeric(10,2) AS room_revenue,
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
