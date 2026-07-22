-- Create pricing_recalc_queue table
CREATE TABLE IF NOT EXISTS pricing_recalc_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  triggered_by_user_id uuid,
  trigger_type text NOT NULL DEFAULT 'algo_param_change',
  trigger_date timestamptz NOT NULL DEFAULT NOW(),
  date_range_start date NOT NULL,
  date_range_end date NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  processing_started_at timestamptz,
  completed_at timestamptz,
  error_message text,
  affected_price_changes_count int DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT NOW(),
  updated_at timestamptz NOT NULL DEFAULT NOW(),
  
  -- UNIQUE constraint for deduplication:
  -- Only one pending/processing job per hotel + trigger + date range
  UNIQUE (hotel_id, trigger_type, date_range_start, date_range_end, status)
    WHERE status IN ('pending', 'processing')
);

CREATE INDEX IF NOT EXISTS idx_pricing_recalc_queue_status 
  ON pricing_recalc_queue(status, hotel_id) WHERE status IN ('pending', 'processing');
CREATE INDEX IF NOT EXISTS idx_pricing_recalc_queue_hotel_date 
  ON pricing_recalc_queue(hotel_id, created_at DESC);

-- RPC: save_pricing_params_with_recalc_flag
-- Atomically saves algo params + occupancy bands + creates queue item
CREATE OR REPLACE FUNCTION save_pricing_params_with_recalc_flag(
  p_hotel_id uuid,
  p_user_id uuid,
  p_params jsonb,
  p_occupancy_bands jsonb
)
RETURNS TABLE(success boolean, recalc_id uuid, error_message text) AS $$
DECLARE
  v_recalc_id uuid;
  v_date_min date;
  v_date_max date;
  v_param_key text;
  v_date_val text;
  v_value text;
  v_band jsonb;
  v_band_id uuid;
BEGIN
  -- STEP 1: Validate hotel exists
  IF NOT EXISTS (SELECT 1 FROM hotels WHERE id = p_hotel_id) THEN
    RETURN QUERY SELECT false::boolean, NULL::uuid, 'Hotel not found'::text;
    RETURN;
  END IF;

  -- STEP 2: Save occupancy_bands
  IF p_occupancy_bands IS NOT NULL AND jsonb_array_length(p_occupancy_bands) > 0 THEN
    FOR v_band IN SELECT jsonb_array_elements(p_occupancy_bands)
    LOOP
      v_band_id := (v_band->>'id')::uuid;
      
      IF v_band_id IS NOT NULL THEN
        -- Update existing band
        UPDATE occupancy_bands
        SET 
          min_pct = COALESCE((v_band->>'min_pct')::numeric, 0),
          max_pct = COALESCE((v_band->>'max_pct')::numeric, 0),
          min_num = COALESCE((v_band->>'min_num')::numeric, 0),
          max_num = COALESCE((v_band->>'max_num')::numeric, 0),
          increment_pct = COALESCE((v_band->>'increment_pct')::numeric, 0),
          increment_eur = COALESCE((v_band->>'increment_eur')::numeric, 0),
          label = COALESCE(v_band->>'label', 'Fascia'),
          occupancy_mode = COALESCE(v_band->>'occupancy_mode', 'pct'),
          increment_mode = COALESCE(v_band->>'increment_mode', 'pct'),
          updated_at = NOW()
        WHERE id = v_band_id;
      ELSE
        -- Insert new band
        INSERT INTO occupancy_bands (
          hotel_id, group_id, band_index,
          min_pct, max_pct, min_num, max_num,
          increment_pct, increment_eur, label,
          occupancy_mode, increment_mode
        )
        VALUES (
          p_hotel_id,
          (v_band->>'group_id')::uuid,
          COALESCE((v_band->>'band_index')::int, 0),
          COALESCE((v_band->>'min_pct')::numeric, 0),
          COALESCE((v_band->>'max_pct')::numeric, 0),
          COALESCE((v_band->>'min_num')::numeric, 0),
          COALESCE((v_band->>'max_num')::numeric, 0),
          COALESCE((v_band->>'increment_pct')::numeric, 0),
          COALESCE((v_band->>'increment_eur')::numeric, 0),
          COALESCE(v_band->>'label', 'Fascia'),
          COALESCE(v_band->>'occupancy_mode', 'pct'),
          COALESCE(v_band->>'increment_mode', 'pct')
        );
      END IF;
    END LOOP;
  END IF;

  -- STEP 3: Save pricing_algo_params (upsert) + detect date range
  IF p_params IS NOT NULL THEN
    FOR v_param_key IN SELECT jsonb_object_keys(p_params)
    LOOP
      FOR v_date_val IN SELECT jsonb_object_keys(p_params->v_param_key)
      LOOP
        v_value := p_params->v_param_key->>v_date_val;
        
        IF v_value IS NOT NULL AND v_value != '' THEN
          INSERT INTO pricing_algo_params (hotel_id, param_key, date, param_value, updated_at)
          VALUES (p_hotel_id, v_param_key, v_date_val::date, v_value, NOW())
          ON CONFLICT (hotel_id, param_key, date) 
          DO UPDATE SET param_value = v_value, updated_at = NOW();
          
          -- Track min/max dates
          IF v_date_min IS NULL OR v_date_val::date < v_date_min THEN
            v_date_min := v_date_val::date;
          END IF;
          IF v_date_max IS NULL OR v_date_val::date > v_date_max THEN
            v_date_max := v_date_val::date;
          END IF;
        END IF;
      END LOOP;
    END LOOP;
  END IF;

  -- STEP 4: Create or deduplicate queue item
  IF v_date_min IS NOT NULL AND v_date_max IS NOT NULL THEN
    -- Check if there's already a pending/processing item
    SELECT id, status INTO v_recalc_id
    FROM pricing_recalc_queue
    WHERE hotel_id = p_hotel_id
      AND trigger_type = 'algo_param_change'
      AND date_range_start = v_date_min
      AND date_range_end = (v_date_max + INTERVAL '7 days')::date
      AND status IN ('pending', 'processing')
    LIMIT 1;
    
    IF v_recalc_id IS NULL THEN
      -- Create new queue item
      INSERT INTO pricing_recalc_queue (
        hotel_id,
        triggered_by_user_id,
        trigger_type,
        date_range_start,
        date_range_end,
        status
      )
      VALUES (
        p_hotel_id,
        p_user_id,
        'algo_param_change',
        v_date_min,
        (v_date_max + INTERVAL '7 days')::date,
        'pending'
      )
      RETURNING id INTO v_recalc_id;
    END IF;
  END IF;

  -- STEP 5: Return success
  RETURN QUERY SELECT true::boolean, v_recalc_id, NULL::text;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT false::boolean, NULL::uuid, SQLERRM::text;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION save_pricing_params_with_recalc_flag(uuid, uuid, jsonb, jsonb) TO authenticated;
