-- Aggregate function to compute dashboard metrics directly in DB
-- Replaces fetchAllPaginated which downloaded 19,000+ rows to JS

-- 1. Bookings channel breakdown (non-cancelled)
CREATE OR REPLACE FUNCTION get_bookings_channel_breakdown(
  p_hotel_id UUID,
  p_start_date DATE,
  p_end_date DATE
)
RETURNS TABLE(
  channel TEXT,
  is_ota BOOLEAN,
  channel_revenue NUMERIC,
  booking_count BIGINT,
  pickup_days_sum NUMERIC
) LANGUAGE sql STABLE AS $$
  WITH ota_channels AS (
    SELECT unnest(ARRAY[
      'booking.com', 'expedia', 'hrs', 'hotels.com', 
      'airbnb', 'agoda', 'trivago', 'payrooms'
    ]) AS ota_name
  )
  SELECT
    COALESCE(b.channel, 'Diretto') AS channel,
    EXISTS(SELECT 1 FROM ota_channels WHERE lower(b.channel) LIKE '%' || ota_name || '%') AS is_ota,
    SUM(
      CASE 
        WHEN b.price_per_night > 0 AND b.price_per_night NOT IN (999, 9999) THEN
          b.price_per_night * GREATEST(0,
            (LEAST(b.check_out_date, p_end_date + 1) - GREATEST(b.check_in_date, p_start_date))::int
          )
        ELSE 0
      END
    )::NUMERIC AS channel_revenue,
    COUNT(*)::BIGINT AS booking_count,
    SUM(
      GREATEST(0, 
        EXTRACT(DAY FROM (b.check_in_date::timestamp - COALESCE(b.booking_date, b.created_at::date)::timestamp))
      )
    )::NUMERIC AS pickup_days_sum
  FROM bookings b
  WHERE b.hotel_id = p_hotel_id
    AND b.is_cancelled = false
    AND b.check_in_date <= p_end_date
    AND b.check_out_date > p_start_date
  GROUP BY b.channel, 
    EXISTS(SELECT 1 FROM ota_channels WHERE lower(b.channel) LIKE '%' || ota_name || '%');
$$;

-- 2. Cancellation aggregates
CREATE OR REPLACE FUNCTION get_cancellation_aggregates(
  p_hotel_id UUID,
  p_start_date DATE,
  p_end_date DATE
)
RETURNS TABLE(
  cancelled_revenue NUMERIC,
  cancelled_nights BIGINT,
  cancellations_count BIGINT,
  pickup_days_sum NUMERIC
) LANGUAGE sql STABLE AS $$
  SELECT
    SUM(
      CASE 
        WHEN COALESCE(b.number_of_nights, 1) > 0 THEN
          (b.total_price / COALESCE(NULLIF(b.number_of_nights, 0), 1)) *
          GREATEST(0,
            (LEAST(b.check_out_date, p_end_date + 1) - GREATEST(b.check_in_date, p_start_date))::int
          )
        ELSE 0
      END
    )::NUMERIC AS cancelled_revenue,
    SUM(
      GREATEST(0,
        (LEAST(b.check_out_date, p_end_date + 1) - GREATEST(b.check_in_date, p_start_date))::int
      )
    )::BIGINT AS cancelled_nights,
    COUNT(*)::BIGINT AS cancellations_count,
    SUM(
      GREATEST(0,
        EXTRACT(DAY FROM (b.check_in_date::timestamp - COALESCE(b.cancellation_date, b.created_at::date)::timestamp))
      )
    )::NUMERIC AS pickup_days_sum
  FROM bookings b
  WHERE b.hotel_id = p_hotel_id
    AND b.is_cancelled = true
    AND b.check_in_date <= p_end_date
    AND b.check_out_date > p_start_date;
$$;
