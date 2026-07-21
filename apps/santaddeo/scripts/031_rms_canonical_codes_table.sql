-- =====================================================
-- SCRIPT 031: TABELLA CODICI RMS CANONICI
-- Eseguire in Supabase SQL Editor
-- =====================================================

-- 1. CREA TABELLA rms_canonical_codes
CREATE TABLE IF NOT EXISTS rms_canonical_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,
  code TEXT NOT NULL,
  label TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID,
  UNIQUE(entity_type, code)
);

-- 2. INDICI
CREATE INDEX IF NOT EXISTS idx_rms_canonical_codes_entity ON rms_canonical_codes(entity_type);
CREATE INDEX IF NOT EXISTS idx_rms_canonical_codes_active ON rms_canonical_codes(is_active);

-- 3. RLS
ALTER TABLE rms_canonical_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all rms_canonical_codes" ON rms_canonical_codes;
CREATE POLICY "Allow all rms_canonical_codes" ON rms_canonical_codes FOR ALL USING (true);

-- 4. POPOLA CON I CODICI PREDEFINITI

-- Room Types
INSERT INTO rms_canonical_codes (entity_type, code, label, sort_order) VALUES
  ('room_type', 'SGL', 'Single Room', 1),
  ('room_type', 'DBL', 'Double Room', 2),
  ('room_type', 'TWN', 'Twin Room', 3),
  ('room_type', 'TRP', 'Triple Room', 4),
  ('room_type', 'QUD', 'Quad Room', 5),
  ('room_type', 'STE', 'Suite', 6),
  ('room_type', 'JST', 'Junior Suite', 7),
  ('room_type', 'FAM', 'Family Room', 8),
  ('room_type', 'APT', 'Apartment', 9),
  ('room_type', 'VIL', 'Villa', 10),
  ('room_type', 'DLX', 'Deluxe Room', 11),
  ('room_type', 'SUP', 'Superior Room', 12),
  ('room_type', 'STD', 'Standard Room', 13),
  ('room_type', 'ECO', 'Economy Room', 14)
ON CONFLICT (entity_type, code) DO NOTHING;

-- Rate Plans
INSERT INTO rms_canonical_codes (entity_type, code, label, sort_order) VALUES
  ('rate_plan', 'BAR', 'Best Available Rate', 1),
  ('rate_plan', 'OTA', 'OTA Rate', 2),
  ('rate_plan', 'DIR', 'Direct Rate', 3),
  ('rate_plan', 'COR', 'Corporate Rate', 4),
  ('rate_plan', 'GRP', 'Group Rate', 5),
  ('rate_plan', 'PKG', 'Package Rate', 6),
  ('rate_plan', 'PRO', 'Promo Rate', 7),
  ('rate_plan', 'NRF', 'Non-Refundable', 8),
  ('rate_plan', 'FLX', 'Flexible Rate', 9),
  ('rate_plan', 'LMD', 'Last Minute Deal', 10),
  ('rate_plan', 'EBD', 'Early Bird', 11),
  ('rate_plan', 'LON', 'Long Stay', 12)
ON CONFLICT (entity_type, code) DO NOTHING;

-- Channels
INSERT INTO rms_canonical_codes (entity_type, code, label, sort_order) VALUES
  ('channel', 'DIR', 'Direct (Website)', 1),
  ('channel', 'BKG', 'Booking.com', 2),
  ('channel', 'EXP', 'Expedia', 3),
  ('channel', 'AIR', 'Airbnb', 4),
  ('channel', 'AGD', 'Agoda', 5),
  ('channel', 'HRS', 'HRS', 6),
  ('channel', 'HTC', 'Hotels.com', 7),
  ('channel', 'TRP', 'TripAdvisor', 8),
  ('channel', 'GDS', 'GDS (Amadeus/Sabre)', 9),
  ('channel', 'PHN', 'Phone', 10),
  ('channel', 'WLK', 'Walk-in', 11),
  ('channel', 'OTH', 'Other', 99)
ON CONFLICT (entity_type, code) DO NOTHING;

-- Payment Methods
INSERT INTO rms_canonical_codes (entity_type, code, label, sort_order) VALUES
  ('payment_method', 'CSH', 'Cash', 1),
  ('payment_method', 'CRD', 'Credit Card', 2),
  ('payment_method', 'BNK', 'Bank Transfer', 3),
  ('payment_method', 'VCH', 'Voucher', 4),
  ('payment_method', 'CMP', 'Complimentary', 5),
  ('payment_method', 'INV', 'Invoice', 6),
  ('payment_method', 'OTA', 'OTA Collect', 7),
  ('payment_method', 'PPL', 'PayPal', 8),
  ('payment_method', 'OTH', 'Other', 99)
ON CONFLICT (entity_type, code) DO NOTHING;

-- Booking Status
INSERT INTO rms_canonical_codes (entity_type, code, label, sort_order) VALUES
  ('booking_status', 'CNF', 'Confirmed', 1),
  ('booking_status', 'CAN', 'Cancelled', 2),
  ('booking_status', 'PND', 'Pending', 3),
  ('booking_status', 'NSH', 'No-Show', 4),
  ('booking_status', 'CIN', 'Checked-In', 5),
  ('booking_status', 'COU', 'Checked-Out', 6),
  ('booking_status', 'MOD', 'Modified', 7),
  ('booking_status', 'WTL', 'Waitlist', 8)
ON CONFLICT (entity_type, code) DO NOTHING;

-- Document Types
INSERT INTO rms_canonical_codes (entity_type, code, label, sort_order) VALUES
  ('document_type', 'INV', 'Invoice (Fattura)', 1),
  ('document_type', 'RCP', 'Receipt (Ricevuta)', 2),
  ('document_type', 'CRN', 'Credit Note (Nota Credito)', 3),
  ('document_type', 'PRF', 'Pro-forma', 4),
  ('document_type', 'DEP', 'Deposit (Caparra)', 5),
  ('document_type', 'OTH', 'Other', 99)
ON CONFLICT (entity_type, code) DO NOTHING;

-- Meal Plans
INSERT INTO rms_canonical_codes (entity_type, code, label, sort_order) VALUES
  ('meal_plan', 'RO', 'Room Only', 1),
  ('meal_plan', 'BB', 'Bed & Breakfast', 2),
  ('meal_plan', 'HB', 'Half Board', 3),
  ('meal_plan', 'FB', 'Full Board', 4),
  ('meal_plan', 'AI', 'All Inclusive', 5)
ON CONFLICT (entity_type, code) DO NOTHING;

-- VERIFICA
SELECT 'Codici RMS creati' as result, COUNT(*) as count FROM rms_canonical_codes;
SELECT entity_type, COUNT(*) as codes FROM rms_canonical_codes GROUP BY entity_type ORDER BY entity_type;
