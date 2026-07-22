-- Incident 01/06/2026 (performance): /api/dati/analytics impiegava ~3s perche'
-- il breakdown mensile faceva 24 RPC get_rms_revenue_summary (2 per mese x 12).
-- Questa RPC restituisce TUTTI i mesi in UNA sola chiamata, con la STESSA
-- identica aggregazione di get_rms_revenue_summary (SUM(room_revenue) e
-- COUNT(*) FILTER (room_revenue > 0)) ma raggruppata per mese.
-- => 24 round-trip diventano 2 (anno corrente + anno precedente).
-- Numeri garantiti identici: stessa view (rms_daily_room_revenue), stesso filtro
-- data, stessa logica di somma e conteggio notti.

CREATE OR REPLACE FUNCTION public.get_rms_revenue_monthly(
  p_hotel_id uuid,
  p_start_date date,
  p_end_date date
)
RETURNS TABLE(month integer, total_revenue numeric, room_nights bigint)
LANGUAGE sql
STABLE
AS $function$
  SELECT
    EXTRACT(MONTH FROM date)::integer              AS month,
    COALESCE(SUM(room_revenue), 0)::numeric        AS total_revenue,
    COUNT(*) FILTER (WHERE room_revenue > 0)::bigint AS room_nights
  FROM rms_daily_room_revenue
  WHERE hotel_id = p_hotel_id
    AND date >= p_start_date
    AND date <= p_end_date
  GROUP BY EXTRACT(MONTH FROM date);
$function$;
