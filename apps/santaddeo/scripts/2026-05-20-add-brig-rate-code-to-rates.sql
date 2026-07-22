-- Aggiunge la colonna brig_rate_code a public.rates per il lookup
-- ratePlanCode (BRiG) -> rate_id (RMS) durante l'ETL e la sync da
-- /api/pms/rates/sync.
--
-- Replica esattamente il pattern gia' usato per `brig_room_code` su
-- room_types (vedi 2026-04-26-add-brig-room-code-to-room-types.sql).
--
-- Idempotente. Nessuna riga viene modificata: e' solo una colonna nullable.

ALTER TABLE public.rates
  ADD COLUMN IF NOT EXISTS brig_rate_code text;

COMMENT ON COLUMN public.rates.brig_rate_code IS
  'Codice rate plan lato BRiG (campo `ratePlanCode` o `code` su /api/nol/rateplans/list). Nullable: popolato solo per gli hotel con integrazione Brig attiva.';

CREATE INDEX IF NOT EXISTS idx_rates_brig_rate_code
  ON public.rates(hotel_id, brig_rate_code)
  WHERE brig_rate_code IS NOT NULL;
