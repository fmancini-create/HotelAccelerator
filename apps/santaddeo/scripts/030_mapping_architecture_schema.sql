-- =====================================================
-- ARCHITETTURA MAPPATURE PMS → RMS
-- Script 030: Nuove tabelle per versioning e stati
-- =====================================================

-- 1. TABELLA VERSIONI MAPPATURE PMS
CREATE TABLE IF NOT EXISTS public.pms_mapping_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pms_provider_id UUID NOT NULL REFERENCES public.pms_providers(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'VALIDATED', 'LOCKED', 'DEPRECATED')),
  
  -- Date di validità
  valid_from TIMESTAMPTZ,
  valid_to TIMESTAMPTZ,
  
  -- Stato checklist (JSON con dettaglio completezza)
  checklist_status JSONB DEFAULT '{
    "critical_entities": {},
    "required_fields": {},
    "required_values": {},
    "completeness_percentage": 0
  }',
  
  -- Audit trail
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  validated_by UUID REFERENCES auth.users(id),
  validated_at TIMESTAMPTZ,
  locked_by UUID REFERENCES auth.users(id),
  locked_at TIMESTAMPTZ,
  
  -- Note modifiche
  change_notes TEXT,
  
  CONSTRAINT unique_pms_version UNIQUE(pms_provider_id, version_number)
);

-- Index per query frequenti
CREATE INDEX IF NOT EXISTS idx_pms_mapping_versions_provider ON public.pms_mapping_versions(pms_provider_id);
CREATE INDEX IF NOT EXISTS idx_pms_mapping_versions_status ON public.pms_mapping_versions(status);

-- 2. AGGIORNAMENTO TABELLA pms_rms_mappings
-- Aggiungi colonna per versione
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'pms_rms_mappings' AND column_name = 'mapping_version_id') THEN
    ALTER TABLE public.pms_rms_mappings ADD COLUMN mapping_version_id UUID REFERENCES public.pms_mapping_versions(id);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'pms_rms_mappings' AND column_name = 'is_required') THEN
    ALTER TABLE public.pms_rms_mappings ADD COLUMN is_required BOOLEAN DEFAULT false;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'pms_rms_mappings' AND column_name = 'transform_rule') THEN
    ALTER TABLE public.pms_rms_mappings ADD COLUMN transform_rule JSONB;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'pms_rms_mappings' AND column_name = 'field_type') THEN
    ALTER TABLE public.pms_rms_mappings ADD COLUMN field_type TEXT DEFAULT 'value' 
      CHECK (field_type IN ('value', 'field', 'computed'));
  END IF;
END $$;

-- 3. TABELLA BINDING HOTEL (collegamento struttura-PMS)
CREATE TABLE IF NOT EXISTS public.hotel_bindings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id UUID NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
  pms_provider_id UUID NOT NULL REFERENCES public.pms_providers(id) ON DELETE CASCADE,
  pms_integration_id UUID REFERENCES public.pms_integrations(id),
  
  -- Stato del binding
  status TEXT NOT NULL DEFAULT 'INCOMPLETE' CHECK (status IN ('INCOMPLETE', 'COMPLETE', 'ACTIVE', 'SUSPENDED')),
  
  -- Checklist completezza
  checklist_status JSONB DEFAULT '{
    "room_types": {"mapped": 0, "total": 0, "complete": false},
    "rate_plans": {"mapped": 0, "total": 0, "complete": false},
    "channels": {"mapped": 0, "total": 0, "complete": false},
    "completeness_percentage": 0
  }',
  
  -- Timestamp
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  activated_at TIMESTAMPTZ,
  last_sync_at TIMESTAMPTZ,
  
  -- Note
  notes TEXT,
  
  CONSTRAINT unique_hotel_pms_binding UNIQUE(hotel_id, pms_provider_id)
);

-- Index
CREATE INDEX IF NOT EXISTS idx_hotel_bindings_hotel ON public.hotel_bindings(hotel_id);
CREATE INDEX IF NOT EXISTS idx_hotel_bindings_pms ON public.hotel_bindings(pms_provider_id);
CREATE INDEX IF NOT EXISTS idx_hotel_bindings_status ON public.hotel_bindings(status);

-- 4. TABELLA VALORI BINDING HOTEL
CREATE TABLE IF NOT EXISTS public.hotel_binding_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_binding_id UUID NOT NULL REFERENCES public.hotel_bindings(id) ON DELETE CASCADE,
  
  -- Tipo entità e codici
  entity_type TEXT NOT NULL CHECK (entity_type IN ('room_type', 'rate_plan', 'channel', 'payment_method', 'board_type')),
  pms_code TEXT NOT NULL,
  pms_label TEXT,
  
  -- Riferimento entità RMS (può essere UUID o codice)
  rms_entity_id UUID,
  rms_code TEXT,
  rms_label TEXT,
  
  -- Metadati
  is_active BOOLEAN DEFAULT true,
  metadata JSONB DEFAULT '{}',
  
  -- Timestamp
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT unique_binding_entity UNIQUE(hotel_binding_id, entity_type, pms_code)
);

-- Index
CREATE INDEX IF NOT EXISTS idx_hotel_binding_values_binding ON public.hotel_binding_values(hotel_binding_id);
CREATE INDEX IF NOT EXISTS idx_hotel_binding_values_entity ON public.hotel_binding_values(entity_type);

-- 5. TABELLA LOG ETL BLOCKS
CREATE TABLE IF NOT EXISTS public.etl_block_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Riferimenti
  hotel_id UUID REFERENCES public.hotels(id),
  pms_provider_id UUID REFERENCES public.pms_providers(id),
  
  -- Dettaglio blocco
  block_type TEXT NOT NULL CHECK (block_type IN ('PMS_MAPPING', 'HOTEL_BINDING', 'CRITICAL_ENTITY', 'API_ERROR')),
  severity TEXT NOT NULL CHECK (severity IN ('ERROR', 'WARNING', 'INFO')),
  message TEXT NOT NULL,
  resolution TEXT,
  
  -- Stato
  is_resolved BOOLEAN DEFAULT false,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES auth.users(id),
  
  -- Timestamp
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Dettagli aggiuntivi
  details JSONB DEFAULT '{}'
);

-- Index
CREATE INDEX IF NOT EXISTS idx_etl_block_log_hotel ON public.etl_block_log(hotel_id);
CREATE INDEX IF NOT EXISTS idx_etl_block_log_unresolved ON public.etl_block_log(is_resolved) WHERE is_resolved = false;

-- 6. FUNZIONE PER CALCOLARE COMPLETEZZA MAPPATURA PMS
CREATE OR REPLACE FUNCTION calculate_pms_mapping_completeness(p_pms_provider_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
  v_total_required INTEGER := 0;
  v_total_mapped INTEGER := 0;
  v_critical_entities JSONB := '{}';
  v_entity_type TEXT;
  v_mapped_count INTEGER;
  v_required_count INTEGER;
BEGIN
  -- Entità critiche e campi richiesti
  FOR v_entity_type IN 
    SELECT UNNEST(ARRAY['reservation', 'guest', 'room_type', 'rate', 'availability', 'booking_status'])
  LOOP
    SELECT COUNT(*) INTO v_mapped_count
    FROM public.pms_rms_mappings
    WHERE pms_provider = (SELECT code FROM public.pms_providers WHERE id = p_pms_provider_id)
      AND pms_entity_type = v_entity_type;
    
    -- Conta richiesti per tipo (semplificato)
    v_required_count := CASE v_entity_type
      WHEN 'reservation' THEN 10
      WHEN 'guest' THEN 8
      WHEN 'room_type' THEN 5
      WHEN 'rate' THEN 4
      WHEN 'availability' THEN 4
      WHEN 'booking_status' THEN 5
      ELSE 3
    END;
    
    v_critical_entities := v_critical_entities || jsonb_build_object(
      v_entity_type, jsonb_build_object(
        'mapped', v_mapped_count,
        'required', v_required_count,
        'complete', v_mapped_count >= v_required_count
      )
    );
    
    v_total_required := v_total_required + v_required_count;
    v_total_mapped := v_total_mapped + LEAST(v_mapped_count, v_required_count);
  END LOOP;
  
  v_result := jsonb_build_object(
    'critical_entities', v_critical_entities,
    'completeness_percentage', ROUND((v_total_mapped::NUMERIC / GREATEST(v_total_required, 1)) * 100),
    'is_complete', v_total_mapped >= v_total_required
  );
  
  RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- 7. FUNZIONE PER VERIFICARE SE ETL PUÒ ESEGUIRE
CREATE OR REPLACE FUNCTION can_run_etl(p_hotel_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
  v_blockers JSONB := '[]';
  v_can_run BOOLEAN := true;
  v_pms_provider_id UUID;
  v_mapping_status TEXT;
  v_binding_status TEXT;
BEGIN
  -- Trova il PMS della struttura
  SELECT pms_provider_id INTO v_pms_provider_id
  FROM public.hotel_bindings
  WHERE hotel_id = p_hotel_id
  LIMIT 1;
  
  IF v_pms_provider_id IS NULL THEN
    v_can_run := false;
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
      'type', 'HOTEL_BINDING',
      'severity', 'ERROR',
      'message', 'Nessun PMS associato alla struttura',
      'resolution', 'Configurare il collegamento PMS nella sezione Connettori'
    ));
  ELSE
    -- Verifica stato mappatura PMS
    SELECT mv.status INTO v_mapping_status
    FROM public.pms_mapping_versions mv
    WHERE mv.pms_provider_id = v_pms_provider_id
      AND mv.status IN ('VALIDATED', 'LOCKED')
    ORDER BY mv.version_number DESC
    LIMIT 1;
    
    IF v_mapping_status IS NULL THEN
      v_can_run := false;
      v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
        'type', 'PMS_MAPPING',
        'severity', 'ERROR',
        'message', 'Mappatura PMS non validata',
        'resolution', 'Completare e validare la mappatura PMS'
      ));
    END IF;
    
    -- Verifica stato binding hotel
    SELECT hb.status INTO v_binding_status
    FROM public.hotel_bindings hb
    WHERE hb.hotel_id = p_hotel_id AND hb.pms_provider_id = v_pms_provider_id;
    
    IF v_binding_status NOT IN ('COMPLETE', 'ACTIVE') THEN
      v_can_run := false;
      v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
        'type', 'HOTEL_BINDING',
        'severity', 'ERROR',
        'message', 'Binding struttura incompleto',
        'resolution', 'Completare la configurazione delle tipologie camera e tariffe'
      ));
    END IF;
  END IF;
  
  v_result := jsonb_build_object(
    'can_run', v_can_run,
    'blockers', v_blockers
  );
  
  RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- 8. RLS POLICIES
ALTER TABLE public.pms_mapping_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hotel_bindings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hotel_binding_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.etl_block_log ENABLE ROW LEVEL SECURITY;

-- Policy per superadmin (può vedere e modificare tutto)
CREATE POLICY "Superadmin full access on pms_mapping_versions" ON public.pms_mapping_versions
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('superadmin', 'super_admin'))
  );

CREATE POLICY "Superadmin full access on hotel_bindings" ON public.hotel_bindings
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('superadmin', 'super_admin'))
  );

CREATE POLICY "Superadmin full access on hotel_binding_values" ON public.hotel_binding_values
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('superadmin', 'super_admin'))
  );

CREATE POLICY "Superadmin full access on etl_block_log" ON public.etl_block_log
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('superadmin', 'super_admin'))
  );

-- Policy per admin hotel (può vedere solo i propri binding)
CREATE POLICY "Hotel admin can view own bindings" ON public.hotel_bindings
  FOR SELECT USING (
    hotel_id IN (
      SELECT hotel_id FROM public.user_hotels WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Hotel admin can view own binding values" ON public.hotel_binding_values
  FOR SELECT USING (
    hotel_binding_id IN (
      SELECT hb.id FROM public.hotel_bindings hb
      JOIN public.user_hotels uh ON uh.hotel_id = hb.hotel_id
      WHERE uh.user_id = auth.uid()
    )
  );

-- 9. TRIGGER per aggiornare updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_hotel_bindings_updated_at ON public.hotel_bindings;
CREATE TRIGGER update_hotel_bindings_updated_at
  BEFORE UPDATE ON public.hotel_bindings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_hotel_binding_values_updated_at ON public.hotel_binding_values;
CREATE TRIGGER update_hotel_binding_values_updated_at
  BEFORE UPDATE ON public.hotel_binding_values
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 10. Crea versione iniziale per PMS esistenti (se non esiste)
INSERT INTO public.pms_mapping_versions (pms_provider_id, version_number, status, change_notes)
SELECT id, 1, 'DRAFT', 'Versione iniziale creata automaticamente'
FROM public.pms_providers
WHERE NOT EXISTS (
  SELECT 1 FROM public.pms_mapping_versions WHERE pms_provider_id = pms_providers.id
)
ON CONFLICT DO NOTHING;

-- =====================================================
-- 11. TRIGGER: BLOCCO UPDATE SU VERSIONI VALIDATED/LOCKED
-- =====================================================
-- Impedisce la modifica di mappature già validate o bloccate
CREATE OR REPLACE FUNCTION prevent_mapping_version_update()
RETURNS TRIGGER AS $$
BEGIN
  -- Se lo stato corrente è VALIDATED o LOCKED, blocca qualsiasi modifica
  -- ECCEZIONE: permetti solo transizione VALIDATED → LOCKED o VALIDATED → DEPRECATED
  IF OLD.status IN ('VALIDATED', 'LOCKED') THEN
    -- Permetti solo transizioni di stato specifiche
    IF NEW.status = 'LOCKED' AND OLD.status = 'VALIDATED' THEN
      -- Transizione permessa: VALIDATED → LOCKED
      NEW.locked_at = NOW();
      NEW.locked_by = auth.uid();
      RETURN NEW;
    ELSIF NEW.status = 'DEPRECATED' AND OLD.status IN ('VALIDATED', 'LOCKED') THEN
      -- Transizione permessa: VALIDATED/LOCKED → DEPRECATED
      RETURN NEW;
    ELSE
      RAISE EXCEPTION 'IMMUTABLE_MAPPING: Impossibile modificare mappatura con stato %. Le mappature VALIDATED o LOCKED sono immutabili. Creare una nuova versione.', OLD.status;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS enforce_mapping_immutability ON public.pms_mapping_versions;
CREATE TRIGGER enforce_mapping_immutability
  BEFORE UPDATE ON public.pms_mapping_versions
  FOR EACH ROW EXECUTE FUNCTION prevent_mapping_version_update();

-- =====================================================
-- 12. TRIGGER: BLOCCO UPDATE SU pms_rms_mappings SE VERSIONE LOCKED
-- =====================================================
CREATE OR REPLACE FUNCTION prevent_mapping_update_if_locked()
RETURNS TRIGGER AS $$
DECLARE
  v_version_status TEXT;
BEGIN
  -- Verifica se la mappatura appartiene a una versione LOCKED
  IF NEW.mapping_version_id IS NOT NULL THEN
    SELECT status INTO v_version_status
    FROM public.pms_mapping_versions
    WHERE id = NEW.mapping_version_id;
    
    IF v_version_status = 'LOCKED' THEN
      RAISE EXCEPTION 'IMMUTABLE_MAPPING: Impossibile modificare mappature appartenenti a versione LOCKED. Creare una nuova versione.';
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS enforce_mapping_lock ON public.pms_rms_mappings;
CREATE TRIGGER enforce_mapping_lock
  BEFORE UPDATE OR DELETE ON public.pms_rms_mappings
  FOR EACH ROW EXECUTE FUNCTION prevent_mapping_update_if_locked();

-- =====================================================
-- 13. TRIGGER: IMPEDISCE ACTIVATION BINDING SE INCOMPLETO
-- =====================================================
CREATE OR REPLACE FUNCTION enforce_binding_completeness()
RETURNS TRIGGER AS $$
DECLARE
  v_completeness JSONB;
  v_pms_status TEXT;
  v_room_types_complete BOOLEAN;
  v_rate_plans_complete BOOLEAN;
BEGIN
  -- Blocca transizione a ACTIVE se checklist non completa
  IF NEW.status = 'ACTIVE' AND OLD.status != 'ACTIVE' THEN
    -- Verifica completezza checklist
    v_completeness := COALESCE(NEW.checklist_status, '{}');
    v_room_types_complete := COALESCE((v_completeness->'room_types'->>'complete')::BOOLEAN, false);
    v_rate_plans_complete := COALESCE((v_completeness->'rate_plans'->>'complete')::BOOLEAN, false);
    
    IF NOT v_room_types_complete THEN
      RAISE EXCEPTION 'BINDING_INCOMPLETE: Impossibile attivare binding - tipologie camera non complete. Mappare tutte le tipologie camera prima di attivare.';
    END IF;
    
    IF NOT v_rate_plans_complete THEN
      RAISE EXCEPTION 'BINDING_INCOMPLETE: Impossibile attivare binding - piani tariffari non completi. Mappare tutti i piani tariffari prima di attivare.';
    END IF;
    
    -- Verifica che la mappatura PMS sia VALIDATED o LOCKED
    SELECT status INTO v_pms_status
    FROM public.pms_mapping_versions
    WHERE pms_provider_id = NEW.pms_provider_id
      AND status IN ('VALIDATED', 'LOCKED')
    ORDER BY version_number DESC
    LIMIT 1;
    
    IF v_pms_status IS NULL THEN
      RAISE EXCEPTION 'BINDING_BLOCKED: Impossibile attivare binding - mappatura PMS non validata. La mappatura PMS deve essere VALIDATED o LOCKED.';
    END IF;
    
    -- Se tutto ok, setta activated_at
    NEW.activated_at = NOW();
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS enforce_binding_activation ON public.hotel_bindings;
CREATE TRIGGER enforce_binding_activation
  BEFORE UPDATE ON public.hotel_bindings
  FOR EACH ROW EXECUTE FUNCTION enforce_binding_completeness();

-- =====================================================
-- 14. FUNZIONE GATE ETL (UNICO PUNTO DI CONTROLLO)
-- =====================================================
CREATE OR REPLACE FUNCTION can_run_etl(p_hotel_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
  v_blockers JSONB := '[]';
  v_can_run BOOLEAN := true;
  v_pms_provider_id UUID;
  v_mapping_version_id UUID;
  v_mapping_status TEXT;
  v_binding_status TEXT;
  v_binding_checklist JSONB;
BEGIN
  -- 1. Trova il binding hotel-PMS
  SELECT pms_provider_id, status, checklist_status 
  INTO v_pms_provider_id, v_binding_status, v_binding_checklist
  FROM public.hotel_bindings
  WHERE hotel_id = p_hotel_id AND status IN ('COMPLETE', 'ACTIVE')
  ORDER BY CASE status WHEN 'ACTIVE' THEN 1 WHEN 'COMPLETE' THEN 2 ELSE 3 END
  LIMIT 1;
  
  -- BLOCCO 1: Nessun binding trovato
  IF v_pms_provider_id IS NULL THEN
    v_can_run := false;
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
      'code', 'NO_BINDING',
      'type', 'HOTEL_BINDING',
      'severity', 'ERROR',
      'message', 'Nessun PMS configurato per questa struttura',
      'resolution', 'Configurare il collegamento PMS nella sezione Connettori → Configurazione Hotel'
    ));
    
    -- Log blocco
    INSERT INTO public.etl_block_log (hotel_id, block_type, severity, message, details)
    VALUES (p_hotel_id, 'HOTEL_BINDING', 'ERROR', 'Nessun binding PMS configurato', '{}'::jsonb);
    
    RETURN jsonb_build_object('can_run', false, 'blockers', v_blockers);
  END IF;
  
  -- BLOCCO 2: Binding non ACTIVE
  IF v_binding_status != 'ACTIVE' THEN
    v_can_run := false;
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
      'code', 'BINDING_NOT_ACTIVE',
      'type', 'HOTEL_BINDING',
      'severity', 'ERROR',
      'message', 'Binding struttura non attivo (stato: ' || v_binding_status || ')',
      'resolution', 'Completare e attivare il binding nella sezione Connettori'
    ));
  END IF;
  
  -- 2. Verifica mappatura PMS
  SELECT id, status INTO v_mapping_version_id, v_mapping_status
  FROM public.pms_mapping_versions
  WHERE pms_provider_id = v_pms_provider_id
    AND status IN ('VALIDATED', 'LOCKED')
  ORDER BY version_number DESC
  LIMIT 1;
  
  -- BLOCCO 3: Mappatura PMS non validata
  IF v_mapping_status IS NULL THEN
    v_can_run := false;
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
      'code', 'MAPPING_NOT_VALIDATED',
      'type', 'PMS_MAPPING',
      'severity', 'ERROR',
      'message', 'Mappatura PMS non validata',
      'resolution', 'Validare la mappatura PMS nella sezione Superadmin → Connettori'
    ));
  -- BLOCCO 4: Mappatura in VALIDATED ma non LOCKED (warning)
  ELSIF v_mapping_status = 'VALIDATED' THEN
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
      'code', 'MAPPING_NOT_LOCKED',
      'type', 'PMS_MAPPING',
      'severity', 'WARNING',
      'message', 'Mappatura PMS validata ma non bloccata - potrebbe essere modificata',
      'resolution', 'Bloccare la mappatura per garantire stabilità'
    ));
  END IF;
  
  -- Log se ci sono blocchi ERROR
  IF NOT v_can_run THEN
    INSERT INTO public.etl_block_log (hotel_id, pms_provider_id, block_type, severity, message, details)
    VALUES (
      p_hotel_id, 
      v_pms_provider_id, 
      'PMS_MAPPING', 
      'ERROR', 
      'ETL bloccato - vincoli non soddisfatti',
      jsonb_build_object('blockers', v_blockers)
    );
  END IF;
  
  RETURN jsonb_build_object(
    'can_run', v_can_run,
    'pms_provider_id', v_pms_provider_id,
    'mapping_version_id', v_mapping_version_id,
    'mapping_status', v_mapping_status,
    'binding_status', v_binding_status,
    'blockers', v_blockers
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- 15. FUNZIONE HELPER: CREA NUOVA VERSIONE MAPPATURA
-- =====================================================
CREATE OR REPLACE FUNCTION create_mapping_version(
  p_pms_provider_id UUID,
  p_notes TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_new_version_id UUID;
  v_next_version INTEGER;
BEGIN
  -- Calcola prossimo numero versione
  SELECT COALESCE(MAX(version_number), 0) + 1 INTO v_next_version
  FROM public.pms_mapping_versions
  WHERE pms_provider_id = p_pms_provider_id;
  
  -- Depreca versioni precedenti VALIDATED (non LOCKED)
  UPDATE public.pms_mapping_versions
  SET status = 'DEPRECATED'
  WHERE pms_provider_id = p_pms_provider_id
    AND status = 'VALIDATED';
  
  -- Crea nuova versione
  INSERT INTO public.pms_mapping_versions (
    pms_provider_id,
    version_number,
    status,
    created_by,
    change_notes
  ) VALUES (
    p_pms_provider_id,
    v_next_version,
    'DRAFT',
    auth.uid(),
    p_notes
  )
  RETURNING id INTO v_new_version_id;
  
  -- Copia mappature dalla versione precedente LOCKED o VALIDATED
  INSERT INTO public.pms_rms_mappings (
    pms_provider,
    pms_entity_type,
    pms_code,
    pms_label,
    rms_code,
    rms_label,
    transform_rule,
    is_required,
    field_type,
    mapping_version_id
  )
  SELECT 
    m.pms_provider,
    m.pms_entity_type,
    m.pms_code,
    m.pms_label,
    m.rms_code,
    m.rms_label,
    m.transform_rule,
    m.is_required,
    m.field_type,
    v_new_version_id
  FROM public.pms_rms_mappings m
  JOIN public.pms_mapping_versions v ON m.mapping_version_id = v.id
  WHERE v.pms_provider_id = p_pms_provider_id
    AND v.status IN ('LOCKED', 'VALIDATED')
  ORDER BY v.version_number DESC
  LIMIT 1;
  
  RETURN v_new_version_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- 16. FUNZIONE: VALIDA MAPPATURA (DRAFT → VALIDATED)
-- =====================================================
CREATE OR REPLACE FUNCTION validate_mapping_version(p_version_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_current_status TEXT;
  v_completeness JSONB;
  v_is_complete BOOLEAN;
BEGIN
  -- Verifica stato corrente
  SELECT status INTO v_current_status
  FROM public.pms_mapping_versions
  WHERE id = p_version_id;
  
  IF v_current_status IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Versione non trovata');
  END IF;
  
  IF v_current_status != 'DRAFT' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Solo versioni DRAFT possono essere validate');
  END IF;
  
  -- Calcola completezza
  SELECT calculate_pms_mapping_completeness(pms_provider_id) INTO v_completeness
  FROM public.pms_mapping_versions
  WHERE id = p_version_id;
  
  v_is_complete := COALESCE((v_completeness->>'is_complete')::BOOLEAN, false);
  
  IF NOT v_is_complete THEN
    RETURN jsonb_build_object(
      'success', false, 
      'error', 'Mappatura incompleta - completare tutte le entità critiche',
      'completeness', v_completeness
    );
  END IF;
  
  -- Aggiorna stato
  UPDATE public.pms_mapping_versions
  SET 
    status = 'VALIDATED',
    validated_at = NOW(),
    validated_by = auth.uid(),
    checklist_status = v_completeness
  WHERE id = p_version_id;
  
  RETURN jsonb_build_object('success', true, 'completeness', v_completeness);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- 17. FUNZIONE: LOCK MAPPATURA (VALIDATED → LOCKED)
-- =====================================================
CREATE OR REPLACE FUNCTION lock_mapping_version(p_version_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_current_status TEXT;
BEGIN
  SELECT status INTO v_current_status
  FROM public.pms_mapping_versions
  WHERE id = p_version_id;
  
  IF v_current_status IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Versione non trovata');
  END IF;
  
  IF v_current_status != 'VALIDATED' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Solo versioni VALIDATED possono essere bloccate');
  END IF;
  
  -- Il trigger enforce_mapping_immutability gestirà la transizione
  UPDATE public.pms_mapping_versions
  SET status = 'LOCKED'
  WHERE id = p_version_id;
  
  RETURN jsonb_build_object('success', true, 'message', 'Mappatura bloccata permanentemente');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- 18. CONSTRAINT AGGIUNTIVI
-- =====================================================

-- Impedisci versioni duplicate con stesso status attivo
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_mapping_version 
ON public.pms_mapping_versions(pms_provider_id) 
WHERE status IN ('VALIDATED', 'LOCKED');

-- Impedisci binding duplicati attivi per stesso hotel
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_binding 
ON public.hotel_bindings(hotel_id) 
WHERE status = 'ACTIVE';

-- =====================================================
-- FINE SCRIPT
-- =====================================================
