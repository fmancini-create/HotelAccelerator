-- Aggiunge campi capabilities alla tabella pms_providers
ALTER TABLE public.pms_providers ADD COLUMN IF NOT EXISTS has_webhook BOOLEAN DEFAULT false;
ALTER TABLE public.pms_providers ADD COLUMN IF NOT EXISTS has_versioning BOOLEAN DEFAULT false;
ALTER TABLE public.pms_providers ADD COLUMN IF NOT EXISTS has_delta_sync BOOLEAN DEFAULT false;
ALTER TABLE public.pms_providers ADD COLUMN IF NOT EXISTS has_last_modified BOOLEAN DEFAULT false;
ALTER TABLE public.pms_providers ADD COLUMN IF NOT EXISTS requires_full_historization BOOLEAN DEFAULT true;
ALTER TABLE public.pms_providers ADD COLUMN IF NOT EXISTS sync_strategy TEXT DEFAULT 'full';
ALTER TABLE public.pms_providers ADD COLUMN IF NOT EXISTS available_entities JSONB DEFAULT '[]';

-- Aggiorna Scidoo con le sue capabilities
UPDATE public.pms_providers 
SET 
  has_webhook = false,
  has_versioning = false,
  has_delta_sync = false,
  has_last_modified = true,
  requires_full_historization = true,
  sync_strategy = 'full',
  available_entities = '["account", "property", "customer", "guest", "guest_type", "room_type", "room", "room_status", "room_availability", "room_availability_detail", "list_date_type_room", "list_date_room", "bed_preference", "reservation", "booking_room", "booking_rate", "booking_day_price", "booking_price_detail", "booking_extra", "booking_payment", "booking_note", "booking_agency", "booking_origin", "booking_group", "rate", "arrangement", "day_price", "price_detail", "due_amount", "cancellation_policy", "deposit_policy", "estimate", "proposal", "agency", "origin", "service", "offer", "supplement", "service_composition", "service_availability", "service_time_slot", "tag", "category_group", "info", "album", "video", "tax_document", "fee", "account_revenue", "suspended_invoice"]'::jsonb
WHERE code = 'scidoo';
