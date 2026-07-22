-- 22/05/2026: soglia minima variazione tariffaria per hotel
-- Sotto questa soglia (in euro, valore assoluto della differenza vs ultimo
-- prezzo pubblicato) il calcolo non genera variazione: niente riga in
-- price_change_log, niente upsert in pricing_grid, niente push OTA.
-- Default 1.00 EUR = comportamento storico (ogni centesimo conta).
-- Idempotente.
ALTER TABLE hotels
  ADD COLUMN IF NOT EXISTS min_price_delta_eur NUMERIC(6,2) NOT NULL DEFAULT 1.00;

COMMENT ON COLUMN hotels.min_price_delta_eur IS
  'Soglia minima (EUR) di variazione tariffaria sotto la quale il calcolo non genera modifiche. 1.00 = mantieni comportamento storico.';
