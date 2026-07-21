-- Create pricing_variables table for Hotel Accelerator pricing algorithm
-- These variables represent all possible factors that can influence room pricing
-- SuperAdmin manages them globally; property admins will activate them per-hotel

CREATE TABLE IF NOT EXISTS pricing_variables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Variable identification
  variable_key TEXT NOT NULL UNIQUE,          -- machine-readable key e.g. "occupancy_rate", "day_of_week"
  label TEXT NOT NULL,                         -- human-readable label e.g. "Tasso di Occupazione"
  description TEXT,                            -- detailed description of the variable
  
  -- Categorization
  category TEXT NOT NULL DEFAULT 'general',    -- category grouping: 'demand', 'supply', 'market', 'temporal', 'external', 'general'
  
  -- Data type and constraints
  data_type TEXT NOT NULL DEFAULT 'numeric',   -- 'numeric', 'percentage', 'boolean', 'text', 'date'
  unit TEXT,                                    -- unit of measurement e.g. '%', 'EUR', 'days'
  min_value NUMERIC,                           -- optional minimum value
  max_value NUMERIC,                           -- optional maximum value
  default_value TEXT,                          -- default value (stored as text for flexibility)
  
  -- Weight/impact configuration
  weight_min NUMERIC DEFAULT 0,               -- minimum weight a property can assign
  weight_max NUMERIC DEFAULT 10,              -- maximum weight a property can assign
  default_weight NUMERIC DEFAULT 5,           -- suggested default weight
  
  -- Status
  is_active BOOLEAN NOT NULL DEFAULT true,    -- whether this variable is available for properties to use
  sort_order INTEGER NOT NULL DEFAULT 0,      -- display order
  
  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID
);

-- Index for common queries
CREATE INDEX IF NOT EXISTS idx_pricing_variables_active ON pricing_variables(is_active, sort_order);
CREATE INDEX IF NOT EXISTS idx_pricing_variables_category ON pricing_variables(category);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_pricing_variables_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_pricing_variables_updated_at ON pricing_variables;
CREATE TRIGGER trg_pricing_variables_updated_at
  BEFORE UPDATE ON pricing_variables
  FOR EACH ROW
  EXECUTE FUNCTION update_pricing_variables_updated_at();

-- Seed with common pricing variables
INSERT INTO pricing_variables (variable_key, label, description, category, data_type, unit, default_weight, sort_order)
VALUES
  ('occupancy_rate', 'Tasso di Occupazione', 'Percentuale di camere occupate rispetto al totale disponibile. Piu alto e il tasso, piu il prezzo tende a salire.', 'demand', 'percentage', '%', 8, 1),
  ('day_of_week', 'Giorno della Settimana', 'Il giorno della settimana influenza la domanda: weekend vs. giorni feriali.', 'temporal', 'text', NULL, 6, 2),
  ('season', 'Stagionalita', 'Periodo dell anno (alta/media/bassa stagione) che influenza la domanda base.', 'temporal', 'text', NULL, 7, 3),
  ('lead_time', 'Lead Time Prenotazione', 'Numero di giorni di anticipo con cui viene effettuata la prenotazione rispetto al check-in.', 'demand', 'numeric', 'giorni', 5, 4),
  ('length_of_stay', 'Durata del Soggiorno', 'Numero di notti prenotate. Soggiorni piu lunghi possono avere sconti progressivi.', 'demand', 'numeric', 'notti', 4, 5),
  ('competitor_price', 'Prezzo Competitor', 'Prezzo medio dei competitor diretti nella stessa destinazione e categoria.', 'market', 'numeric', 'EUR', 6, 6),
  ('events_local', 'Eventi Locali', 'Presenza di eventi, fiere, concerti o manifestazioni che aumentano la domanda nella zona.', 'external', 'boolean', NULL, 7, 7),
  ('weather_forecast', 'Previsioni Meteo', 'Condizioni meteorologiche previste che possono influenzare la domanda turistica.', 'external', 'text', NULL, 3, 8),
  ('cancellation_rate', 'Tasso di Cancellazione', 'Percentuale di prenotazioni cancellate nel periodo. Un tasso alto puo richiedere strategie compensative.', 'demand', 'percentage', '%', 5, 9),
  ('adr_current', 'ADR Corrente', 'Average Daily Rate corrente della struttura, usato come baseline per gli aggiustamenti.', 'supply', 'numeric', 'EUR', 7, 10),
  ('revpar_target', 'RevPAR Target', 'Revenue per Available Room target impostato come obiettivo dalla struttura.', 'supply', 'numeric', 'EUR', 6, 11),
  ('booking_pace', 'Ritmo Prenotazioni (Pickup)', 'Velocita con cui le prenotazioni vengono ricevute rispetto alla data di arrivo.', 'demand', 'numeric', 'prenotazioni/giorno', 7, 12),
  ('channel_mix', 'Mix Canali', 'Distribuzione delle prenotazioni per canale (diretto, OTA, tour operator). Il canale influenza la marginalita.', 'market', 'percentage', '%', 4, 13),
  ('flight_arrivals', 'Arrivi Voli Aerei', 'Volume di arrivi aerei nell aeroporto piu vicino, indicatore di domanda turistica.', 'external', 'numeric', 'voli/giorno', 3, 14),
  ('historical_price', 'Prezzo Storico', 'Prezzo venduto per la stessa data nell anno precedente, usato come riferimento.', 'market', 'numeric', 'EUR', 5, 15),
  ('room_type_demand', 'Domanda per Tipologia', 'Livello di domanda specifica per tipologia di camera (singola, doppia, suite, ecc.).', 'demand', 'numeric', NULL, 6, 16),
  ('minimum_stay', 'Soggiorno Minimo', 'Restrizione di soggiorno minimo che puo influenzare la disponibilita e il prezzo.', 'supply', 'numeric', 'notti', 3, 17),
  ('group_bookings', 'Prenotazioni Gruppo', 'Presenza di prenotazioni di gruppo che occupano blocchi di camere.', 'demand', 'boolean', NULL, 5, 18)
ON CONFLICT (variable_key) DO NOTHING;
