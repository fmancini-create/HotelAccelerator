-- =============================================
-- CMS TEMPLATES SYSTEM
-- Aggiunge supporto per templates riutilizzabili
-- =============================================

-- Tabella dei templates disponibili nella piattaforma
CREATE TABLE IF NOT EXISTS cms_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Se property_id è NULL, è un template di piattaforma (come Villa I Barronci)
  -- Se property_id è valorizzato, è un template custom del tenant
  property_id UUID REFERENCES properties(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  thumbnail_url TEXT,
  -- Categoria del template
  category VARCHAR(50) NOT NULL DEFAULT 'hotel', -- hotel, resort, b&b, apartment, etc.
  -- Se è un template di sistema (non modificabile)
  is_system BOOLEAN DEFAULT FALSE,
  -- Se è attivo e disponibile per l'uso
  is_active BOOLEAN DEFAULT TRUE,
  -- Configurazione del template (colori, font, stili)
  theme_config JSONB DEFAULT '{}',
  -- Layout predefiniti per le pagine
  page_layouts JSONB DEFAULT '{}',
  -- Sezioni predefinite per tipo di pagina
  default_sections JSONB DEFAULT '{}',
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Aggiungi campo template_id a cms_pages
ALTER TABLE cms_pages 
ADD COLUMN IF NOT EXISTS template_id UUID REFERENCES cms_templates(id) ON DELETE SET NULL;

-- Aggiungi campo page_type per distinguere i tipi di pagina
ALTER TABLE cms_pages 
ADD COLUMN IF NOT EXISTS page_type VARCHAR(50) DEFAULT 'custom';
-- Valori possibili: home, room, service, location, contact, gallery, custom

-- Aggiungi campo language per multilingua
ALTER TABLE cms_pages 
ADD COLUMN IF NOT EXISTS language VARCHAR(5) DEFAULT 'it';

-- Aggiungi campo parent_page_id per pagine tradotte
ALTER TABLE cms_pages 
ADD COLUMN IF NOT EXISTS parent_page_id UUID REFERENCES cms_pages(id) ON DELETE SET NULL;

-- Indice per cercare pagine per tipo e lingua
CREATE INDEX IF NOT EXISTS idx_cms_pages_type_lang ON cms_pages(property_id, page_type, language);

-- Indice per cercare pagine per template
CREATE INDEX IF NOT EXISTS idx_cms_pages_template ON cms_pages(template_id);

-- RLS per cms_templates
ALTER TABLE cms_templates ENABLE ROW LEVEL SECURITY;

-- Policy: tutti possono vedere i templates di sistema e i propri templates
CREATE POLICY "cms_templates_read" ON cms_templates
  FOR SELECT
  USING (
    property_id IS NULL  -- Templates di piattaforma visibili a tutti
    OR property_id IN (
      SELECT property_id FROM admin_users WHERE id = auth.uid()
    )
  );

-- Policy: solo service role può creare/modificare templates di sistema
CREATE POLICY "cms_templates_system_write" ON cms_templates
  FOR ALL
  TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

-- Policy: tenant può creare/modificare i propri templates
CREATE POLICY "cms_templates_tenant_write" ON cms_templates
  FOR ALL
  USING (
    property_id IS NOT NULL
    AND property_id IN (
      SELECT property_id FROM admin_users WHERE id = auth.uid()
    )
  )
  WITH CHECK (
    property_id IS NOT NULL
    AND property_id IN (
      SELECT property_id FROM admin_users WHERE id = auth.uid()
    )
  );

-- =============================================
-- INSERT TEMPLATE VILLA I BARRONCI
-- =============================================

INSERT INTO cms_templates (
  id,
  property_id,
  name,
  slug,
  description,
  category,
  is_system,
  is_active,
  theme_config,
  page_layouts,
  default_sections
) VALUES (
  'a0000000-0000-0000-0000-000000000001',
  NULL, -- Template di piattaforma
  'Villa I Barronci',
  'villa-i-barronci',
  'Template elegante per hotel e resort di lusso in stile toscano. Include hero con slider, sezioni per camere, ristorante, spa e servizi.',
  'resort',
  TRUE,
  TRUE,
  '{
    "colors": {
      "primary": "#8b7355",
      "secondary": "#f5f3f0",
      "accent": "#6d5a42",
      "background": "#ffffff",
      "text": "#7a7a7a",
      "heading": "#8b7355"
    },
    "fonts": {
      "heading": "Playfair Display",
      "body": "Open Sans"
    },
    "style": "elegant-tuscan"
  }',
  '{
    "home": ["villa_hero_slider", "villa_about", "villa_pool", "villa_restaurant", "villa_florence", "villa_three_features", "villa_cta_icons", "villa_cantina"],
    "room": ["villa_hero_gallery", "villa_room_intro", "villa_room_gallery"],
    "service": ["villa_hero_gallery", "text", "gallery"],
    "location": ["villa_hero_gallery", "text", "map"],
    "contact": ["hero", "contact_form", "map"],
    "gallery": ["hero", "gallery"]
  }',
  '{
    "home": [
      {"type": "villa_hero_slider", "data": {"title": "VILLA I BARRONCI", "subtitle": "RESORT & SPA"}},
      {"type": "villa_about", "data": {"title": "Benvenuti", "content": ""}},
      {"type": "villa_pool", "data": {"title": "Piscina & Jacuzzi"}},
      {"type": "villa_restaurant", "data": {"title": "Ristorante"}},
      {"type": "villa_florence", "data": {"lang": "it"}},
      {"type": "villa_three_features", "data": {"lang": "it"}},
      {"type": "villa_cta_icons", "data": {"lang": "it"}},
      {"type": "villa_cantina", "data": {"lang": "it"}}
    ],
    "room": [
      {"type": "villa_hero_gallery", "data": {"title": "", "category": ""}},
      {"type": "villa_room_intro", "data": {"title": "", "subtitle": "", "content": ""}},
      {"type": "villa_room_gallery", "data": {"title": "Galleria", "category": ""}}
    ]
  }'
) ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  theme_config = EXCLUDED.theme_config,
  page_layouts = EXCLUDED.page_layouts,
  default_sections = EXCLUDED.default_sections,
  updated_at = NOW();

-- =============================================
-- INSERT ALTRI TEMPLATES DI ESEMPIO
-- =============================================

INSERT INTO cms_templates (
  property_id,
  name,
  slug,
  description,
  category,
  is_system,
  is_active,
  theme_config
) VALUES 
(
  NULL,
  'Hotel Moderno',
  'hotel-moderno',
  'Template moderno e minimalista per hotel urbani. Design pulito con focus sulle prenotazioni.',
  'hotel',
  TRUE,
  TRUE,
  '{
    "colors": {
      "primary": "#1a1a1a",
      "secondary": "#f8f8f8",
      "accent": "#007bff",
      "background": "#ffffff",
      "text": "#333333",
      "heading": "#1a1a1a"
    },
    "fonts": {
      "heading": "Inter",
      "body": "Inter"
    },
    "style": "modern-minimal"
  }'
),
(
  NULL,
  'B&B Accogliente',
  'bb-accogliente',
  'Template caldo e accogliente per bed & breakfast e piccole strutture. Atmosfera familiare.',
  'b&b',
  TRUE,
  TRUE,
  '{
    "colors": {
      "primary": "#8B4513",
      "secondary": "#FFF8DC",
      "accent": "#D2691E",
      "background": "#FFFAF0",
      "text": "#5D4037",
      "heading": "#8B4513"
    },
    "fonts": {
      "heading": "Merriweather",
      "body": "Lato"
    },
    "style": "warm-cozy"
  }'
)
ON CONFLICT (slug) DO NOTHING;
