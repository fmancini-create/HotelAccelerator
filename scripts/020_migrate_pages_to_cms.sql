-- Migrazione pagine statiche Villa I Barronci al CMS
-- Questo script inserisce le pagine nel database cms_pages

-- Prima otteniamo l'ID della property Villa I Barronci
-- Assumiamo che esista già una property con slug 'villa-i-barronci' o usiamo un UUID placeholder

DO $$
DECLARE
  v_property_id UUID;
BEGIN
  -- Cerca la property esistente o usa un default
  SELECT id INTO v_property_id FROM properties WHERE slug = 'villa-i-barronci' LIMIT 1;
  
  -- Se non esiste, creala
  IF v_property_id IS NULL THEN
    INSERT INTO properties (id, name, slug, is_active, frontend_enabled, cms_enabled, default_language)
    VALUES (
      gen_random_uuid(),
      'Villa I Barronci Resort & Spa',
      'villa-i-barronci',
      true,
      true,
      true,
      'it'
    )
    RETURNING id INTO v_property_id;
  END IF;

  -- Homepage Italiana
  INSERT INTO cms_pages (id, property_id, slug, title, status, seo_title, seo_description, sections, published_at)
  VALUES (
    gen_random_uuid(),
    v_property_id,
    'home-it',
    'Homepage Italiana',
    'published',
    'Bed & Breakfast Resort in Toscana Chianti San Casciano | Villa I Barronci Resort & Spa',
    'La tua vacanza di charme in Toscana ti aspetta tra le colline del Chianti: villa d''epoca con piscina, area benessere e parco privato',
    '[
      {"id": "hero-1", "type": "villa_hero_slider", "data": {"title": "VILLA I BARRONCI", "subtitle": "RESORT & SPA", "description": "Tra le colline del Chianti, la tua vacanza di charme in Toscana: villa d''epoca con piscina, Area Benessere e parco privato", "ctaText": "SCOPRI I BARRONCI", "ctaLink": "/"}},
      {"id": "about-1", "type": "villa_about", "data": {"title": "Villa I Barronci", "subtitle": "Resort & Spa", "description": "La tua vacanza di charme in Toscana ti aspetta tra le colline del Chianti: villa d''epoca con piscina, area benessere e parco privato", "content": "Ci sono momenti nella vita – e se non ci sono, occorre crearseli – in cui è finalmente arrivato il momento di farsi un regalo. Luoghi come Villa I Barronci Resort & Spa, nel cuore del Chianti, esistono per questo, per premiarci."}},
      {"id": "pool-1", "type": "villa_pool", "data": {"title": "Piscina & Jacuzzi", "description": "Una piscina panoramica mozzafiato, con Jacuzzi", "ctaText": "TUFFATI IN PISCINA", "ctaLink": "/piscina-jacuzzi"}},
      {"id": "restaurant-1", "type": "villa_restaurant", "data": {"title": "da Tiberio a San Casciano", "description": "La vacanza in Toscana ha trovato la sua migliore cucina", "ctaText": "SCOPRI IL RISTORANTE", "ctaLink": "/ristorante"}},
      {"id": "florence-1", "type": "villa_florence", "data": {"lang": "it"}},
      {"id": "features-1", "type": "villa_three_features", "data": {"lang": "it"}},
      {"id": "cta-1", "type": "villa_cta_icons", "data": {"lang": "it"}},
      {"id": "cantina-1", "type": "villa_cantina", "data": {"lang": "it"}}
    ]'::jsonb,
    NOW()
  )
  ON CONFLICT (property_id, slug) DO NOTHING;

  -- Pagina Camere Dependance
  INSERT INTO cms_pages (id, property_id, slug, title, status, seo_title, seo_description, sections, published_at)
  VALUES (
    gen_random_uuid(),
    v_property_id,
    'camere/dependance',
    'Dependance',
    'published',
    'Dependance - Villa I Barronci Resort & Spa',
    'Camera nella dependance storica di Villa I Barronci, privacy e charme toscano nel Chianti',
    '[
      {"id": "hero-1", "type": "villa_hero_gallery", "data": {"title": "Charme e Riservatezza", "subtitle": "Le camere nella Dependance storica", "category": "dependance-deluxe", "heroIndex": 0}},
      {"id": "intro-1", "type": "villa_room_intro", "data": {"title": "Dependance", "subtitle": "Camere nella dependance storica", "content": "<p>Le camere Dependance si trovano nell''edificio storico adiacente alla villa principale, offrendo maggiore privacy e riservatezza.</p><p>Con il loro charme toscano autentico, travi a vista e arredi curati, queste camere sono ideali per chi desidera un soggiorno tranquillo immerso nell''atmosfera del Chianti, pur avendo accesso a tutti i servizi del resort.</p>", "ctaText": "PRENOTA", "ctaLink": "https://www.scidoo.com/preventivov2/?cod=1131&provenienza=39713", "backgroundColor": "#f5f3f0"}},
      {"id": "gallery-deluxe", "type": "villa_room_gallery", "data": {"title": "Dependance Deluxe", "description": "Camere spaziose con arredi antichi, travi a vista e accesso privato al giardino.", "category": "dependance-deluxe", "columns": 4}},
      {"id": "gallery-economy", "type": "villa_room_gallery", "data": {"title": "Economy Accesso Privato", "description": "Camere accoglienti e funzionali con accesso privato indipendente.", "category": "economy-private-access", "columns": 4}},
      {"id": "cta-1", "type": "villa_cta_icons", "data": {"lang": "it"}},
      {"id": "features-1", "type": "villa_three_features", "data": {"lang": "it"}}
    ]'::jsonb,
    NOW()
  )
  ON CONFLICT (property_id, slug) DO NOTHING;

  RAISE NOTICE 'Migrazione completata per property_id: %', v_property_id;
END $$;
