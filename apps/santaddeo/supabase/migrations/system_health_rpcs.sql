-- get_table_row_counts: returns approximate row counts for key tables
-- Uses pg_class.reltuples for fast O(1) counts (no full table scan)
CREATE OR REPLACE FUNCTION get_table_row_counts()
RETURNS TABLE(table_name text, row_count bigint)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT c.relname::text AS table_name, c.reltuples::bigint AS row_count
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind = 'r'
    AND c.relname IN ('bookings', 'rms_metrics_history', 'email_logs', 'sync_logs', 'hotels', 'profiles', 'daily_availability', 'pricing_algo_params')
  ORDER BY c.relname;
END;
$$;

-- get_database_size: returns human-readable database size
CREATE OR REPLACE FUNCTION get_database_size()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN pg_size_pretty(pg_database_size(current_database()));
END;
$$;
