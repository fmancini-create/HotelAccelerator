-- Insert default photo categories
INSERT INTO public.photo_categories (name, slug, path, pages) VALUES
  ('Suite', 'suite', '/images/suite', ARRAY['/camere/suite']),
  ('Suite Private Access', 'suite-private-access', '/images/suite-private-access', ARRAY['/camere/suite-private-access']),
  ('Suite Superior', 'suite-superior', '/images/suite-superior', ARRAY['/camere/suite-superior']),
  ('Tuscan Style', 'tuscan-style', '/images/tuscan-style', ARRAY['/camere/tuscan-style']),
  ('Tuscan Superior', 'tuscan-superior', '/images/tuscan-superior', ARRAY['/camere/tuscan-superior']),
  ('Economy', 'economy', '/images/economy', ARRAY['/camere/economy']),
  ('Economy Accesso Privato', 'economy-accesso-privato', '/images/economy-accesso-privato', ARRAY['/camere/economy-accesso-privato']),
  ('Dependance Deluxe', 'dependance-deluxe', '/images/dependance/deluxe', ARRAY['/camere/dependance-deluxe', '/camere/dependance']),
  ('Dependance', 'dependance', '/images/dependance', ARRAY['/camere/dependance']),
  ('Palazzo Tempi', 'palazzo-tempi', '/images/palazzo-tempi', ARRAY['/camere/palazzo-tempi']),
  ('Healthy Tree Room', 'healthy-tree-room', '/images/healthy-tree-room', ARRAY['/camere/healthy-tree-room']),
  ('Piscina', 'piscina', '/images/piscina', ARRAY['/piscina', '/']),
  ('Ristorante', 'ristorante', '/images/ristorante', ARRAY['/ristorante']),
  ('Spa', 'spa', '/images/spa', ARRAY['/spa']),
  ('Villa', 'villa', '/images/villa', ARRAY['/la-struttura', '/']),
  ('Generale', 'generale', '/images/generale', ARRAY['/'])
ON CONFLICT (slug) DO NOTHING;
