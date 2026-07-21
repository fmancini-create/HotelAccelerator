-- =====================================================
-- SCRIPT: Allineamento Schema DEV a PROD
-- Database: dshdmkmhhbjractpvojp (DEV)
-- Data: 2026-03-15
-- =====================================================
-- Eseguire su DEV (dshdmkmhhbjractpvojp)
-- =====================================================

-- =====================================================
-- PARTE 1: CREARE LE 8 TABELLE MANCANTI IN DEV
-- =====================================================

-- 1. info_requests
CREATE TABLE IF NOT EXISTS info_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  hotel_name TEXT NOT NULL,
  message TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  processed BOOLEAN DEFAULT false,
  processed_at TIMESTAMPTZ,
  notes TEXT
);

-- 2. last_minute_level_templates
CREATE TABLE IF NOT EXISTS last_minute_level_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_name TEXT NOT NULL,
  description TEXT,
  levels JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

-- 3. last_sent_prices
CREATE TABLE IF NOT EXISTS last_sent_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id UUID NOT NULL,
  room_type_id UUID NOT NULL,
  rate_id UUID NOT NULL,
  occupancy INTEGER NOT NULL DEFAULT 2,
  target_date DATE NOT NULL,
  last_price NUMERIC NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source TEXT NOT NULL DEFAULT 'manual_grid'
);

-- Unique constraint per evitare duplicati
CREATE UNIQUE INDEX IF NOT EXISTS last_sent_prices_unique_idx 
ON last_sent_prices (hotel_id, room_type_id, rate_id, occupancy, target_date);

-- 4. price_guard_checks
CREATE TABLE IF NOT EXISTS price_guard_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id UUID NOT NULL,
  booking_id TEXT,
  booking_date TIMESTAMPTZ,
  checkin_date DATE,
  room_type_id UUID,
  rate_id UUID,
  occupancy INTEGER DEFAULT 2,
  booked_price NUMERIC,
  expected_price NUMERIC,
  difference_pct NUMERIC,
  tolerance_pct NUMERIC DEFAULT 5.0,
  result TEXT NOT NULL DEFAULT 'ok',
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. price_push_log
CREATE TABLE IF NOT EXISTS price_push_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id UUID NOT NULL,
  push_method TEXT NOT NULL DEFAULT 'scidoo_api',
  status TEXT NOT NULL DEFAULT 'pending',
  total_prices INTEGER NOT NULL DEFAULT 0,
  success_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  errors JSONB DEFAULT '[]'::jsonb,
  details JSONB DEFAULT '{}'::jsonb,
  triggered_by TEXT DEFAULT 'manual',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. pricing_recalc_queue
CREATE TABLE IF NOT EXISTS pricing_recalc_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id UUID NOT NULL,
  triggered_by_user_id UUID,
  trigger_type TEXT NOT NULL DEFAULT 'algo_param_change',
  trigger_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  date_range_start DATE NOT NULL,
  date_range_end DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  processing_started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  affected_price_changes_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. rms_department_revenue
CREATE TABLE IF NOT EXISTS rms_department_revenue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id UUID NOT NULL,
  date DATE NOT NULL,
  department_name TEXT NOT NULL,
  revenue NUMERIC(12,2) NOT NULL DEFAULT 0,
  document_type TEXT,
  document_count INTEGER DEFAULT 0,
  taxable_amount NUMERIC(12,2),
  source TEXT NOT NULL DEFAULT 'pms',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Unique constraint per evitare duplicati
CREATE UNIQUE INDEX IF NOT EXISTS rms_department_revenue_unique_idx 
ON rms_department_revenue (hotel_id, date, department_name, source);

-- 8. scidoo_raw_fiscal_production_legacy
CREATE TABLE IF NOT EXISTS scidoo_raw_fiscal_production_legacy (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id UUID NOT NULL,
  date DATE NOT NULL,
  document_type TEXT NOT NULL,
  document_id TEXT NOT NULL,
  document_name TEXT,
  document_date DATE,
  total NUMERIC(12,2),
  holder_name TEXT,
  account_revenues JSONB,
  payment_methods JSONB,
  raw_data JSONB,
  synced_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  pms_integration_id UUID,
  processed BOOLEAN DEFAULT false,
  processed_at TIMESTAMPTZ,
  processing_error TEXT
);

-- Unique constraint per evitare duplicati
CREATE UNIQUE INDEX IF NOT EXISTS scidoo_raw_fiscal_production_legacy_unique_idx 
ON scidoo_raw_fiscal_production_legacy (hotel_id, date, document_type, document_id);

-- =====================================================
-- PARTE 2: AGGIUNGERE COLONNE MANCANTI ALLE TABELLE ESISTENTI
-- =====================================================

-- autopilot_configs: +2 colonne
ALTER TABLE autopilot_configs 
  ADD COLUMN IF NOT EXISTS last_full_sync_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS guard_tolerance_pct NUMERIC DEFAULT 5.0;

-- hotels: +1 colonna
ALTER TABLE hotels 
  ADD COLUMN IF NOT EXISTS show_motivational_splash BOOLEAN NOT NULL DEFAULT true;

-- platform_api_keys: +1 colonna
ALTER TABLE platform_api_keys 
  ADD COLUMN IF NOT EXISTS key_encrypted TEXT;

-- price_change_log: +1 colonna
ALTER TABLE price_change_log 
  ADD COLUMN IF NOT EXISTS action_taken TEXT DEFAULT 'none';

-- pricing_grid: +3 colonne
ALTER TABLE pricing_grid 
  ADD COLUMN IF NOT EXISTS is_never_set BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS first_set_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_change_source TEXT NOT NULL DEFAULT 'manual';

-- =====================================================
-- PARTE 3: FIX CONSTRAINTS NOT NULL (PROD ha constraints piu' stretti)
-- =====================================================

-- autopilot_configs
ALTER TABLE autopilot_configs ALTER COLUMN id SET NOT NULL;
ALTER TABLE autopilot_configs ALTER COLUMN hotel_id SET NOT NULL;
ALTER TABLE autopilot_configs ALTER COLUMN mode SET NOT NULL;

-- platform_api_keys
ALTER TABLE platform_api_keys ALTER COLUMN id SET NOT NULL;
ALTER TABLE platform_api_keys ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE platform_api_keys ALTER COLUMN name SET NOT NULL;
ALTER TABLE platform_api_keys ALTER COLUMN key_hash SET NOT NULL;
ALTER TABLE platform_api_keys ALTER COLUMN key_prefix SET NOT NULL;
ALTER TABLE platform_api_keys ALTER COLUMN scopes SET NOT NULL;
ALTER TABLE platform_api_keys ALTER COLUMN is_active SET NOT NULL;
ALTER TABLE platform_api_keys ALTER COLUMN rate_limit_per_minute SET NOT NULL;
ALTER TABLE platform_api_keys ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE platform_api_keys ALTER COLUMN updated_at SET NOT NULL;

-- price_change_log
ALTER TABLE price_change_log ALTER COLUMN id SET NOT NULL;
ALTER TABLE price_change_log ALTER COLUMN hotel_id SET NOT NULL;
ALTER TABLE price_change_log ALTER COLUMN room_type_id SET NOT NULL;
ALTER TABLE price_change_log ALTER COLUMN rate_id SET NOT NULL;
ALTER TABLE price_change_log ALTER COLUMN occupancy SET NOT NULL;
ALTER TABLE price_change_log ALTER COLUMN target_date SET NOT NULL;
ALTER TABLE price_change_log ALTER COLUMN new_price SET NOT NULL;
ALTER TABLE price_change_log ALTER COLUMN changed_at SET NOT NULL;

-- pricing_grid
ALTER TABLE pricing_grid ALTER COLUMN id SET NOT NULL;
ALTER TABLE pricing_grid ALTER COLUMN hotel_id SET NOT NULL;
ALTER TABLE pricing_grid ALTER COLUMN room_type_id SET NOT NULL;
ALTER TABLE pricing_grid ALTER COLUMN rate_id SET NOT NULL;
ALTER TABLE pricing_grid ALTER COLUMN occupancy SET NOT NULL;
ALTER TABLE pricing_grid ALTER COLUMN date SET NOT NULL;
ALTER TABLE pricing_grid ALTER COLUMN price SET NOT NULL;
ALTER TABLE pricing_grid ALTER COLUMN is_manual SET NOT NULL;
ALTER TABLE pricing_grid ALTER COLUMN created_at SET NOT NULL;
ALTER TABLE pricing_grid ALTER COLUMN updated_at SET NOT NULL;

-- =====================================================
-- VERIFICA FINALE
-- =====================================================
SELECT 
  'Tabelle totali' as check_type,
  COUNT(*) as count
FROM information_schema.tables 
WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
