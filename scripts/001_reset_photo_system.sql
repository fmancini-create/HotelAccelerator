-- FASE 1: Drop delle vecchie tabelle
DROP TABLE IF EXISTS photos CASCADE;
DROP TABLE IF EXISTS photo_categories CASCADE;
DROP TABLE IF EXISTS categories CASCADE;

-- FASE 2: Creazione tabelle nuove e pulite

-- Tabella categorie (semplice)
CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabella foto (storage unico, logica in DB)
CREATE TABLE photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  url TEXT NOT NULL,
  alt TEXT,
  is_published BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabella pivot per relazioni many-to-many
CREATE TABLE photo_categories (
  photo_id UUID REFERENCES photos(id) ON DELETE CASCADE,
  category_id UUID REFERENCES categories(id) ON DELETE CASCADE,
  PRIMARY KEY (photo_id, category_id)
);

-- Inserimento categorie predefinite
INSERT INTO categories (name, slug) VALUES
  ('Camere Economy', 'economy'),
  ('Camere Dependance', 'dependance'),
  ('Camere Dependance Deluxe', 'dependance-deluxe'),
  ('Suite', 'suite'),
  ('Suite Private Access', 'suite-private-access'),
  ('Camere Tuscan Style', 'tuscan-style'),
  ('Ristorante', 'ristorante'),
  ('SPA', 'spa'),
  ('Location', 'location'),
  ('Eventi', 'eventi');

-- RLS Policies (lettura pubblica, scrittura solo admin)
ALTER TABLE photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE photo_categories ENABLE ROW LEVEL SECURITY;

-- Policy: tutti possono leggere foto pubblicate
CREATE POLICY "Anyone can view published photos"
  ON photos FOR SELECT
  USING (is_published = true);

-- Policy: tutti possono leggere categorie
CREATE POLICY "Anyone can view categories"
  ON categories FOR SELECT
  USING (true);

-- Policy: tutti possono leggere associazioni foto-categorie
CREATE POLICY "Anyone can view photo categories"
  ON photo_categories FOR SELECT
  USING (true);

-- Policy: solo admin autenticati possono modificare (da configurare con auth.uid())
CREATE POLICY "Authenticated users can manage photos"
  ON photos FOR ALL
  USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can manage photo_categories"
  ON photo_categories FOR ALL
  USING (auth.role() = 'authenticated');
