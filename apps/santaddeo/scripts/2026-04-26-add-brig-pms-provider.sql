-- ============================================================================
-- 2026-04-26 — Aggiunge BRiG come pms_provider
-- ============================================================================
-- BRiG è un bridge unico verso 10+ PMS. Diventa un provider di prima classe
-- in pms_providers, così può essere selezionato nei bindings degli hotel
-- esattamente come Scidoo/Mews/ecc.
--
-- Idempotente: ON CONFLICT (code) DO UPDATE garantisce che ri-eseguire lo
-- script aggiorni i campi senza creare duplicati.
-- ============================================================================

INSERT INTO public.pms_providers (
  name,
  code,
  description,
  website,
  api_base_url,
  api_extra_config,
  connection_status,
  is_active,
  has_webhook,
  has_versioning,
  has_delta_sync,
  has_last_modified,
  requires_full_historization,
  sync_strategy,
  available_entities
) VALUES (
  'BRiG',
  'brig',
  'Bridge unico verso 10+ PMS (Bedzzle, Cloudbeds, Mews, Octorate, Apaleo, Opera, Passepartout, 5stelle, Slope, Zak, HotelCube). Una sola integrazione API per tutti.',
  'https://www.brig.cloud/',
  'https://brig-service-dot-brig-400706.ew.r.appspot.com',
  jsonb_build_object(
    'auth_method', 'header_x_api_key',
    'structure_id_param', 'sid',
    'rate_limit_reservations_per_day', 100,
    'rate_limit_reservations_per_request', 100,
    'sub_pms_supported', jsonb_build_array(
      'bedzzle', '5stelle', 'cloudbeds', 'hotelcube', 'mews',
      'octorate', 'opera', 'passepartout', 'slope', 'zak', 'apaleo'
    )
  ),
  'configured',  -- baseUrl noto, l'apikey verrà inserita per-hotel nel binding
  true,
  false,         -- BRiG non ha webhook push
  false,
  false,         -- pull-only, niente delta sync nativo
  false,
  true,          -- per ora full historization, come gli altri provider
  'full',
  '["reservation","room_type","rate_plan","ota_code"]'::jsonb
)
ON CONFLICT (code) DO UPDATE SET
  name                       = EXCLUDED.name,
  description                = EXCLUDED.description,
  website                    = EXCLUDED.website,
  api_base_url               = EXCLUDED.api_base_url,
  api_extra_config           = EXCLUDED.api_extra_config,
  is_active                  = EXCLUDED.is_active,
  available_entities         = EXCLUDED.available_entities,
  updated_at                 = now();

-- Log riassuntivo
DO $$
DECLARE
  v_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.pms_providers WHERE code = 'brig';
  RAISE NOTICE 'BRiG provider id: %', v_id;
END $$;
