-- =====================================================
-- PROSPECTS: Database strutture ricettive italiane
-- =====================================================
-- Questa tabella contiene ~200k strutture ricettive italiane
-- precaricate da fonti ISTAT/Regioni e arricchite con Google Places.
-- I superadmin assegnano i prospect ai venditori per attività commerciale.

-- 1) Tabella principale prospects
CREATE TABLE IF NOT EXISTS prospects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Dati identificativi
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'hotel',  -- hotel, b&b, agriturismo, residence, camping, ostello, casa_vacanze, villaggio_turistico, altro
  stars INTEGER CHECK (stars IS NULL OR (stars >= 1 AND stars <= 5)),
  
  -- Localizzazione
  address TEXT,
  city TEXT,
  province TEXT,                           -- Sigla (FI, RM, MI, etc.)
  region TEXT,                             -- Toscana, Lazio, Lombardia, etc.
  postal_code TEXT,
  country TEXT DEFAULT 'IT',
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  
  -- Contatti
  phone TEXT,
  email TEXT,
  website TEXT,
  
  -- Dati arricchiti (Google Places)
  google_place_id TEXT,
  google_rating DECIMAL(2, 1),
  google_reviews_count INTEGER,
  google_photos_url TEXT,
  google_formatted_address TEXT,
  
  -- Dati business
  rooms_count INTEGER,
  beds_count INTEGER,
  
  -- Gestione commerciale
  assigned_agent_id UUID REFERENCES sales_agents(id) ON DELETE SET NULL,
  assignment_date TIMESTAMPTZ,
  status TEXT DEFAULT 'unassigned' CHECK (status IN ('unassigned', 'assigned', 'contacted', 'meeting_scheduled', 'proposal_sent', 'converted', 'not_interested', 'not_reachable')),
  
  -- Note e tracking
  notes TEXT,
  last_contact_at TIMESTAMPTZ,
  contact_attempts INTEGER DEFAULT 0,
  
  -- Metadata import
  data_source TEXT,                        -- 'regione_toscana', 'regione_lombardia', 'google_places', 'manual', 'csv_import'
  external_id TEXT,                        -- ID originale dalla fonte dati
  last_enriched_at TIMESTAMPTZ,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  -- Deduplicazione: nome normalizzato + città per matching fuzzy
  normalized_name TEXT GENERATED ALWAYS AS (
    lower(regexp_replace(name, '[^a-zA-Z0-9]', '', 'g'))
  ) STORED
);

-- 2) Indici per performance
CREATE INDEX IF NOT EXISTS idx_prospects_region ON prospects(region);
CREATE INDEX IF NOT EXISTS idx_prospects_province ON prospects(province);
CREATE INDEX IF NOT EXISTS idx_prospects_city ON prospects(city);
CREATE INDEX IF NOT EXISTS idx_prospects_category ON prospects(category);
CREATE INDEX IF NOT EXISTS idx_prospects_stars ON prospects(stars) WHERE stars IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_prospects_status ON prospects(status);
CREATE INDEX IF NOT EXISTS idx_prospects_agent ON prospects(assigned_agent_id) WHERE assigned_agent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_prospects_normalized_name ON prospects(normalized_name);
CREATE INDEX IF NOT EXISTS idx_prospects_google_place_id ON prospects(google_place_id) WHERE google_place_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_prospects_external_id ON prospects(data_source, external_id) WHERE external_id IS NOT NULL;

-- Indice composto per ricerche comuni
CREATE INDEX IF NOT EXISTS idx_prospects_region_category_stars ON prospects(region, category, stars);

-- Full-text search sul nome
CREATE INDEX IF NOT EXISTS idx_prospects_name_trgm ON prospects USING gin (name gin_trgm_ops);

-- 3) Trigger per updated_at
CREATE OR REPLACE FUNCTION update_prospects_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_prospects_updated_at ON prospects;
CREATE TRIGGER trigger_prospects_updated_at
  BEFORE UPDATE ON prospects
  FOR EACH ROW
  EXECUTE FUNCTION update_prospects_updated_at();

-- 4) Collegamento deals → prospects
ALTER TABLE deals ADD COLUMN IF NOT EXISTS prospect_id UUID REFERENCES prospects(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_deals_prospect ON deals(prospect_id) WHERE prospect_id IS NOT NULL;

-- 5) RLS Policies
ALTER TABLE prospects ENABLE ROW LEVEL SECURITY;

-- Super admin: accesso completo
CREATE POLICY prospects_superadmin_all ON prospects
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'super_admin'
    )
  );

-- Agenti: vedono solo i prospect assegnati a loro
CREATE POLICY prospects_agent_select ON prospects
  FOR SELECT
  TO authenticated
  USING (
    assigned_agent_id IN (
      SELECT id FROM sales_agents
      WHERE user_id = auth.uid()
    )
  );

-- Agenti: possono aggiornare solo status e note dei propri prospect
CREATE POLICY prospects_agent_update ON prospects
  FOR UPDATE
  TO authenticated
  USING (
    assigned_agent_id IN (
      SELECT id FROM sales_agents
      WHERE user_id = auth.uid()
    )
  )
  WITH CHECK (
    assigned_agent_id IN (
      SELECT id FROM sales_agents
      WHERE user_id = auth.uid()
    )
  );

-- Service role: accesso completo (per import batch)
CREATE POLICY prospects_service_role ON prospects
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 6) Tabella per tracking import batch
CREATE TABLE IF NOT EXISTS prospect_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename TEXT NOT NULL,
  data_source TEXT NOT NULL,
  total_rows INTEGER,
  imported_rows INTEGER,
  skipped_rows INTEGER,
  error_rows INTEGER,
  errors JSONB,
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  imported_by UUID REFERENCES profiles(id)
);

-- RLS per prospect_imports (solo superadmin)
ALTER TABLE prospect_imports ENABLE ROW LEVEL SECURITY;

CREATE POLICY prospect_imports_superadmin ON prospect_imports
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'super_admin'
    )
  );

-- 7) Vista per statistiche prospect
CREATE OR REPLACE VIEW prospect_stats AS
SELECT
  region,
  category,
  status,
  COUNT(*) as count,
  COUNT(*) FILTER (WHERE assigned_agent_id IS NOT NULL) as assigned_count,
  COUNT(*) FILTER (WHERE status = 'converted') as converted_count,
  AVG(stars) FILTER (WHERE stars IS NOT NULL) as avg_stars
FROM prospects
GROUP BY region, category, status;

-- Grant per la vista
GRANT SELECT ON prospect_stats TO authenticated;

-- 8) Funzione helper per assegnazione bulk
CREATE OR REPLACE FUNCTION bulk_assign_prospects(
  p_prospect_ids UUID[],
  p_agent_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  affected_rows INTEGER;
BEGIN
  UPDATE prospects
  SET 
    assigned_agent_id = p_agent_id,
    assignment_date = now(),
    status = CASE WHEN status = 'unassigned' THEN 'assigned' ELSE status END,
    updated_at = now()
  WHERE id = ANY(p_prospect_ids);
  
  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  RETURN affected_rows;
END;
$$;

-- 9) Lookup table per categorie (opzionale, per UI)
CREATE TABLE IF NOT EXISTS prospect_categories (
  code TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  icon TEXT,
  sort_order INTEGER DEFAULT 0
);

INSERT INTO prospect_categories (code, label, icon, sort_order) VALUES
  ('hotel', 'Hotel', 'building-2', 1),
  ('b&b', 'Bed & Breakfast', 'home', 2),
  ('agriturismo', 'Agriturismo', 'trees', 3),
  ('residence', 'Residence', 'building', 4),
  ('camping', 'Camping', 'tent', 5),
  ('ostello', 'Ostello', 'users', 6),
  ('casa_vacanze', 'Casa Vacanze', 'home', 7),
  ('villaggio_turistico', 'Villaggio Turistico', 'palmtree', 8),
  ('altro', 'Altro', 'circle', 99)
ON CONFLICT (code) DO NOTHING;

-- 10) Lookup table per regioni italiane
CREATE TABLE IF NOT EXISTS italian_regions (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0
);

INSERT INTO italian_regions (code, name, sort_order) VALUES
  ('ABR', 'Abruzzo', 1),
  ('BAS', 'Basilicata', 2),
  ('CAL', 'Calabria', 3),
  ('CAM', 'Campania', 4),
  ('EMR', 'Emilia-Romagna', 5),
  ('FVG', 'Friuli-Venezia Giulia', 6),
  ('LAZ', 'Lazio', 7),
  ('LIG', 'Liguria', 8),
  ('LOM', 'Lombardia', 9),
  ('MAR', 'Marche', 10),
  ('MOL', 'Molise', 11),
  ('PIE', 'Piemonte', 12),
  ('PUG', 'Puglia', 13),
  ('SAR', 'Sardegna', 14),
  ('SIC', 'Sicilia', 15),
  ('TOS', 'Toscana', 16),
  ('TAA', 'Trentino-Alto Adige', 17),
  ('UMB', 'Umbria', 18),
  ('VDA', 'Valle d''Aosta', 19),
  ('VEN', 'Veneto', 20)
ON CONFLICT (code) DO NOTHING;

-- Abilita estensione per fuzzy search (se non già abilitata)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

COMMENT ON TABLE prospects IS 'Database strutture ricettive italiane per CRM commerciale. Import da ISTAT/Regioni + arricchimento Google Places.';
