import { createServiceRoleClient } from "@/lib/supabase/server"
import { requireSuperAdmin } from "@/lib/auth/requireSuperAdmin"
import { NextResponse } from "next/server"

// BUG FIX 30/04/2026: l'endpoint era pubblico. Anche se eseguiva solo
// script da una mappa hardcoded (non SQL arbitrario), gli script
// modificavano lo schema (CREATE TABLE/POLICY/INDEX) e quindi vanno
// limitati a super_admin.
const SQL_SCRIPTS: Record<string, string> = {
  "scripts/001_create_exec_sql_function.sql": `CREATE OR REPLACE FUNCTION public.exec_sql(sql_query TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  EXECUTE sql_query;
  RETURN 'OK';
EXCEPTION
  WHEN OTHERS THEN
    RETURN 'ERROR: ' || SQLERRM;
END;
$$;

GRANT EXECUTE ON FUNCTION public.exec_sql(TEXT) TO service_role;

COMMENT ON FUNCTION public.exec_sql IS 'Executes arbitrary SQL statements. Used by migration scripts. SECURITY DEFINER allows service role to execute with elevated privileges.';`,

  "scripts/000_setup_unified.sql": `CREATE SCHEMA IF NOT EXISTS connectors;
GRANT USAGE ON SCHEMA connectors TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA connectors TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA connectors TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA connectors TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA connectors GRANT ALL ON TABLES TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA connectors GRANT ALL ON SEQUENCES TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA connectors GRANT ALL ON FUNCTIONS TO postgres, anon, authenticated, service_role;
COMMENT ON SCHEMA connectors IS 'Raw data staging area for PMS integrations (DB_CONNETTORI)';
CREATE TABLE IF NOT EXISTS connectors.scidoo_raw_bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hotel_id UUID NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
    pms_integration_id UUID NOT NULL REFERENCES public.pms_integrations(id) ON DELETE CASCADE,
    raw_data JSONB NOT NULL,
    scidoo_booking_id TEXT,
    scidoo_reservation_number TEXT,
    booking_date DATE,
    checkin_date DATE,
    checkout_date DATE,
    status TEXT,
    synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    processed BOOLEAN DEFAULT FALSE,
    processed_at TIMESTAMP WITH TIME ZONE,
    processing_error TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT unique_scidoo_booking UNIQUE(hotel_id, scidoo_booking_id)
);
CREATE INDEX IF NOT EXISTS idx_scidoo_raw_bookings_hotel ON connectors.scidoo_raw_bookings(hotel_id);
CREATE INDEX IF NOT EXISTS idx_scidoo_raw_bookings_processed ON connectors.scidoo_raw_bookings(processed);
CREATE INDEX IF NOT EXISTS idx_scidoo_raw_bookings_dates ON connectors.scidoo_raw_bookings(checkin_date, checkout_date);
CREATE INDEX IF NOT EXISTS idx_scidoo_raw_bookings_synced ON connectors.scidoo_raw_bookings(synced_at);
CREATE TABLE IF NOT EXISTS connectors.scidoo_raw_availability (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hotel_id UUID NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
    pms_integration_id UUID NOT NULL REFERENCES public.pms_integrations(id) ON DELETE CASCADE,
    raw_data JSONB NOT NULL,
    scidoo_room_type_id TEXT,
    date DATE,
    rooms_available INTEGER,
    synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    processed BOOLEAN DEFAULT FALSE,
    processed_at TIMESTAMP WITH TIME ZONE,
    processing_error TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT unique_scidoo_availability UNIQUE(hotel_id, scidoo_room_type_id, date)
);
CREATE INDEX IF NOT EXISTS idx_scidoo_raw_availability_hotel ON connectors.scidoo_raw_availability(hotel_id);
CREATE INDEX IF NOT EXISTS idx_scidoo_raw_availability_processed ON connectors.scidoo_raw_availability(processed);
CREATE INDEX IF NOT EXISTS idx_scidoo_raw_availability_date ON connectors.scidoo_raw_availability(date);
CREATE TABLE IF NOT EXISTS connectors.scidoo_raw_rates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hotel_id UUID NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
    pms_integration_id UUID NOT NULL REFERENCES public.pms_integrations(id) ON DELETE CASCADE,
    raw_data JSONB NOT NULL,
    scidoo_rate_id TEXT,
    scidoo_room_type_id TEXT,
    date DATE,
    price NUMERIC(10,2),
    synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    processed BOOLEAN DEFAULT FALSE,
    processed_at TIMESTAMP WITH TIME ZONE,
    processing_error TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT unique_scidoo_rate UNIQUE(hotel_id, scidoo_rate_id, scidoo_room_type_id, date)
);
CREATE INDEX IF NOT EXISTS idx_scidoo_raw_rates_hotel ON connectors.scidoo_raw_rates(hotel_id);
CREATE INDEX IF NOT EXISTS idx_scidoo_raw_rates_processed ON connectors.scidoo_raw_rates(processed);
CREATE INDEX IF NOT EXISTS idx_scidoo_raw_rates_date ON connectors.scidoo_raw_rates(date);
CREATE TABLE IF NOT EXISTS connectors.scidoo_raw_fiscal_production (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hotel_id UUID NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
    pms_integration_id UUID NOT NULL REFERENCES public.pms_integrations(id) ON DELETE CASCADE,
    raw_data JSONB NOT NULL,
    date DATE,
    total_revenue NUMERIC(10,2),
    synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    processed BOOLEAN DEFAULT FALSE,
    processed_at TIMESTAMP WITH TIME ZONE,
    processing_error TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT unique_scidoo_fiscal_production UNIQUE(hotel_id, date)
);
CREATE INDEX IF NOT EXISTS idx_scidoo_raw_fiscal_hotel ON connectors.scidoo_raw_fiscal_production(hotel_id);
CREATE INDEX IF NOT EXISTS idx_scidoo_raw_fiscal_processed ON connectors.scidoo_raw_fiscal_production(processed);
CREATE INDEX IF NOT EXISTS idx_scidoo_raw_fiscal_date ON connectors.scidoo_raw_fiscal_production(date);
CREATE TABLE IF NOT EXISTS connectors.scidoo_raw_room_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id UUID NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
  pms_integration_id UUID NOT NULL REFERENCES public.pms_integrations(id) ON DELETE CASCADE,
  raw_data JSONB NOT NULL,
  scidoo_room_type_id TEXT NOT NULL,
  name TEXT,
  description TEXT,
  size NUMERIC,
  capacity INTEGER,
  capacity_default INTEGER,
  additional_beds INTEGER,
  rooms INTEGER,
  active_flag BOOLEAN DEFAULT true,
  synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  processed BOOLEAN DEFAULT false,
  processed_at TIMESTAMP WITH TIME ZONE,
  processing_error TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(hotel_id, scidoo_room_type_id)
);
CREATE INDEX IF NOT EXISTS idx_scidoo_room_types_hotel ON connectors.scidoo_raw_room_types(hotel_id);
CREATE INDEX IF NOT EXISTS idx_scidoo_room_types_processed ON connectors.scidoo_raw_room_types(processed);
CREATE TABLE IF NOT EXISTS connectors.scidoo_raw_minstay (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id UUID NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
  pms_integration_id UUID NOT NULL REFERENCES public.pms_integrations(id) ON DELETE CASCADE,
  raw_data JSONB NOT NULL,
  scidoo_room_type_id TEXT NOT NULL,
  scidoo_rate_id TEXT,
  date DATE NOT NULL,
  minstay INTEGER,
  cta BOOLEAN DEFAULT false,
  ctd BOOLEAN DEFAULT false,
  synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  processed BOOLEAN DEFAULT false,
  processed_at TIMESTAMP WITH TIME ZONE,
  processing_error TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(hotel_id, scidoo_room_type_id, scidoo_rate_id, date)
);
CREATE INDEX IF NOT EXISTS idx_scidoo_minstay_hotel_date ON connectors.scidoo_raw_minstay(hotel_id, date);
CREATE INDEX IF NOT EXISTS idx_scidoo_minstay_processed ON connectors.scidoo_raw_minstay(processed);
CREATE TABLE IF NOT EXISTS connectors.sync_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hotel_id UUID NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
    pms_integration_id UUID NOT NULL REFERENCES public.pms_integrations(id) ON DELETE CASCADE,
    sync_type TEXT NOT NULL,
    pms_name TEXT NOT NULL,
    endpoint TEXT NOT NULL,
    request_params JSONB,
    response_status INTEGER,
    response_body JSONB,
    records_fetched INTEGER DEFAULT 0,
    records_inserted INTEGER DEFAULT 0,
    records_updated INTEGER DEFAULT 0,
    records_failed INTEGER DEFAULT 0,
    status TEXT NOT NULL,
    error_message TEXT,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    duration_ms INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sync_logs_hotel ON connectors.sync_logs(hotel_id);
CREATE INDEX IF NOT EXISTS idx_sync_logs_pms ON connectors.sync_logs(pms_integration_id);
CREATE INDEX IF NOT EXISTS idx_sync_logs_type ON connectors.sync_logs(sync_type);
CREATE INDEX IF NOT EXISTS idx_sync_logs_status ON connectors.sync_logs(status);
CREATE INDEX IF NOT EXISTS idx_sync_logs_started ON connectors.sync_logs(started_at);
CREATE TABLE IF NOT EXISTS public.etl_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hotel_id UUID NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
    job_type TEXT NOT NULL,
    source_schema TEXT NOT NULL DEFAULT 'connectors',
    target_schema TEXT NOT NULL DEFAULT 'public',
    date_from DATE,
    date_to DATE,
    status TEXT NOT NULL DEFAULT 'pending',
    records_processed INTEGER DEFAULT 0,
    records_inserted INTEGER DEFAULT 0,
    records_updated INTEGER DEFAULT 0,
    records_skipped INTEGER DEFAULT 0,
    records_failed INTEGER DEFAULT 0,
    error_message TEXT,
    error_details JSONB,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    duration_ms INTEGER,
    triggered_by TEXT,
    triggered_by_user UUID REFERENCES public.profiles(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_etl_jobs_hotel ON public.etl_jobs(hotel_id);
CREATE INDEX IF NOT EXISTS idx_etl_jobs_status ON public.etl_jobs(status);
CREATE INDEX IF NOT EXISTS idx_etl_jobs_type ON public.etl_jobs(job_type);
CREATE INDEX IF NOT EXISTS idx_etl_jobs_started ON public.etl_jobs(started_at);
CREATE TABLE IF NOT EXISTS public.etl_errors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    etl_job_id UUID NOT NULL REFERENCES public.etl_jobs(id) ON DELETE CASCADE,
    source_table TEXT NOT NULL,
    source_record_id UUID,
    target_table TEXT,
    error_type TEXT NOT NULL,
    error_message TEXT NOT NULL,
    error_details JSONB,
    raw_data JSONB,
    resolved BOOLEAN DEFAULT FALSE,
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolved_by UUID REFERENCES public.profiles(id),
    resolution_notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_etl_errors_job ON public.etl_errors(etl_job_id);
CREATE INDEX IF NOT EXISTS idx_etl_errors_resolved ON public.etl_errors(resolved);
CREATE INDEX IF NOT EXISTS idx_etl_errors_type ON public.etl_errors(error_type);
CREATE TABLE IF NOT EXISTS public.bookings_full (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id UUID NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
  booking_id TEXT NOT NULL,
  guest_name TEXT,
  guest_email TEXT,
  check_in DATE NOT NULL,
  check_out DATE NOT NULL,
  room_type TEXT,
  num_guests INTEGER,
  total_amount DECIMAL(10,2),
  currency TEXT DEFAULT 'EUR',
  status TEXT CHECK (status IN ('confirmed', 'cancelled', 'pending', 'checked_in', 'checked_out')),
  source TEXT,
  raw_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(hotel_id, booking_id, source)
);
CREATE INDEX IF NOT EXISTS idx_bookings_full_hotel_id ON public.bookings_full(hotel_id);
CREATE INDEX IF NOT EXISTS idx_bookings_full_check_in ON public.bookings_full(check_in);
CREATE INDEX IF NOT EXISTS idx_bookings_full_check_out ON public.bookings_full(check_out);
CREATE INDEX IF NOT EXISTS idx_bookings_full_status ON public.bookings_full(status);
CREATE TABLE IF NOT EXISTS public.daily_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id UUID NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
  room_type TEXT NOT NULL,
  date DATE NOT NULL,
  base_rate DECIMAL(10,2),
  suggested_rate DECIMAL(10,2),
  applied_rate DECIMAL(10,2),
  currency TEXT DEFAULT 'EUR',
  min_stay INTEGER DEFAULT 1,
  max_stay INTEGER,
  restrictions JSONB DEFAULT '{}'::jsonb,
  source TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(hotel_id, room_type, date)
);
CREATE INDEX IF NOT EXISTS idx_daily_rates_hotel_id ON public.daily_rates(hotel_id);
CREATE INDEX IF NOT EXISTS idx_daily_rates_date ON public.daily_rates(date);
CREATE INDEX IF NOT EXISTS idx_daily_rates_room_type ON public.daily_rates(room_type);
ALTER TABLE public.etl_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin can view ETL jobs" ON public.etl_jobs FOR SELECT USING (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('system_admin', 'villa_admin')));
ALTER TABLE public.etl_errors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin can view ETL errors" ON public.etl_errors FOR SELECT USING (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('system_admin', 'villa_admin')));
ALTER TABLE public.bookings_full ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view bookings for their hotel" ON public.bookings_full FOR SELECT USING (hotel_id IN (SELECT h.id FROM public.hotels h INNER JOIN public.profiles p ON p.organization_id = h.organization_id WHERE p.id = auth.uid()));
ALTER TABLE public.daily_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view rates for their hotel" ON public.daily_rates FOR SELECT USING (hotel_id IN (SELECT h.id FROM public.hotels h INNER JOIN public.profiles p ON p.organization_id = h.organization_id WHERE p.id = auth.uid()));
CREATE POLICY "Users can update rates for their hotel" ON public.daily_rates FOR UPDATE USING (hotel_id IN (SELECT h.id FROM public.hotels h INNER JOIN public.profiles p ON p.organization_id = h.organization_id WHERE p.id = auth.uid()));
CREATE OR REPLACE FUNCTION update_updated_at_column() RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER update_bookings_full_updated_at BEFORE UPDATE ON public.bookings_full FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_daily_rates_updated_at BEFORE UPDATE ON public.daily_rates FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();`,

  "scripts/002_add_organizations_type.sql": `ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS type TEXT;
UPDATE public.organizations SET type = 'hotel' WHERE type IS NULL;
ALTER TABLE public.organizations ALTER COLUMN type SET NOT NULL;
ALTER TABLE public.organizations DROP CONSTRAINT IF EXISTS organizations_type_check;
ALTER TABLE public.organizations ADD CONSTRAINT organizations_type_check CHECK (type IN ('hotel', 'hotel_group', 'consultant'));
CREATE INDEX IF NOT EXISTS idx_organizations_type ON public.organizations(type);
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS company_name TEXT;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS vat_number TEXT;
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();
CREATE OR REPLACE FUNCTION update_updated_at_column() RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ language 'plpgsql';
DROP TRIGGER IF EXISTS update_organizations_updated_at ON public.organizations;
CREATE TRIGGER update_organizations_updated_at BEFORE UPDATE ON public.organizations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();`,

  "scripts/008_create_etl_and_missing_tables.sql": `CREATE TABLE IF NOT EXISTS public.etl_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name TEXT NOT NULL,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  status TEXT CHECK (status IN ('running', 'completed', 'failed', 'cancelled')),
  records_processed INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_etl_jobs_started_at ON public.etl_jobs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_etl_jobs_status ON public.etl_jobs(status);
CREATE TABLE IF NOT EXISTS public.etl_errors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID REFERENCES public.etl_jobs(id) ON DELETE CASCADE,
  occurred_at TIMESTAMPTZ DEFAULT NOW(),
  error_type TEXT,
  message TEXT NOT NULL,
  stacktrace TEXT,
  context JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_etl_errors_job_id ON public.etl_errors(job_id);
CREATE INDEX IF NOT EXISTS idx_etl_errors_occurred_at ON public.etl_errors(occurred_at DESC);
CREATE TABLE IF NOT EXISTS public.bookings_full (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id UUID NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
  booking_id TEXT NOT NULL,
  guest_name TEXT,
  guest_email TEXT,
  check_in DATE NOT NULL,
  check_out DATE NOT NULL,
  room_type TEXT,
  num_guests INTEGER,
  total_amount DECIMAL(10,2),
  currency TEXT DEFAULT 'EUR',
  status TEXT CHECK (status IN ('confirmed', 'cancelled', 'pending', 'checked_in', 'checked_out')),
  source TEXT,
  raw_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(hotel_id, booking_id, source)
);
CREATE INDEX IF NOT EXISTS idx_bookings_full_hotel_id ON public.bookings_full(hotel_id);
CREATE INDEX IF NOT EXISTS idx_bookings_full_check_in ON public.bookings_full(check_in);
CREATE INDEX IF NOT EXISTS idx_bookings_full_check_out ON public.bookings_full(check_out);
CREATE INDEX IF NOT EXISTS idx_bookings_full_status ON public.bookings_full(status);
CREATE TABLE IF NOT EXISTS public.daily_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id UUID NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
  room_type TEXT NOT NULL,
  date DATE NOT NULL,
  base_rate DECIMAL(10,2),
  suggested_rate DECIMAL(10,2),
  applied_rate DECIMAL(10,2),
  currency TEXT DEFAULT 'EUR',
  min_stay INTEGER DEFAULT 1,
  max_stay INTEGER,
  restrictions JSONB DEFAULT '{}'::jsonb,
  source TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(hotel_id, room_type, date)
);
CREATE INDEX IF NOT EXISTS idx_daily_rates_hotel_id ON public.daily_rates(hotel_id);
CREATE INDEX IF NOT EXISTS idx_daily_rates_date ON public.daily_rates(date);
CREATE INDEX IF NOT EXISTS idx_daily_rates_room_type ON public.daily_rates(room_type);
ALTER TABLE public.etl_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin can view ETL jobs" ON public.etl_jobs FOR SELECT USING (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('system_admin', 'villa_admin')));
ALTER TABLE public.etl_errors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin can view ETL errors" ON public.etl_errors FOR SELECT USING (EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = auth.uid() AND profiles.role IN ('system_admin', 'villa_admin')));
ALTER TABLE public.bookings_full ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view bookings for their hotel" ON public.bookings_full FOR SELECT USING (hotel_id IN (SELECT h.id FROM public.hotels h INNER JOIN public.profiles p ON p.organization_id = h.organization_id WHERE p.id = auth.uid()));
ALTER TABLE public.daily_rates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view rates for their hotel" ON public.daily_rates FOR SELECT USING (hotel_id IN (SELECT h.id FROM public.hotels h INNER JOIN public.profiles p ON p.organization_id = h.organization_id WHERE p.id = auth.uid()));
CREATE POLICY "Users can update rates for their hotel" ON public.daily_rates FOR UPDATE USING (hotel_id IN (SELECT h.id FROM public.hotels h INNER JOIN public.profiles p ON p.organization_id = h.organization_id WHERE p.id = auth.uid()));
CREATE OR REPLACE FUNCTION update_updated_at_column() RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER update_bookings_full_updated_at BEFORE UPDATE ON public.bookings_full FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_daily_rates_updated_at BEFORE UPDATE ON public.daily_rates FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();`,

  "scripts/fix-availability-mapping.sql": `SELECT DISTINCT raw_data->>'room_type_id' as scidoo_room_type_id, COUNT(*) as record_count, SUM((raw_data->>'available_count')::int) as total_available FROM connectors.scidoo_raw_availability WHERE (raw_data->>'available_count')::int > 0 GROUP BY raw_data->>'room_type_id' ORDER BY total_available DESC;
SELECT id, name, scidoo_room_type_id, active_flag FROM connectors.scidoo_raw_room_types WHERE hotel_id = 'b1aa5d38-a044-475c-8d64-6b8f93045395' ORDER BY name;
SELECT DISTINCT raw_data->>'room_type_id' as missing_scidoo_id, COUNT(*) as affected_records FROM connectors.scidoo_raw_availability WHERE (raw_data->>'available_count')::int > 0 AND raw_data->>'room_type_id' NOT IN (SELECT scidoo_room_type_id::text FROM connectors.scidoo_raw_room_types WHERE hotel_id = 'b1aa5d38-a044-475c-8d64-6b8f93045395' AND scidoo_room_type_id IS NOT NULL) GROUP BY raw_data->>'room_type_id';
DELETE FROM public.daily_availability WHERE hotel_id = 'b1aa5d38-a044-475c-8d64-6b8f93045395' AND rooms_available = 0 AND room_type_id IS NOT NULL;
SELECT date, room_type_id, rooms_available, rooms_sold FROM public.daily_availability WHERE hotel_id = 'b1aa5d38-a044-475c-8d64-6b8f93045395' AND room_type_id IS NULL AND rooms_available > 0 ORDER BY date LIMIT 20;`,

  // New script to create pms_integrations table
  "scripts/009_create_pms_integrations_table.sql": `CREATE TABLE IF NOT EXISTS public.pms_integrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hotel_id UUID NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
    pms_name TEXT NOT NULL,
    is_active BOOLEAN DEFAULT false,
    api_key TEXT,
    endpoint_url TEXT,
    config JSONB,
    sync_in_progress BOOLEAN DEFAULT false,
    sync_lock_acquired_at TIMESTAMP WITH TIME ZONE,
    last_sync_at TIMESTAMP WITH TIME ZONE,
    last_sync_status TEXT,
    last_sync_error TEXT,
    sync_stats JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT unique_hotel_pms UNIQUE(hotel_id, pms_name),
    CONSTRAINT valid_pms_name CHECK (pms_name IN ('scidoo', 'ericsoft', 'welcome', 'leonardo', 'protel', 'other'))
);
CREATE INDEX IF NOT EXISTS idx_pms_integrations_hotel ON public.pms_integrations(hotel_id);
CREATE INDEX IF NOT EXISTS idx_pms_integrations_active ON public.pms_integrations(is_active);
CREATE INDEX IF NOT EXISTS idx_pms_integrations_pms_name ON public.pms_integrations(pms_name);
CREATE INDEX IF NOT EXISTS idx_pms_integrations_sync_status ON public.pms_integrations(last_sync_status);
ALTER TABLE public.pms_integrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their organization's PMS integrations" ON public.pms_integrations FOR SELECT USING (hotel_id IN (SELECT h.id FROM public.hotels h INNER JOIN public.profiles p ON p.organization_id = h.organization_id WHERE p.id = auth.uid()));
CREATE POLICY "Users can insert PMS integrations for their hotels" ON public.pms_integrations FOR INSERT WITH CHECK (hotel_id IN (SELECT h.id FROM public.hotels h INNER JOIN public.profiles p ON p.organization_id = h.organization_id WHERE p.id = auth.uid()));
CREATE POLICY "Users can update their organization's PMS integrations" ON public.pms_integrations FOR UPDATE USING (hotel_id IN (SELECT h.id FROM public.hotels h INNER JOIN public.profiles p ON p.organization_id = h.organization_id WHERE p.id = auth.uid()));
CREATE POLICY "Users can delete their organization's PMS integrations" ON public.pms_integrations FOR DELETE USING (hotel_id IN (SELECT h.id FROM public.hotels h INNER JOIN public.profiles p ON p.organization_id = h.organization_id WHERE p.id = auth.uid()));
CREATE OR REPLACE FUNCTION update_pms_integrations_updated_at() RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER trigger_update_pms_integrations_updated_at BEFORE UPDATE ON public.pms_integrations FOR EACH ROW EXECUTE FUNCTION update_pms_integrations_updated_at();
COMMENT ON TABLE public.pms_integrations IS 'PMS integration configurations and sync status for hotels';
COMMENT ON COLUMN public.pms_integrations.config IS 'Flexible JSONB configuration for PMS-specific settings';
COMMENT ON COLUMN public.pms_integrations.sync_stats IS 'Statistics from the last sync operation';`,
}

export async function POST(request: Request) {
  const denied = await requireSuperAdmin()
  if (denied) return denied

  console.log("[v0] Execute script API called")

  try {
    // Use service role client directly for executing SQL scripts
    const supabaseAdmin = await createServiceRoleClient()
    console.log("[v0] Service role client created")

    const body = await request.json()
    console.log("[v0] Request body:", body)

    const { scriptPath } = body

    if (!scriptPath) {
      console.log("[v0] No scriptPath provided")
      return NextResponse.json({ success: false, error: "scriptPath is required" }, { status: 400 })
    }

    console.log("[v0] Executing SQL script:", scriptPath)

    const sqlContent = SQL_SCRIPTS[scriptPath]

    if (!sqlContent) {
      console.log("[v0] Script not found in embedded scripts:", scriptPath)
      return NextResponse.json({ success: false, error: `Script not found: ${scriptPath}` }, { status: 404 })
    }

    console.log("[v0] SQL content length:", sqlContent.length)

    // Split SQL content into individual statements
    const statements = sqlContent
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !s.startsWith("--") && s !== "")

    console.log(`[v0] Found ${statements.length} SQL statements to execute`)

    const errors: string[] = []
    const successes: string[] = []

    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i]

      if (statement.startsWith("--") || statement.trim() === "") {
        continue
      }

      const preview = statement.substring(0, 100).replace(/\s+/g, " ")
      console.log(`[v0] Executing statement ${i + 1}/${statements.length}: ${preview}...`)

      try {
        const { data, error } = await supabaseAdmin.rpc("exec_sql", {
          sql_query: statement + ";",
        })

        if (error) {
          console.error(`[v0] Error in statement ${i + 1}:`, error)
          errors.push(`Statement ${i + 1} (${preview}...): ${error.message}`)
        } else {
          console.log(`[v0] Statement ${i + 1} executed successfully`)
          successes.push(`Statement ${i + 1}: Success`)
        }
      } catch (err: any) {
        console.error(`[v0] Exception in statement ${i + 1}:`, err.message)
        errors.push(`Statement ${i + 1} (${preview}...): ${err.message}`)
      }
    }

    console.log(`[v0] Execution complete: ${successes.length} succeeded, ${errors.length} failed`)

    if (errors.length > 0) {
      return NextResponse.json(
        {
          success: false,
          message: `Script executed with ${errors.length} error(s). ${successes.length}/${statements.length} statements succeeded.`,
          errors: errors,
          successes: successes,
        },
        { status: 207 },
      )
    }

    return NextResponse.json({
      success: true,
      message: `Script ${scriptPath} executed successfully (${successes.length} statements)`,
      successes: successes,
    })
  } catch (error: any) {
    console.error("[v0] Execute script error:", error)
    console.error("[v0] Error stack:", error.stack)
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to execute script",
        details: error.stack,
      },
      { status: 500 },
    )
  }
}
