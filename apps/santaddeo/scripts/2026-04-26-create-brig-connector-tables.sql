-- ============================================================================
-- 2026-04-26: BRiG connector tables
-- ============================================================================
-- BRiG è un bridge unico verso 10+ PMS. Riusiamo `public.pms_integrations`
-- per la configurazione (pms_name='brig', integration_mode='api',
-- api_key=BrigApiKey, property_id=structureId, config.brig_sub_pms=PMS reale).
-- Aggiungiamo solo la tabella raw nello schema `connectors`, replicando il
-- pattern già rodato per Scidoo (vedi connectors.scidoo_raw_bookings).
--
-- Idempotente: tutto IF NOT EXISTS / DROP IF EXISTS.
-- ============================================================================

-- 1. Schema connectors deve esistere (no-op se già presente)
CREATE SCHEMA IF NOT EXISTS connectors;
GRANT USAGE ON SCHEMA connectors TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA connectors
  GRANT ALL ON TABLES TO anon, authenticated, service_role;

-- 2. Raw bookings da BRiG (analoga a connectors.scidoo_raw_bookings)
--
-- Note sui campi:
-- - brig_reservation_id   = `_id` Brig (univoco globale, mongo-style)
-- - reservation_code      = `reservationCode` (es. "34-XX")
-- - parent_code           = `reservationParentCode` (header gruppo)
-- - status_raw            = `originalStatus` Brig ("Prenotata", "Annullata"...)
-- - status                = stato canonicale Brig (1=Prenotata, 2=Confermata,
--                           3=CheckIn, 4=Annullata, 5=CheckOut, 6=NoShow)
-- - room_code             = `roomCode` (mappabile via pms_rms_mappings)
-- - channel_code          = `channelCode` (canale di vendita)
-- - market_code           = `marketCode`
-- - amount                = `amount` (totale prenotazione, NUMERIC con 4 decimali)
-- - amount_detail         = stringa "prezzo1::prezzo2::..." con valori x100
--                           (parsing applicativo in lib/connectors/brig/types.ts)
-- - raw_data              = payload completo Brig per fallback futuri
CREATE TABLE IF NOT EXISTS connectors.brig_raw_bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id UUID NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
  pms_integration_id UUID NOT NULL REFERENCES public.pms_integrations(id) ON DELETE CASCADE,

  -- Identificativi Brig
  brig_reservation_id TEXT NOT NULL,
  reservation_code TEXT,
  parent_code TEXT,
  structure_id TEXT,

  -- Date e stato
  date_received TIMESTAMPTZ,
  checkin_date DATE,
  checkout_date DATE,
  status SMALLINT,
  status_raw TEXT,

  -- Codici PMS (per mapping)
  room_code TEXT,
  channel_code TEXT,
  market_code TEXT,
  rate_plan_code TEXT,

  -- Importi
  amount NUMERIC(14, 4),
  amount_detail TEXT,
  currency TEXT,

  -- Ospiti
  adults SMALLINT,
  children SMALLINT,
  quantity SMALLINT,

  -- Payload completo (per fallback / debug)
  raw_data JSONB NOT NULL,

  -- ETL metadata
  synced_at TIMESTAMPTZ DEFAULT now(),
  processed BOOLEAN DEFAULT false,
  processed_at TIMESTAMPTZ,
  processing_error TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  -- Una prenotazione Brig è univoca per (hotel, brig_reservation_id)
  CONSTRAINT unique_brig_reservation UNIQUE (hotel_id, brig_reservation_id)
);

-- 3. Indici per le query più frequenti dell'ETL e dell'health monitor
CREATE INDEX IF NOT EXISTS idx_brig_raw_bookings_hotel
  ON connectors.brig_raw_bookings(hotel_id);

CREATE INDEX IF NOT EXISTS idx_brig_raw_bookings_processed
  ON connectors.brig_raw_bookings(processed)
  WHERE processed = false; -- partial index: ETL legge solo i non processati

CREATE INDEX IF NOT EXISTS idx_brig_raw_bookings_dates
  ON connectors.brig_raw_bookings(checkin_date, checkout_date);

CREATE INDEX IF NOT EXISTS idx_brig_raw_bookings_synced
  ON connectors.brig_raw_bookings(synced_at DESC);

CREATE INDEX IF NOT EXISTS idx_brig_raw_bookings_status
  ON connectors.brig_raw_bookings(hotel_id, status);

CREATE INDEX IF NOT EXISTS idx_brig_raw_bookings_reservation_code
  ON connectors.brig_raw_bookings(hotel_id, reservation_code);

-- 4. Trigger updated_at (riusiamo la funzione comune se già esiste)
CREATE OR REPLACE FUNCTION connectors.set_updated_at_brig_raw_bookings()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_brig_raw_bookings_updated_at
  ON connectors.brig_raw_bookings;
CREATE TRIGGER trg_brig_raw_bookings_updated_at
  BEFORE UPDATE ON connectors.brig_raw_bookings
  FOR EACH ROW EXECUTE FUNCTION connectors.set_updated_at_brig_raw_bookings();

-- 5. Permissions (allineate al resto dello schema connectors)
GRANT ALL ON ALL TABLES IN SCHEMA connectors TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA connectors TO anon, authenticated, service_role;

-- ============================================================================
-- NOTA: NESSUNA modifica a `pms_integrations`.
-- Per attivare Brig su un hotel basterà inserire una riga del tipo:
--
--   INSERT INTO public.pms_integrations
--     (hotel_id, pms_name, integration_mode, api_key, property_id, is_active, config)
--   VALUES
--     ('<uuid hotel>', 'brig', 'api', '<BrigApiKey>', '<structureId>', true,
--      '{"brig_sub_pms":"bedzzle"}'::jsonb);
--
-- L'enum `pms_name` deve includere 'brig'. Se non lo include, andrà esteso in
-- una migration successiva (lib/types/pms.ts e relativo CHECK).
-- ============================================================================
