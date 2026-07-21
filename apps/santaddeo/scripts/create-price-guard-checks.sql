-- price_guard_checks: log dei controlli Guard
-- Ogni riga = una prenotazione confrontata con il prezzo storicizzato
-- Il prezzo atteso e' l'ultimo valore inviato/noto con timestamp <= booking_timestamp

CREATE TABLE IF NOT EXISTS price_guard_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id UUID NOT NULL,
  booking_id TEXT,
  booking_date TIMESTAMPTZ NOT NULL,
  checkin_date DATE NOT NULL,
  checkout_date DATE,
  room_type_id UUID,
  rate_id UUID,
  occupancy INT NOT NULL DEFAULT 2,
  booked_price NUMERIC NOT NULL,
  expected_price NUMERIC,
  difference_pct NUMERIC,
  tolerance_pct NUMERIC NOT NULL DEFAULT 5.0,
  result TEXT NOT NULL CHECK (result IN ('ok', 'warning', 'mismatch')),
  notes TEXT,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_price_guard_checks_hotel
  ON price_guard_checks(hotel_id, checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_price_guard_checks_result
  ON price_guard_checks(hotel_id, result);
CREATE INDEX IF NOT EXISTS idx_price_guard_checks_checkin
  ON price_guard_checks(hotel_id, checkin_date);

-- RLS
ALTER TABLE price_guard_checks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access price_guard_checks"
  ON price_guard_checks FOR ALL
  USING (true) WITH CHECK (true);
