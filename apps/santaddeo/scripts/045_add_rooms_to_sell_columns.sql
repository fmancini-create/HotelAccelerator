-- Add rooms_to_sell_min and rooms_to_sell_max to last_minute_levels
ALTER TABLE last_minute_levels 
ADD COLUMN IF NOT EXISTS rooms_to_sell_min integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS rooms_to_sell_max integer DEFAULT 0;
