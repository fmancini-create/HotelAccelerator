-- Vista ponte: la UI interroga rms_bookings in modo PMS-agnostico
-- Per Villa I Barronci legge da scidoo_raw_bookings
-- Espone colonne canoniche RMS per la UI

DROP VIEW IF EXISTS public.rms_bookings;

CREATE OR REPLACE VIEW public.rms_bookings AS
SELECT 
  id,
  hotel_id,
  scidoo_booking_id AS booking_code,
  scidoo_reservation_number AS pms_booking_id,
  -- Date canoniche
  checkin_date,
  checkout_date,
  booking_date AS booking_created_at,
  -- Status
  status,
  -- Source data per backward compatibility (tutto il payload JSON)
  raw_data AS source_data,
  -- Metadata
  synced_at,
  created_at,
  updated_at
FROM connectors.scidoo_raw_bookings;

-- Grant permissions
GRANT SELECT ON public.rms_bookings TO authenticated;
GRANT SELECT ON public.rms_bookings TO anon;

COMMENT ON VIEW public.rms_bookings IS 'Vista RMS agnostica che espone prenotazioni da connectors.scidoo_raw_bookings';
