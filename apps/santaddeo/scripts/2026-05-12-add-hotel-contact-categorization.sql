-- 12/05/2026 - Estensione anagrafica `hotels` per onboarding completo
-- Aggiunge contatti pubblici della struttura + categorizzazione (tipo,
-- stelle) + provincia/regione. Tutti i campi sono nullable per backward
-- compat con hotels esistenti.
--
-- Vedi anche:
--   * components/onboarding/onboarding-form.tsx -> raccoglie i nuovi campi
--   * app/actions/onboarding.ts                 -> li scrive in DB
--   * lib/types/database.ts                     -> Hotel interface aggiornata

ALTER TABLE hotels
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS website TEXT,
  ADD COLUMN IF NOT EXISTS contact_email TEXT,
  ADD COLUMN IF NOT EXISTS hotel_type TEXT,
  ADD COLUMN IF NOT EXISTS stars INTEGER,
  ADD COLUMN IF NOT EXISTS region TEXT,
  ADD COLUMN IF NOT EXISTS province TEXT;

-- Vincoli di dominio per i nuovi campi
ALTER TABLE hotels
  DROP CONSTRAINT IF EXISTS hotels_stars_check;
ALTER TABLE hotels
  ADD CONSTRAINT hotels_stars_check
  CHECK (stars IS NULL OR (stars BETWEEN 1 AND 5));

-- Tipi struttura ammessi (allineato con HOTEL_TYPES in
-- lib/utils/hotel-categorization.ts). Nullable per non bloccare gli hotel
-- esistenti pre-migration.
ALTER TABLE hotels
  DROP CONSTRAINT IF EXISTS hotels_hotel_type_check;
ALTER TABLE hotels
  ADD CONSTRAINT hotels_hotel_type_check
  CHECK (
    hotel_type IS NULL OR hotel_type IN (
      'hotel',
      'resort',
      'boutique',
      'bb',
      'agriturismo',
      'casa_vacanze',
      'appartamenti',
      'residence',
      'villaggio',
      'camping',
      'hostel',
      'altro'
    )
  );

-- Indici utili per SuperAdmin / report
CREATE INDEX IF NOT EXISTS idx_hotels_hotel_type ON hotels(hotel_type) WHERE hotel_type IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_hotels_region ON hotels(region) WHERE region IS NOT NULL;

COMMENT ON COLUMN hotels.phone IS 'Numero di telefono pubblico della struttura (non quello personale dell utente)';
COMMENT ON COLUMN hotels.website IS 'URL del sito web ufficiale della struttura';
COMMENT ON COLUMN hotels.contact_email IS 'Email pubblica della struttura (info@..., booking@...)';
COMMENT ON COLUMN hotels.hotel_type IS 'Tipologia: hotel/resort/boutique/bb/agriturismo/casa_vacanze/appartamenti/residence/villaggio/camping/hostel/altro';
COMMENT ON COLUMN hotels.stars IS 'Classificazione 1-5 stelle. NULL per strutture extra-alberghiere senza classificazione';
COMMENT ON COLUMN hotels.region IS 'Regione italiana (es. Toscana, Lombardia)';
COMMENT ON COLUMN hotels.province IS 'Sigla provincia (es. FI, MI, RM)';
