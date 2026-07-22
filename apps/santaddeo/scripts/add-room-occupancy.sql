-- Add min_occupancy and max_occupancy to room_types
-- min_occupancy: minimum guests the room can be sold for (default 1)
-- max_occupancy: maximum guests the room can hold (populated from existing capacity)

ALTER TABLE room_types
ADD COLUMN IF NOT EXISTS min_occupancy integer DEFAULT 1,
ADD COLUMN IF NOT EXISTS max_occupancy integer DEFAULT NULL;

-- Populate max_occupancy from existing capacity values
UPDATE room_types
SET max_occupancy = capacity
WHERE max_occupancy IS NULL AND capacity IS NOT NULL;

-- Set min_occupancy = 1 where null
UPDATE room_types
SET min_occupancy = 1
WHERE min_occupancy IS NULL;
