-- Add URL fields for multi-platform review scraping
-- Each platform needs its hotel URL for the Apify scraper

ALTER TABLE hotel_integrations 
ADD COLUMN IF NOT EXISTS booking_com_url TEXT,
ADD COLUMN IF NOT EXISTS booking_com_hotel_id TEXT,
ADD COLUMN IF NOT EXISTS tripadvisor_url TEXT,
ADD COLUMN IF NOT EXISTS expedia_url TEXT;

-- Add last sync timestamps per platform
ALTER TABLE hotel_integrations
ADD COLUMN IF NOT EXISTS booking_com_last_sync_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS tripadvisor_last_sync_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS expedia_last_sync_at TIMESTAMPTZ;

COMMENT ON COLUMN hotel_integrations.booking_com_url IS 'Full URL to hotel page on Booking.com';
COMMENT ON COLUMN hotel_integrations.booking_com_hotel_id IS 'Booking.com hotel ID extracted from URL';
COMMENT ON COLUMN hotel_integrations.tripadvisor_url IS 'Full URL to hotel page on TripAdvisor';
COMMENT ON COLUMN hotel_integrations.expedia_url IS 'Full URL to hotel page on Expedia';
