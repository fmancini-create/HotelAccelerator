-- Create scidoo_raw_minstay table for minimum stay data
CREATE TABLE IF NOT EXISTS scidoo_raw_minstay (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  room_type_id TEXT NOT NULL,
  rate_id TEXT NOT NULL,
  date DATE NOT NULL,
  minstay INTEGER NOT NULL DEFAULT 1,
  cta BOOLEAN NOT NULL DEFAULT false,
  ctd BOOLEAN NOT NULL DEFAULT false,
  raw_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Unique constraint to prevent duplicates
  UNIQUE(hotel_id, room_type_id, rate_id, date)
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_minstay_hotel_date ON scidoo_raw_minstay(hotel_id, date);
CREATE INDEX IF NOT EXISTS idx_minstay_room_type ON scidoo_raw_minstay(hotel_id, room_type_id);
CREATE INDEX IF NOT EXISTS idx_minstay_rate ON scidoo_raw_minstay(hotel_id, rate_id);

-- Enable RLS
ALTER TABLE scidoo_raw_minstay ENABLE ROW LEVEL SECURITY;

-- Create RLS policy for service role
CREATE POLICY "Service role can manage minstay" ON scidoo_raw_minstay
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Create RLS policy for authenticated users (read their hotel's data)
CREATE POLICY "Users can view their hotel minstay" ON scidoo_raw_minstay
  FOR SELECT
  TO authenticated
  USING (
    hotel_id IN (
      SELECT hotel_id FROM user_hotels WHERE user_id = auth.uid()
    )
  );
