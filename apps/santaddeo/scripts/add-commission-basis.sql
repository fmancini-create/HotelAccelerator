-- Aggiunge commission_basis alla tabella subscription_commission_periods
-- Valori: 'total' (commissione su produzione totale) o 'delta' (solo su incremento YoY)
-- Ogni periodo può avere una base di calcolo diversa
-- Es: 2024-2026 delta (solo incremento), 2027+ total (su tutto)

ALTER TABLE subscription_commission_periods 
ADD COLUMN IF NOT EXISTS commission_basis TEXT DEFAULT 'total' 
CHECK (commission_basis IN ('total', 'delta'));

-- Commento esplicativo
COMMENT ON COLUMN subscription_commission_periods.commission_basis IS 
  'Base di calcolo: total = commissione su produzione totale del mese, delta = commissione solo su incremento YoY positivo';
