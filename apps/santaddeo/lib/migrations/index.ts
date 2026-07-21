/**
 * Database Migration System
 * 
 * Each migration has a unique ID and SQL statements.
 * Migrations are applied in order and tracked in a `_migrations` table.
 * When v0 creates a new migration, it's added here and automatically
 * applied to BOTH PROD and DEV databases.
 */

export interface Migration {
  id: string          // Unique ID, e.g. "2026-03-22-001"
  description: string // Human-readable description
  sql: string         // SQL to execute
}

/**
 * All migrations in chronological order.
 * NEW MIGRATIONS MUST BE APPENDED AT THE END.
 */
export const migrations: Migration[] = [
  {
    id: "2026-03-22-001",
    description: "Create _migrations tracking table",
    sql: `
      CREATE TABLE IF NOT EXISTS _migrations (
        id TEXT PRIMARY KEY,
        description TEXT,
        applied_at TIMESTAMPTZ DEFAULT now()
      );
    `
  },
  {
    id: "2026-03-22-002",
    description: "Add latitude/longitude columns to hotels",
    sql: `
      ALTER TABLE hotels ADD COLUMN IF NOT EXISTS latitude NUMERIC;
      ALTER TABLE hotels ADD COLUMN IF NOT EXISTS longitude NUMERIC;
    `
  },
  {
    id: "2026-03-22-003",
    description: "Add province, cap, star_rating, accommodation_type, show_motivational_splash to hotels",
    sql: `
      ALTER TABLE hotels ADD COLUMN IF NOT EXISTS province TEXT;
      ALTER TABLE hotels ADD COLUMN IF NOT EXISTS cap TEXT;
      ALTER TABLE hotels ADD COLUMN IF NOT EXISTS star_rating TEXT;
      DO $$ BEGIN
        ALTER TABLE hotels ADD COLUMN accommodation_type TEXT NOT NULL DEFAULT 'camere';
      EXCEPTION WHEN duplicate_column THEN NULL; END $$;
      DO $$ BEGIN
        ALTER TABLE hotels ADD COLUMN show_motivational_splash BOOLEAN NOT NULL DEFAULT true;
      EXCEPTION WHEN duplicate_column THEN NULL; END $$;
    `
  },
  {
    id: "2026-03-22-004",
    description: "Add settings_locked fields to hotels",
    sql: `
      ALTER TABLE hotels ADD COLUMN IF NOT EXISTS settings_locked BOOLEAN DEFAULT false;
      ALTER TABLE hotels ADD COLUMN IF NOT EXISTS settings_locked_at TIMESTAMPTZ;
      ALTER TABLE hotels ADD COLUMN IF NOT EXISTS settings_locked_by UUID;
      ALTER TABLE hotels ADD COLUMN IF NOT EXISTS pricing_config_id UUID;
    `
  },
  {
    id: "2026-03-22-005",
    description: "Add Google Maps/Places fields to hotels",
    sql: `
      ALTER TABLE hotels ADD COLUMN IF NOT EXISTS google_maps_place_id TEXT;
      ALTER TABLE hotels ADD COLUMN IF NOT EXISTS google_maps_place_name TEXT;
      ALTER TABLE hotels ADD COLUMN IF NOT EXISTS google_maps_place_address TEXT;
      ALTER TABLE hotels ADD COLUMN IF NOT EXISTS google_maps_url TEXT;
      ALTER TABLE hotels ADD COLUMN IF NOT EXISTS google_places_api_key TEXT;
    `
  },
  {
    id: "2026-03-22-006",
    description: "Add is_locked column to pricing_variables",
    sql: `
      ALTER TABLE pricing_variables ADD COLUMN IF NOT EXISTS is_locked BOOLEAN DEFAULT false;
    `
  },
  {
    id: "2026-03-22-007",
    description: "Create pricing_algo_params table",
    sql: `
      CREATE TABLE IF NOT EXISTS pricing_algo_params (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        hotel_id UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
        param_key TEXT NOT NULL,
        param_value TEXT NOT NULL DEFAULT '0',
        date DATE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_pricing_algo_params_hotel_date 
        ON pricing_algo_params(hotel_id, date);
      CREATE INDEX IF NOT EXISTS idx_pricing_algo_params_hotel_key_date 
        ON pricing_algo_params(hotel_id, param_key, date);
    `
  },
  {
    id: "2026-03-22-008",
    description: "Create weather_forecasts table",
    sql: `
      CREATE TABLE IF NOT EXISTS weather_forecasts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        hotel_id UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
        date DATE NOT NULL,
        weather_score INTEGER NOT NULL,
        temperature_min NUMERIC,
        temperature_max NUMERIC,
        weather_code TEXT,
        weather_description TEXT,
        precipitation_probability INTEGER,
        raw_data JSONB,
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now(),
        UNIQUE(hotel_id, date)
      );
      CREATE INDEX IF NOT EXISTS idx_weather_forecasts_hotel_date 
        ON weather_forecasts(hotel_id, date);
    `
  },
  {
    id: "2026-03-22-009",
    description: "Create weather_history table",
    sql: `
      CREATE TABLE IF NOT EXISTS weather_history (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        hotel_id UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
        date DATE NOT NULL,
        temperature NUMERIC,
        feels_like NUMERIC,
        temp_min NUMERIC,
        temp_max NUMERIC,
        humidity INTEGER,
        pressure INTEGER,
        wind_speed NUMERIC,
        clouds INTEGER,
        weather_main TEXT,
        weather_description TEXT,
        weather_icon TEXT,
        source TEXT DEFAULT 'api',
        created_at TIMESTAMPTZ DEFAULT now(),
        updated_at TIMESTAMPTZ DEFAULT now(),
        UNIQUE(hotel_id, date)
      );
      CREATE INDEX IF NOT EXISTS idx_weather_history_hotel_date 
        ON weather_history(hotel_id, date);
    `
  },
  {
    id: "2026-03-22-010",
    description: "Create connectors schema and tables",
    sql: `CREATE SCHEMA IF NOT EXISTS connectors;
      GRANT USAGE ON SCHEMA connectors TO anon, authenticated, service_role;
      ALTER DEFAULT PRIVILEGES IN SCHEMA connectors GRANT ALL ON TABLES TO anon, authenticated, service_role;
      CREATE TABLE IF NOT EXISTS connectors.scidoo_raw_fiscal_production (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(), hotel_id UUID NOT NULL, pms_integration_id UUID NOT NULL,
        raw_data JSONB NOT NULL, date DATE, total_revenue NUMERIC NOT NULL DEFAULT 0,
        synced_at TIMESTAMPTZ DEFAULT now(), processed BOOLEAN DEFAULT false, processed_at TIMESTAMPTZ,
        processing_error TEXT, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS connectors.scidoo_raw_bookings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(), hotel_id UUID NOT NULL, pms_integration_id UUID NOT NULL,
        raw_data JSONB NOT NULL, scidoo_booking_id TEXT, scidoo_reservation_number TEXT,
        booking_date DATE, checkin_date DATE, checkout_date DATE, status TEXT,
        synced_at TIMESTAMPTZ DEFAULT now(), processed BOOLEAN DEFAULT false, processed_at TIMESTAMPTZ,
        processing_error TEXT, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
      );
      CREATE TABLE IF NOT EXISTS connectors.sync_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(), hotel_id UUID NOT NULL, pms_integration_id UUID NOT NULL,
        sync_type TEXT NOT NULL, pms_name TEXT NOT NULL, endpoint TEXT NOT NULL, request_params JSONB,
        response_status INTEGER, response_body JSONB, records_fetched INTEGER DEFAULT 0,
        records_inserted INTEGER DEFAULT 0, records_updated INTEGER DEFAULT 0, records_failed INTEGER DEFAULT 0,
        status TEXT NOT NULL, error_message TEXT, started_at TIMESTAMPTZ DEFAULT now(), completed_at TIMESTAMPTZ,
        duration_ms INTEGER, created_at TIMESTAMPTZ DEFAULT now()
      );
      GRANT ALL ON ALL TABLES IN SCHEMA connectors TO anon, authenticated, service_role;`
  },
]
