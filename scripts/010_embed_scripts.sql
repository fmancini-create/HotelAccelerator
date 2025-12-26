-- Tabella per script embed personalizzabili
CREATE TABLE IF NOT EXISTS embed_scripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  destination_url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused')),
  
  -- Configurazione widget e theme
  config JSONB NOT NULL DEFAULT '{
    "widgets": {},
    "theme": {
      "primaryColor": "#007bff",
      "fontFamily": "Inter",
      "borderRadius": 8
    },
    "promoMessages": []
  }'::jsonb,
  
  -- Metriche
  views_count INTEGER DEFAULT 0,
  interactions_count INTEGER DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(property_id, name)
);

-- Indici per performance
CREATE INDEX IF NOT EXISTS idx_embed_scripts_property ON embed_scripts(property_id);
CREATE INDEX IF NOT EXISTS idx_embed_scripts_status ON embed_scripts(status);
CREATE INDEX IF NOT EXISTS idx_embed_scripts_destination ON embed_scripts(destination_url);

-- Trigger per updated_at
CREATE OR REPLACE FUNCTION update_embed_scripts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER embed_scripts_updated_at
  BEFORE UPDATE ON embed_scripts
  FOR EACH ROW
  EXECUTE FUNCTION update_embed_scripts_updated_at();

-- RLS disabilitato (gestito a livello service)
ALTER TABLE embed_scripts DISABLE ROW LEVEL SECURITY;
