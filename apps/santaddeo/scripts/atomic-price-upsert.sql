-- ATOMIC PRICE UPSERT WITH HISTORY LOGGING AND SEMANTIC TRACKING
-- This RPC handles pricing_grid upsert and price_change_log insertion in a single transaction
-- Guarantees atomicity: both tables updated or nothing, no partial writes
-- Also tracks: is_never_set flag and first_set_at timestamp for semantic distinction

CREATE OR REPLACE FUNCTION upsert_prices_atomic(
  p_hotel_id uuid,
  p_entries jsonb,
  p_source text DEFAULT 'manual_grid',
  p_changed_by uuid DEFAULT NULL
)
RETURNS jsonb AS $$
DECLARE
  v_entry jsonb;
  v_old_price numeric;
  v_new_price numeric;
  v_room_type_id uuid;
  v_rate_id uuid;
  v_occupancy integer;
  v_date date;
  v_is_never_set boolean;
  v_upserted_count integer := 0;
  v_logged_count integer := 0;
  v_error_msg text;
BEGIN
  -- Input validation
  IF p_hotel_id IS NULL OR p_entries IS NULL OR jsonb_array_length(p_entries) = 0 THEN
    RAISE EXCEPTION 'hotel_id and entries array required';
  END IF;
  
  -- Validate source
  IF p_source NOT IN ('manual_grid', 'drag_fill', 'bulk_fill', 'publish_suggested', 'autopilot_push', 'autopilot_calculated', 'algorithm') THEN
    RAISE EXCEPTION 'Invalid source: %', p_source;
  END IF;
  
  -- Start transaction (implicit in PostgreSQL function)
  BEGIN
    -- Process each entry
    FOR v_entry IN SELECT jsonb_array_elements(p_entries) LOOP
      v_room_type_id := (v_entry->>'room_type_id')::uuid;
      v_rate_id := (v_entry->>'rate_id')::uuid;
      v_occupancy := (v_entry->>'occupancy')::integer;
      v_date := (v_entry->>'date')::date;
      v_new_price := (v_entry->>'price')::numeric;
      
      -- Validate required fields
      IF v_room_type_id IS NULL OR v_rate_id IS NULL OR v_occupancy IS NULL OR v_date IS NULL OR v_new_price IS NULL THEN
        RAISE EXCEPTION 'Missing required fields in entry: %', v_entry;
      END IF;
      
      -- CLAMP: Enforce bottom_rate
      -- If bottom_rate is set and newPrice falls below it, clamp to bottom_rate
      DECLARE
        v_bottom_rate numeric;
      BEGIN
        SELECT bottom_rate INTO v_bottom_rate FROM rate_limits 
        WHERE hotel_id = p_hotel_id AND room_type_id = v_room_type_id LIMIT 1;
        
        IF v_bottom_rate > 0 AND v_new_price < v_bottom_rate THEN
          v_new_price := v_bottom_rate;
        END IF;
      EXCEPTION WHEN OTHERS THEN
        -- If rate_limits lookup fails, continue without clamping
        NULL;
      END;
      
      -- 1. Get the old price and current is_never_set state (if row exists)
      SELECT price, is_never_set INTO v_old_price, v_is_never_set
      FROM pricing_grid
      WHERE hotel_id = p_hotel_id
        AND room_type_id = v_room_type_id
        AND rate_id = v_rate_id
        AND occupancy = v_occupancy
        AND date = v_date;
      
      -- If row doesn't exist, this is a NEW cell insertion, so is_never_set was true
      IF v_is_never_set IS NULL THEN
        v_is_never_set := true;
      END IF;
      
      -- 2. UPSERT into pricing_grid (atomically within transaction)
      -- When inserting/updating: if is_never_set was true, set it to false (cell is now set)
      INSERT INTO pricing_grid (
        hotel_id, room_type_id, rate_id, occupancy, date, price, is_manual, is_never_set, first_set_at, updated_at, created_at, last_change_source, created_by
      ) VALUES (
        p_hotel_id, v_room_type_id, v_rate_id, v_occupancy, v_date, v_new_price, 
        CASE WHEN p_source IN ('manual_grid', 'drag_fill', 'bulk_fill') THEN true ELSE false END,
        false,  -- After save: is_never_set = false (cell is now explicitly set)
        now(),  -- first_set_at = now() on first insert
        now(), now(),
        p_source,     -- Track who/what set this price
        p_changed_by  -- Track the user who made the change
      )
      ON CONFLICT (hotel_id, room_type_id, rate_id, occupancy, date)
      DO UPDATE SET
        price = v_new_price,
        is_manual = CASE WHEN p_source IN ('manual_grid', 'drag_fill', 'bulk_fill') THEN true ELSE false END,
        is_never_set = false,  -- On update: keep is_never_set = false
        last_change_source = p_source,  -- Track last change source
        created_by = p_changed_by,      -- Track last user who changed
        -- first_set_at: DON'T update, keep original value
        updated_at = now();
      
      v_upserted_count := v_upserted_count + 1;
      
      -- 3. LOG to price_change_log ONLY if price actually changed
      -- Condition: old_price IS DISTINCT FROM new_price
      -- This handles NULL (new record) vs existing value properly
      IF (v_old_price IS DISTINCT FROM v_new_price) THEN
        INSERT INTO price_change_log (
          hotel_id, room_type_id, rate_id, occupancy, target_date, old_price, new_price, 
          changed_by, source, changed_at
        ) VALUES (
          p_hotel_id, v_room_type_id, v_rate_id, v_occupancy, v_date, v_old_price, v_new_price,
          p_changed_by, p_source, now()
        );
        
        v_logged_count := v_logged_count + 1;
      END IF;
    END LOOP;
    
    -- Success: return result
    RETURN jsonb_build_object(
      'success', true,
      'upserted_count', v_upserted_count,
      'logged_count', v_logged_count,
      'source', p_source,
      'changed_by', p_changed_by
    );
    
  EXCEPTION WHEN OTHERS THEN
    -- Any error causes entire transaction to rollback
    RAISE EXCEPTION 'Atomic upsert failed: %', SQLERRM;
  END;
  
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to authenticated and anon roles
GRANT EXECUTE ON FUNCTION upsert_prices_atomic TO authenticated, anon, service_role;
