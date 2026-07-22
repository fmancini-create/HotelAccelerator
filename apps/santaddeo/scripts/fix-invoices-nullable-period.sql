-- Fix: rende period_start e period_end nullable per supportare fatture senza periodo di competenza
-- (es. fatture vecchie importate manualmente con solo data emissione)

ALTER TABLE invoices ALTER COLUMN period_start DROP NOT NULL;
ALTER TABLE invoices ALTER COLUMN period_end DROP NOT NULL;

-- Commento per documentazione
COMMENT ON COLUMN invoices.period_start IS 'Data inizio periodo di competenza (nullable per fatture senza periodo)';
COMMENT ON COLUMN invoices.period_end IS 'Data fine periodo di competenza (nullable per fatture senza periodo)';
