-- Tenant Usage Tracking table
-- Tracks resource consumption per hotel/tenant for cost analysis

CREATE TABLE IF NOT EXISTS tenant_usage_logs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  hotel_id uuid NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  recorded_date date NOT NULL DEFAULT CURRENT_DATE,
  
  -- API Calls
  api_calls_sync integer DEFAULT 0,
  api_calls_dashboard integer DEFAULT 0,
  api_calls_total integer DEFAULT 0,
  
  -- AI Chat
  ai_messages_count integer DEFAULT 0,
  ai_tokens_input integer DEFAULT 0,
  ai_tokens_output integer DEFAULT 0,
  ai_cost_estimated numeric(10,4) DEFAULT 0,
  
  -- Database
  db_rows_bookings integer DEFAULT 0,
  db_rows_availability integer DEFAULT 0,
  db_rows_metrics integer DEFAULT 0,
  db_storage_mb numeric(10,2) DEFAULT 0,
  
  -- Sync
  sync_runs_count integer DEFAULT 0,
  sync_errors_count integer DEFAULT 0,
  sync_duration_avg_ms integer DEFAULT 0,
  
  -- ETL
  etl_runs_count integer DEFAULT 0,
  etl_rows_processed integer DEFAULT 0,
  
  -- Email
  emails_sent integer DEFAULT 0,
  
  -- Computed cost estimates (EUR)
  cost_server numeric(10,4) DEFAULT 0,
  cost_database numeric(10,4) DEFAULT 0,
  cost_ai numeric(10,4) DEFAULT 0,
  cost_email numeric(10,4) DEFAULT 0,
  cost_total numeric(10,4) DEFAULT 0,
  
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  
  UNIQUE(hotel_id, recorded_date)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_tenant_usage_hotel_date 
  ON tenant_usage_logs(hotel_id, recorded_date DESC);

CREATE INDEX IF NOT EXISTS idx_tenant_usage_date 
  ON tenant_usage_logs(recorded_date DESC);

-- RLS
ALTER TABLE tenant_usage_logs ENABLE ROW LEVEL SECURITY;

-- Only service role and superadmin can access
CREATE POLICY "Service role full access on tenant_usage_logs"
  ON tenant_usage_logs
  FOR ALL
  USING (true)
  WITH CHECK (true);
