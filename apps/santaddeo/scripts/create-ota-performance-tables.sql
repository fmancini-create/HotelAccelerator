-- ============================================================================
-- OTA performance KPI — manual-input workflow
-- ============================================================================
-- Booking.com has no public API for individual hoteliers, so we collect
-- performance data with:
--   (a) a short manual form entered every N days (search_views, property_views, bookings),
--   (b) the monthly "Report sull'andamento" PDF uploaded and parsed by AI.
-- The tables below store both, plus per-user reminder settings.
--
-- Idempotent: safe to re-run.

-- Manual KPI snapshots from the ranking dashboard (screenshot 2/3).
CREATE TABLE IF NOT EXISTS hotel_ota_kpi_snapshots (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id           UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  platform           TEXT NOT NULL DEFAULT 'booking_com',
  period_start       DATE NOT NULL,
  period_end         DATE NOT NULL,
  -- Raw KPI values for the period
  search_views       BIGINT,
  property_views     BIGINT,
  bookings_count     INT,
  -- Prior-year comparison (same period, previous year)
  prev_search_views  BIGINT,
  prev_property_views BIGINT,
  prev_bookings_count INT,
  -- Optional extras from the "Panoramica concorrenza" block
  ranking_score      NUMERIC(3,1),
  ranking_position   INT,
  total_competitors  INT,
  notes              TEXT,
  created_by         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (hotel_id, platform, period_start, period_end)
);
CREATE INDEX IF NOT EXISTS idx_ota_kpi_hotel_period
  ON hotel_ota_kpi_snapshots(hotel_id, period_end DESC);

-- Uploaded "Report sull'andamento" PDFs and the AI-extracted structured data.
CREATE TABLE IF NOT EXISTS hotel_ota_reports (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id        UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  platform        TEXT NOT NULL DEFAULT 'booking_com',
  file_path       TEXT NOT NULL,       -- Vercel Blob URL
  file_name       TEXT,
  file_size       INT,
  period_start    DATE,
  period_end      DATE,
  -- AI-extracted structured content: { monthly: [{month, nights, adr, revenue, nights_prev, adr_prev, revenue_prev}], ... }
  extracted_data  JSONB DEFAULT '{}'::jsonb,
  processing_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (processing_status IN ('pending','processing','done','error')),
  processing_error TEXT,
  processed_at    TIMESTAMPTZ,
  uploaded_by     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ota_reports_hotel_date
  ON hotel_ota_reports(hotel_id, created_at DESC);

-- Reminder settings per (hotel, user). User who sets the reminder also
-- receives the email, same pattern used for price-change notifications.
CREATE TABLE IF NOT EXISTS ota_reminder_settings (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id         UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform         TEXT NOT NULL DEFAULT 'booking_com',
  frequency_days   INT  NOT NULL DEFAULT 30 CHECK (frequency_days BETWEEN 7 AND 180),
  email_enabled    BOOLEAN NOT NULL DEFAULT TRUE,
  popup_enabled    BOOLEAN NOT NULL DEFAULT TRUE,
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  next_run_at      TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '30 days',
  last_triggered_at TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (hotel_id, user_id, platform)
);
CREATE INDEX IF NOT EXISTS idx_ota_reminder_next_run
  ON ota_reminder_settings(next_run_at) WHERE is_active = TRUE;

-- Per-user in-app notifications. `platform_notifications` is broadcast-only,
-- we need a personal inbox for reminders, so this table is additive.
CREATE TABLE IF NOT EXISTS user_notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  hotel_id    UUID REFERENCES hotels(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,            -- 'ota_reminder', 'price_alert', ...
  title       TEXT NOT NULL,
  body        TEXT,
  action_url  TEXT,                     -- Where to land when clicked
  is_read     BOOLEAN NOT NULL DEFAULT FALSE,
  read_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_user_notif_user_unread
  ON user_notifications(user_id, created_at DESC)
  WHERE is_read = FALSE;

-- Drop legacy Booking.com credential columns and weather columns. Those were
-- never actually used anywhere in the codebase: Booking has no public API,
-- and weather is served by Open-Meteo (keyless) via weather-service.ts.
ALTER TABLE hotel_integrations
  DROP COLUMN IF EXISTS booking_com_username,
  DROP COLUMN IF EXISTS booking_com_password,
  DROP COLUMN IF EXISTS booking_com_property_id,
  DROP COLUMN IF EXISTS weather_api_key,
  DROP COLUMN IF EXISTS weather_api_provider;

ALTER TABLE hotels
  DROP COLUMN IF EXISTS booking_com_username,
  DROP COLUMN IF EXISTS booking_com_password,
  DROP COLUMN IF EXISTS booking_com_property_id,
  DROP COLUMN IF EXISTS weather_api_key,
  DROP COLUMN IF EXISTS weather_api_provider;
