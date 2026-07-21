-- Performance schema upgrade: new columns + indexes

-- 1) perf_api_logs: add new columns
ALTER TABLE perf_api_logs ADD COLUMN IF NOT EXISTS request_id uuid DEFAULT gen_random_uuid() NOT NULL;
ALTER TABLE perf_api_logs ADD COLUMN IF NOT EXISTS actor text;
ALTER TABLE perf_api_logs ADD COLUMN IF NOT EXISTS runtime text;
ALTER TABLE perf_api_logs ADD COLUMN IF NOT EXISTS region text;
ALTER TABLE perf_api_logs ADD COLUMN IF NOT EXISTS bytes_out integer;
ALTER TABLE perf_api_logs ADD COLUMN IF NOT EXISTS cache_hit boolean;

-- 2) perf_web_vitals: add new columns
ALTER TABLE perf_web_vitals ADD COLUMN IF NOT EXISTS hotel_id uuid;
ALTER TABLE perf_web_vitals ADD COLUMN IF NOT EXISTS session_id text;
ALTER TABLE perf_web_vitals ADD COLUMN IF NOT EXISTS sampled boolean DEFAULT true;

-- 3) Indexes for perf_api_logs
CREATE INDEX IF NOT EXISTS idx_perf_api_logs_created_at ON perf_api_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_perf_api_logs_route ON perf_api_logs (route);
CREATE INDEX IF NOT EXISTS idx_perf_api_logs_hotel_id ON perf_api_logs (hotel_id);
CREATE INDEX IF NOT EXISTS idx_perf_api_logs_status ON perf_api_logs (status);
CREATE INDEX IF NOT EXISTS idx_perf_api_logs_cold_start ON perf_api_logs (cold_start);

-- 4) Indexes for perf_web_vitals
CREATE INDEX IF NOT EXISTS idx_perf_web_vitals_created_at ON perf_web_vitals (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_perf_web_vitals_hotel_id ON perf_web_vitals (hotel_id);
