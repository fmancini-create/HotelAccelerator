-- 18/05/2026: aggiunge colonna paid_amount a invoices per supportare
-- pagamenti parziali (acconti). Semantica:
--   * paid_amount IS NULL  -> nessun pagamento registrato come importo
--                              esplicito; se status='paid' si assume saldo
--                              pari a total (back-compat)
--   * paid_amount >= total -> fattura saldata, status auto-bump a 'paid'
--   * 0 < paid_amount < total -> acconto, status resta 'pending'
-- Il saldo progressivo (per struttura e globale) viene calcolato lato UI.
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(12,2);
