-- Seed standard K (pressure) variables for pricing algorithm
-- These variables are standard for all tenants and can be activated per-hotel
-- Categories: demand, supply, market, temporal, external, general

-- First, clear existing variables to avoid duplicates (optional - comment out if you want to keep existing)
-- DELETE FROM pricing_variables WHERE variable_key LIKE 'k_%' OR variable_key IN ('occupancy_rate', 'day_of_week', 'season', 'lead_time', 'length_of_stay', 'competitor_price', 'events_local', 'weather_forecast', 'cancellation_rate', 'booking_pace');

-- Insert standard K variables
INSERT INTO pricing_variables (variable_key, label, description, category, data_type, unit, default_weight, weight_min, weight_max, is_active, sort_order)
VALUES
-- DEMAND CATEGORY (pressione domanda)
('k_occupancy_rate', 'Tasso di Occupazione', 'Percentuale di camere occupate rispetto al totale disponibile. Maggiore occupazione = pressione al rialzo sui prezzi.', 'demand', 'percentage', '%', 8, 0, 10, false, 10),

('k_booking_pace', 'Velocita di Prenotazione (Booking Pace)', 'Ritmo con cui arrivano le prenotazioni rispetto alla media storica. Pace elevato indica alta domanda.', 'demand', 'numeric', 'booking/giorno', 7, 0, 10, false, 20),

('k_lead_time', 'Lead Time Medio', 'Giorni medi di anticipo delle prenotazioni. Lead time breve puo indicare alta domanda last-minute.', 'demand', 'numeric', 'giorni', 5, 0, 10, false, 30),

('k_cancellation_rate', 'Tasso di Cancellazione', 'Percentuale di prenotazioni cancellate. Alto tasso richiede strategie di overbooking o repricing.', 'demand', 'percentage', '%', 4, 0, 10, false, 40),

('k_pickup_trend', 'Trend Pickup', 'Andamento delle nuove prenotazioni vs cancellazioni nelle ultime 24-72 ore.', 'demand', 'numeric', 'delta', 6, 0, 10, false, 50),

('k_length_of_stay', 'Durata Media Soggiorno', 'Numero medio di notti prenotate. Soggiorni lunghi possono indicare clientela leisure.', 'demand', 'numeric', 'notti', 4, 0, 10, false, 60),

-- TEMPORAL CATEGORY (pressione temporale)
('k_day_of_week', 'Giorno della Settimana', 'Pressione basata sul giorno: weekend vs giorni feriali. Venerdi-Sabato tipicamente piu alti.', 'temporal', 'text', NULL, 6, 0, 10, false, 100),

('k_season_high', 'Alta Stagione', 'Periodo di massima domanda stagionale (es. estate per mare, inverno per montagna).', 'temporal', 'boolean', NULL, 8, 0, 10, false, 110),

('k_season_mid', 'Media Stagione', 'Periodo di domanda intermedia (spalle di stagione, ponti, festivita minori).', 'temporal', 'boolean', NULL, 5, 0, 10, false, 120),

('k_season_low', 'Bassa Stagione', 'Periodo di bassa domanda dove servono strategie aggressive.', 'temporal', 'boolean', NULL, 3, 0, 10, false, 130),

('k_last_minute', 'Pressione Last Minute', 'Giorni rimanenti alla data target. Sotto soglia attiva pricing last-minute.', 'temporal', 'numeric', 'giorni', 6, 0, 10, false, 140),

('k_holiday_national', 'Festivita Nazionali', 'Presenza di festivita nazionali (Pasqua, Natale, Ferragosto, Ponte).', 'temporal', 'boolean', NULL, 7, 0, 10, false, 150),

-- MARKET CATEGORY (pressione mercato)
('k_competitor_price', 'Prezzo Competitor', 'Prezzo medio dei competitor diretti. Se siamo sotto, possibile margine di rialzo.', 'market', 'numeric', 'EUR', 6, 0, 10, false, 200),

('k_competitor_occupancy', 'Occupazione Competitor', 'Livello di occupazione stimato dei competitor. Alta occupazione competitor = opportunita.', 'market', 'percentage', '%', 5, 0, 10, false, 210),

('k_adr_vs_compset', 'ADR vs CompSet', 'Differenza percentuale tra il nostro ADR e quello del competitive set.', 'market', 'percentage', '%', 5, 0, 10, false, 220),

-- EXTERNAL CATEGORY (pressione esterna)
('k_events_local', 'Eventi Locali', 'Presenza di eventi, fiere, concerti nella zona che aumentano la domanda.', 'external', 'boolean', NULL, 8, 0, 10, false, 300),

('k_events_major', 'Grandi Eventi', 'Eventi di portata nazionale/internazionale (Salone del Mobile, GP F1, Olimpiadi).', 'external', 'boolean', NULL, 9, 0, 10, false, 310),

('k_weather_positive', 'Meteo Favorevole', 'Previsioni meteo positive che aumentano la domanda turistica.', 'external', 'boolean', NULL, 4, 0, 10, false, 320),

('k_weather_negative', 'Meteo Sfavorevole', 'Previsioni meteo negative che riducono la domanda.', 'external', 'boolean', NULL, 3, 0, 10, false, 330),

('k_flight_arrivals', 'Arrivi Aerei', 'Volume di arrivi aerei previsti negli aeroporti locali.', 'external', 'numeric', 'passeggeri', 5, 0, 10, false, 340),

-- SUPPLY CATEGORY (pressione offerta)
('k_rooms_available', 'Camere Disponibili', 'Numero di camere ancora disponibili per la data. Scarsita = pressione al rialzo.', 'supply', 'numeric', 'camere', 7, 0, 10, false, 400),

('k_inventory_pressure', 'Pressione Inventario', 'Rapporto tra camere vendute e inventario totale. Alta pressione = rialzo.', 'supply', 'percentage', '%', 7, 0, 10, false, 410),

('k_overbooking_buffer', 'Buffer Overbooking', 'Margine di sicurezza per gestire no-show e cancellazioni last-minute.', 'supply', 'percentage', '%', 3, 0, 10, false, 420)

ON CONFLICT (variable_key) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  data_type = EXCLUDED.data_type,
  unit = EXCLUDED.unit,
  default_weight = EXCLUDED.default_weight,
  weight_min = EXCLUDED.weight_min,
  weight_max = EXCLUDED.weight_max,
  sort_order = EXCLUDED.sort_order,
  updated_at = NOW();

-- Verify insertion
SELECT COUNT(*) as total_k_variables FROM pricing_variables WHERE variable_key LIKE 'k_%';
