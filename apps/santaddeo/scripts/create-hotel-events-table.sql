-- Create hotel_events table for managing holidays and custom events
CREATE TABLE IF NOT EXISTS hotel_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'manual', -- 'holiday' | 'manual' | 'local'
  country_code TEXT,                    -- 'IT', 'DE', 'FR', etc.
  impact TEXT DEFAULT 'medium',         -- 'low' | 'medium' | 'high'
  color TEXT DEFAULT '#f59e0b',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hotel_events_hotel_date_idx ON hotel_events(hotel_id, date);
CREATE INDEX IF NOT EXISTS hotel_events_hotel_type_idx ON hotel_events(hotel_id, type);

-- Unique constraint to prevent duplicate holidays per hotel/date/country
CREATE UNIQUE INDEX IF NOT EXISTS hotel_events_unique_holiday
  ON hotel_events(hotel_id, date, country_code, name)
  WHERE type = 'holiday';

-- Enable RLS
ALTER TABLE hotel_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "hotel_events_select" ON hotel_events
  FOR SELECT USING (
    hotel_id IN (SELECT hotel_id FROM hotel_users WHERE user_id = auth.uid())
  );

CREATE POLICY "hotel_events_insert" ON hotel_events
  FOR INSERT WITH CHECK (
    hotel_id IN (SELECT hotel_id FROM hotel_users WHERE user_id = auth.uid())
  );

CREATE POLICY "hotel_events_update" ON hotel_events
  FOR UPDATE USING (
    hotel_id IN (SELECT hotel_id FROM hotel_users WHERE user_id = auth.uid())
  );

CREATE POLICY "hotel_events_delete" ON hotel_events
  FOR DELETE USING (
    hotel_id IN (SELECT hotel_id FROM hotel_users WHERE user_id = auth.uid())
  );
