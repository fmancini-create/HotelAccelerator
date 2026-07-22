 funziona-- =============================================================================
-- Aggiungi campi fiscali alla tabella organizations
-- Questi campi vengono popolati dal form settings o dal checkout Stripe
-- =============================================================================

-- Codice fiscale (CF) - per ditte individuali o quando diverso da P.IVA
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS tax_code TEXT;

-- Codice SDI per fatturazione elettronica (7 caratteri alfanumerici, default 0000000)
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS sdi_code TEXT;

-- PEC per fatturazione elettronica (alternativa a SDI)
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS pec TEXT;

-- Indirizzo di fatturazione completo (via, citta, cap, provincia, paese)
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS billing_address JSONB;

-- Stripe customer ID per collegamento diretto
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;

-- FattureInCloud client ID per evitare duplicati
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS fic_client_id BIGINT;

-- Indici
CREATE INDEX IF NOT EXISTS idx_organizations_stripe_customer ON organizations(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_organizations_fic_client ON organizations(fic_client_id);

-- Commenti
COMMENT ON COLUMN organizations.tax_code IS 'Codice fiscale italiano';
COMMENT ON COLUMN organizations.sdi_code IS 'Codice destinatario SDI per fatturazione elettronica (7 caratteri)';
COMMENT ON COLUMN organizations.pec IS 'PEC per fatturazione elettronica (alternativa a SDI)';
COMMENT ON COLUMN organizations.billing_address IS 'Indirizzo di fatturazione JSON: {street, city, postal_code, state, country}';
COMMENT ON COLUMN organizations.stripe_customer_id IS 'ID cliente Stripe collegato';
COMMENT ON COLUMN organizations.fic_client_id IS 'ID cliente FattureInCloud per evitare duplicati';
