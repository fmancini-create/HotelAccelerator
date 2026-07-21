-- Pipeline Trattative: tabella deals
-- Eseguire in Supabase SQL Editor

-- 1. Tabella principale deals
CREATE TABLE IF NOT EXISTS deals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Riferimenti
  hotel_id UUID REFERENCES hotels(id) ON DELETE SET NULL,  -- NULL se prospect non ancora hotel
  lead_id UUID REFERENCES guide_leads(id) ON DELETE SET NULL,  -- Lead originale (opzionale)
  agent_id UUID NOT NULL REFERENCES sales_agents(id) ON DELETE CASCADE,
  
  -- Info prospect (per deal senza hotel_id ancora)
  prospect_name TEXT NOT NULL,
  prospect_email TEXT,
  prospect_phone TEXT,
  prospect_hotel_name TEXT,
  prospect_rooms INTEGER,
  prospect_stars INTEGER,
  prospect_location TEXT,
  
  -- Pipeline
  stage TEXT NOT NULL DEFAULT 'lead' 
    CHECK (stage IN ('lead', 'contacted', 'demo_scheduled', 'demo_done', 'proposal', 'negotiation', 'won', 'lost')),
  stage_changed_at TIMESTAMPTZ DEFAULT now(),
  
  -- Valore e probabilità
  estimated_value NUMERIC(10,2),           -- MRR stimato
  probability INTEGER DEFAULT 10           -- 0-100%
    CHECK (probability >= 0 AND probability <= 100),
  
  -- Date
  expected_close_date DATE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  closed_at TIMESTAMPTZ,                   -- quando won/lost
  
  -- Tracking
  last_activity_at TIMESTAMPTZ DEFAULT now(),
  next_follow_up_date DATE,
  
  -- Motivo perdita (se lost)
  lost_reason TEXT,
  
  -- Note
  notes TEXT
);

-- 2. Indici per performance
CREATE INDEX IF NOT EXISTS idx_deals_agent ON deals(agent_id);
CREATE INDEX IF NOT EXISTS idx_deals_stage ON deals(stage);
CREATE INDEX IF NOT EXISTS idx_deals_agent_stage ON deals(agent_id, stage);
CREATE INDEX IF NOT EXISTS idx_deals_next_followup ON deals(next_follow_up_date) WHERE next_follow_up_date IS NOT NULL;

-- 3. Trigger per updated_at automatico
CREATE OR REPLACE FUNCTION update_deals_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  -- Se lo stage cambia, aggiorna anche stage_changed_at
  IF OLD.stage IS DISTINCT FROM NEW.stage THEN
    NEW.stage_changed_at = now();
    NEW.last_activity_at = now();
    -- Se passa a won o lost, segna closed_at
    IF NEW.stage IN ('won', 'lost') AND OLD.stage NOT IN ('won', 'lost') THEN
      NEW.closed_at = now();
    END IF;
    -- Se torna attivo da won/lost, resetta closed_at
    IF OLD.stage IN ('won', 'lost') AND NEW.stage NOT IN ('won', 'lost') THEN
      NEW.closed_at = NULL;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS deals_updated_at ON deals;
CREATE TRIGGER deals_updated_at
  BEFORE UPDATE ON deals
  FOR EACH ROW
  EXECUTE FUNCTION update_deals_updated_at();

-- 4. RLS
ALTER TABLE deals ENABLE ROW LEVEL SECURITY;

-- Super admin full access
CREATE POLICY deals_superadmin_all ON deals FOR ALL 
  TO authenticated 
  USING (is_super_admin())
  WITH CHECK (is_super_admin());

-- Sales agent vede e modifica solo i propri deal
CREATE POLICY deals_agent_select ON deals FOR SELECT 
  TO authenticated 
  USING (
    agent_id IN (SELECT id FROM sales_agents WHERE user_id = auth.uid())
  );

CREATE POLICY deals_agent_insert ON deals FOR INSERT 
  TO authenticated 
  WITH CHECK (
    agent_id IN (SELECT id FROM sales_agents WHERE user_id = auth.uid())
  );

CREATE POLICY deals_agent_update ON deals FOR UPDATE 
  TO authenticated 
  USING (
    agent_id IN (SELECT id FROM sales_agents WHERE user_id = auth.uid())
  )
  WITH CHECK (
    agent_id IN (SELECT id FROM sales_agents WHERE user_id = auth.uid())
  );

CREATE POLICY deals_agent_delete ON deals FOR DELETE 
  TO authenticated 
  USING (
    agent_id IN (SELECT id FROM sales_agents WHERE user_id = auth.uid())
  );

-- Service role full access
CREATE POLICY deals_service_role ON deals FOR ALL 
  TO service_role 
  USING (true)
  WITH CHECK (true);

-- 5. Commento tabella
COMMENT ON TABLE deals IS 'Pipeline trattative commerciali per venditori';
COMMENT ON COLUMN deals.stage IS 'Fase: lead, contacted, demo_scheduled, demo_done, proposal, negotiation, won, lost';
COMMENT ON COLUMN deals.estimated_value IS 'MRR stimato in EUR';
COMMENT ON COLUMN deals.probability IS 'Probabilità chiusura 0-100%';
