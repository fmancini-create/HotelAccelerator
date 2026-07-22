-- Dashboard KPI visibility configs per hotel
CREATE TABLE IF NOT EXISTS dashboard_kpi_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  kpi_key text NOT NULL,
  label text NOT NULL,
  description text,
  is_enabled boolean NOT NULL DEFAULT true,
  display_order integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(hotel_id, kpi_key)
);

CREATE INDEX IF NOT EXISTS idx_dashboard_kpi_configs_hotel ON dashboard_kpi_configs(hotel_id);
ALTER TABLE dashboard_kpi_configs ENABLE ROW LEVEL SECURITY;

-- Allow superadmin full access, hotel members read-only
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'superadmin_all_kpi' AND tablename = 'dashboard_kpi_configs') THEN
    CREATE POLICY "superadmin_all_kpi" ON dashboard_kpi_configs FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Seed 9 KPI per la sezione overview (Camere + Produzione)
INSERT INTO dashboard_kpi_configs (hotel_id, kpi_key, label, description, is_enabled, display_order)
SELECT h.id, kpi.key, kpi.label, kpi.description, kpi.is_enabled, kpi.display_order
FROM hotels h
CROSS JOIN (VALUES
  ('rooms_available',        'Camere Disponibili',         'Camere libere per la data selezionata',                    true,  1),
  ('rooms_occupied',         'Camere Occupate',            'Camere occupate per la data selezionata',                   true,  2),
  ('out_of_service',         'Fuori Servizio',             'Camere fuori servizio per la data selezionata',             true,  3),
  ('fiscal_production_month','Produzione Fiscale Mese',    'Produzione fiscale IVA inclusa dal PMS per il mese',        false, 4),
  ('fiscal_production_today','Produzione Fiscale Oggi',    'Produzione fiscale IVA inclusa dal PMS per la data',        false, 5),
  ('room_production_today',  'Produzione Camere Oggi',     'Somma daily_price camere occupate nella data',              true,  6),
  ('arrivals_today',         'Arrivi e Partenze',          'Arrivi e partenze per la data selezionata',                 true,  7),
  ('bookings_received',      'Prenotazioni Ricevute',      'Prenotazioni ricevute oggi',                               true,  8),
  ('cancellations_received', 'Cancellazioni Ricevute',     'Cancellazioni ricevute oggi',                              true,  9)
) AS kpi(key, label, description, is_enabled, display_order)
ON CONFLICT (hotel_id, kpi_key) DO NOTHING;

-- Seed 11 KPI per la sezione "Dati Anno in Corso" (MetricsCurrent)
INSERT INTO dashboard_kpi_configs (hotel_id, kpi_key, label, description, is_enabled, display_order)
SELECT h.id, kpi.key, kpi.label, kpi.description, kpi.is_enabled, kpi.display_order
FROM hotels h
CROSS JOIN (VALUES
  ('metrics_total_revenue',       'Revenue Totale',          'Somma ricavi prenotazioni attive nel periodo',              true,  10),
  ('metrics_direct_revenue',      'Revenue Diretto',         'Ricavi da prenotazioni dirette (non OTA)',                  true,  11),
  ('metrics_intermediated_revenue','Rev. Intermediato',       'Ricavi da OTA (Booking.com, Expedia, etc.)',               true,  12),
  ('metrics_room_nights',         'Room/Nights',             'Notti camera vendute nel periodo',                          true,  13),
  ('metrics_revpor',              'RevPOR',                  'Revenue Per Occupied Room',                                 true,  14),
  ('metrics_revpar',              'RevPAR',                  'Revenue Per Available Room',                                true,  15),
  ('metrics_bookings',            'Prenotazioni',            'Prenotazioni attive nel periodo',                           true,  16),
  ('metrics_cancellations',       'Cancellazioni',           'Cancellazioni nel periodo',                                 true,  17),
  ('metrics_cancellation_pct',    '% Cancellazioni',         'Percentuale cancellazioni rispetto al totale',              true,  18),
  ('metrics_pickup_bookings',     'Pick Up Pren.',           'Media giorni anticipo prenotazioni',                        true,  19),
  ('metrics_pickup_cancellations','Pick Up Canc.',           'Media giorni anticipo cancellazioni',                       true,  20)
) AS kpi(key, label, description, is_enabled, display_order)
ON CONFLICT (hotel_id, kpi_key) DO NOTHING;
