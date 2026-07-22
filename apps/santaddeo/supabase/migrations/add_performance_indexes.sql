-- Performance indexes for Santaddeo
-- Created to eliminate full table scans on the most queried tables.
-- All indexes use CREATE INDEX CONCURRENTLY to avoid locking tables during creation.
-- NOTE: CONCURRENTLY cannot run inside a transaction block. If running via
--       Supabase migrations (which wrap in a transaction), remove CONCURRENTLY
--       and run during a low-traffic window instead.

-- =============================================================================
-- 1. rms_metrics_history (5M+ rows) - the largest table
--    Used by: dashboard trend/YoY queries, KPI history charts
--    Query pattern: WHERE hotel_id = ? AND event_date BETWEEN ? AND ? AND event_type = ?
--    Without this index every metrics query does a full sequential scan on 5M rows.
-- =============================================================================
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_rms_metrics_hotel_date_type
  ON rms_metrics_history (hotel_id, event_date, event_type);

-- =============================================================================
-- 2. bookings (24k+ rows, growing) - most queried table
--    Used by: dashboard/metrics, dati/production, accelerator/channel-production,
--             YoY count queries, cancellation aggregates, channel breakdown RPC
--    Query pattern: WHERE hotel_id = ? AND is_cancelled = ? 
--                   AND check_in_date <= ? AND check_out_date > ?
--    The leading (hotel_id, is_cancelled) filters first, then the date range
--    columns enable efficient range scans for period overlap queries.
-- =============================================================================
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bookings_hotel_cancelled_dates
  ON bookings (hotel_id, is_cancelled, check_in_date, check_out_date);

-- =============================================================================
-- 3. daily_availability - SKIPPED
--    Already has idx_daily_availability_hotel_date on (hotel_id, date).
-- =============================================================================

-- =============================================================================
-- 4. pricing_algo_params (2.8k rows, queried per room type)
--    Used by: pricing engine K-driven formula, pricing grid recalculation,
--             calendar pricing views
--    Query pattern: WHERE hotel_id = ? AND param_key = ? AND date BETWEEN ? AND ?
--    Note: table has no room_type_id column; param_key encodes the parameter
--    type (e.g. 'k_value', 'min_price') and is the main discriminator after hotel.
-- =============================================================================
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_pricing_params_hotel_key_date
  ON pricing_algo_params (hotel_id, param_key, date);
