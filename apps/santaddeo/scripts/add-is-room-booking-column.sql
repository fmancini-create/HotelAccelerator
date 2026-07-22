-- Migration: Add is_room_booking column to bookings table
--
-- Purpose: Distinguish real room bookings from service-only entries
-- (city tax, extras, "Da Assegnare" in Scidoo) that have room_type_id=NULL.
--
-- Service entries must NOT count towards operational KPIs:
-- arrivals, departures, stayovers, occupancy, room nights.
--
-- Revenue queries intentionally do NOT filter by is_room_booking
-- because total revenue includes services.
--
-- Already executed on 2026-04-15.

-- 1. Add column (default true for backward compat)
ALTER TABLE bookings
ADD COLUMN IF NOT EXISTS is_room_booking BOOLEAN DEFAULT true;

-- 2. Backfill: mark service entries
UPDATE bookings SET is_room_booking = false WHERE room_type_id IS NULL;

-- 3. Partial index for queries that filter is_room_booking = true
CREATE INDEX IF NOT EXISTS idx_bookings_is_room_booking
ON bookings (hotel_id, is_room_booking) WHERE is_room_booking = true;
