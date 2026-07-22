-- 2026-04-24: Last-minute levels dual-mode (pct/num for occupancy, pct/eur for discount)
-- Aggiunge colonne opzionali retro-compatibili a last_minute_levels e last_minute_occupancy_bands
-- per permettere di definire occupazione e sconto in valore assoluto oltre che in percentuale.

-- ============================================================================
-- last_minute_levels: aggiungi discount_eur e discount_mode
-- ============================================================================
ALTER TABLE public.last_minute_levels
  ADD COLUMN IF NOT EXISTS discount_eur numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_mode text NOT NULL DEFAULT 'pct'
    CHECK (discount_mode IN ('pct', 'eur'));

COMMENT ON COLUMN public.last_minute_levels.discount_eur IS
  'Sconto in valore assoluto (EUR) applicato quando discount_mode = ''eur''';
COMMENT ON COLUMN public.last_minute_levels.discount_mode IS
  'Modalita dello sconto: ''pct'' (percentuale) oppure ''eur'' (importo fisso)';

-- ============================================================================
-- last_minute_occupancy_bands: aggiungi discount_eur, discount_mode,
-- occupancy_mode, min/max_occupancy_num per permettere la doppia modalita
-- anche nelle fasce interne del livello
-- ============================================================================
ALTER TABLE public.last_minute_occupancy_bands
  ADD COLUMN IF NOT EXISTS discount_eur numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS discount_mode text NOT NULL DEFAULT 'pct'
    CHECK (discount_mode IN ('pct', 'eur')),
  ADD COLUMN IF NOT EXISTS occupancy_mode text NOT NULL DEFAULT 'pct'
    CHECK (occupancy_mode IN ('pct', 'num')),
  ADD COLUMN IF NOT EXISTS min_occupancy_num integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS max_occupancy_num integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.last_minute_occupancy_bands.discount_eur IS
  'Sconto in valore assoluto (EUR) applicato quando discount_mode = ''eur''';
COMMENT ON COLUMN public.last_minute_occupancy_bands.discount_mode IS
  'Modalita dello sconto: ''pct'' (percentuale) oppure ''eur'' (importo fisso)';
COMMENT ON COLUMN public.last_minute_occupancy_bands.occupancy_mode IS
  'Modalita dell''occupazione: ''pct'' (percentuale) oppure ''num'' (numero camere)';
