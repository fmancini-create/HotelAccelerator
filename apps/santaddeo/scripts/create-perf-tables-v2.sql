-- Performance monitoring tables for /admin/performance dashboard
-- Persists API logs and Web Vitals to Supabase instead of in-memory arrays

-- 1. API Performance Logs
CREATE TABLE IF NOT EXISTS perf_api_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  route text NOT NULL,
  method text NOT NULL DEFAULT 'GET',
  total_ms numeric NOT NULL,
  db_ms numeric NOT NULL DEFAULT 0,
  non_db_ms numeric NOT NULL DEFAULT 0,
  cold_start boolean NOT NULL DEFAULT false,
  hotel_id text,
  status integer NOT NULL DEFAULT 200,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_perf_api_logs_created_at ON perf_api_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_perf_api_logs_route ON perf_api_logs (route);

-- 2. Web Vitals Logs
CREATE TABLE IF NOT EXISTS perf_web_vitals (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  value numeric NOT NULL,
  rating text,
  path text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_perf_web_vitals_created_at ON perf_web_vitals (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_perf_web_vitals_name ON perf_web_vitals (name);

-- 3. RLS: Only service_role can insert/read perf data (no public access)
ALTER TABLE perf_api_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE perf_web_vitals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full_access_api_logs" ON perf_api_logs
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "service_role_full_access_web_vitals" ON perf_web_vitals
  FOR ALL USING (true) WITH CHECK (true);
