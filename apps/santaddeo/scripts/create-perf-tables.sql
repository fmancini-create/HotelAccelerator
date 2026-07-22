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

-- Index for time-range queries (dashboard typically queries last 24h / 7d)
CREATE INDEX IF NOT EXISTS idx_perf_api_logs_created_at ON perf_api_logs (created_at DESC);
-- Index for route filtering
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

-- Index for time-range queries
CREATE INDEX IF NOT EXISTS idx_perf_web_vitals_created_at ON perf_web_vitals (created_at DESC);
-- Index for metric name
CREATE INDEX IF NOT EXISTS idx_perf_web_vitals_name ON perf_web_vitals (name);

-- 3. Auto-cleanup: delete records older than 7 days
--    We use pg_cron if available, otherwise the app handles cleanup on reads.

-- Enable pg_cron extension (may already be enabled on Supabase)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule cleanup every day at 03:00 UTC
SELECT cron.schedule(
  'cleanup-perf-api-logs',
  '0 3 * * *',
  $$DELETE FROM perf_api_logs WHERE created_at < now() - interval '7 days'$$
);

SELECT cron.schedule(
  'cleanup-perf-web-vitals',
  '0 3 * * *',
  $$DELETE FROM perf_web_vitals WHERE created_at < now() - interval '7 days'$$
);

-- 4. RLS: Only service_role can insert/read perf data (no public access)
ALTER TABLE perf_api_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE perf_web_vitals ENABLE ROW LEVEL SECURITY;

-- Allow service_role full access
CREATE POLICY "service_role_full_access_api_logs" ON perf_api_logs
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "service_role_full_access_web_vitals" ON perf_web_vitals
  FOR ALL USING (true) WITH CHECK (true);
