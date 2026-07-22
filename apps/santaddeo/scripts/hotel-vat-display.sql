-- Indicatori con/senza IVA per tenant (Santaddeo)
-- Preferenza di VISUALIZZAZIONE per struttura: gli importi restano memorizzati
-- LORDI (IVA inclusa); lo scorporo a netto è solo a livello di output KPI.
--
-- Eseguito in produzione via RPC exec_sql (questo Supabase non espone
-- POSTGRES_URL diretto). Qui per documentazione / riproducibilità.

ALTER TABLE hotels
  ADD COLUMN IF NOT EXISTS revenue_vat_mode text NOT NULL DEFAULT 'included';

ALTER TABLE hotels
  ADD COLUMN IF NOT EXISTS accommodation_vat_rate numeric(5,2) NOT NULL DEFAULT 10.0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'hotels_revenue_vat_mode_chk'
  ) THEN
    ALTER TABLE hotels
      ADD CONSTRAINT hotels_revenue_vat_mode_chk
      CHECK (revenue_vat_mode IN ('included', 'excluded'));
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
