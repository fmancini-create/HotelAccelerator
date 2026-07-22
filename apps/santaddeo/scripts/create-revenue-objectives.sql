-- Create revenue_objectives table for storing monthly targets
-- Each row stores the objective + forecast unsold % for a hotel/year/month combo

CREATE TABLE IF NOT EXISTS revenue_objectives (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  hotel_id uuid NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  year integer NOT NULL,
  month integer NOT NULL CHECK (month >= 1 AND month <= 12),
  obiettivo_produzione numeric(12,2) DEFAULT 0,
  percentuale_invenduto_previsionale numeric(5,2) DEFAULT 10,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(hotel_id, year, month)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_revenue_objectives_hotel_year 
  ON revenue_objectives(hotel_id, year);

-- RLS policies
ALTER TABLE revenue_objectives ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on revenue_objectives"
  ON revenue_objectives
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
