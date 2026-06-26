-- Aggiunge la colonna affiancata `api_token_hash` su properties (solo schema additivo).
--
-- Strategia: NON cifrare `api_token` (è usato in lookup .eq(...) dal webhook
-- Manubot -> HotelAccelerator e la cifratura non-deterministica romperebbe la
-- ricerca). In futuro si salverà qui l'HMAC-SHA256 deterministico del token
-- (formato "hmac:v1:<hex>", utility lib/security/token-hash.ts) e il webhook
-- farà lookup su questa colonna, mantenendo un fallback legacy temporaneo su
-- `api_token`.
--
-- Questo step è PURAMENTE ADDITIVO:
--   * nessun backfill / nessuna scrittura su righe esistenti
--   * nessun NOT NULL, nessun DEFAULT
--   * `api_token` invariato
--   * nessuna modifica a setup, webhook o lookup
--   * nessuna policy RLS aggiunta (il webhook usa il service client)

ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS api_token_hash text;

COMMENT ON COLUMN public.properties.api_token_hash IS
  'HMAC-SHA256 deterministico ("hmac:v1:<hex>") di api_token per lookup webhook senza esporre il token in chiaro. Popolato in step successivi; nessun backfill in questo step.';

-- Indice unico PARZIALE: garantisce univocità dell''hash quando presente,
-- senza far collidere le (molte) righe con api_token_hash NULL.
CREATE UNIQUE INDEX IF NOT EXISTS properties_api_token_hash_key
  ON public.properties (api_token_hash)
  WHERE api_token_hash IS NOT NULL;
