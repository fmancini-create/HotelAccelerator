"use client"

import { useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { CheckCircle2, Copy, ExternalLink, AlertCircle } from "lucide-react"

const CONNECTOR_FUNCTIONS_SQL = `-- ========================================
-- Stored Procedures per scrivere nello schema connectors
-- ========================================
-- Queste funzioni permettono di scrivere nello schema connectors
-- anche se non è esposto tramite l'API REST di Supabase

-- Funzione per inserire room types
CREATE OR REPLACE FUNCTION public.insert_scidoo_room_type(
  p_hotel_id UUID,
  p_pms_integration_id UUID,
  p_raw_data JSONB,
  p_scidoo_room_type_id TEXT,
  p_name TEXT,
  p_description TEXT DEFAULT NULL,
  p_size NUMERIC DEFAULT NULL,
  p_capacity INTEGER DEFAULT NULL,
  p_capacity_default INTEGER DEFAULT NULL,
  p_additional_beds INTEGER DEFAULT NULL,
  p_rooms INTEGER DEFAULT NULL,
  p_active_flag BOOLEAN DEFAULT true
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO connectors.scidoo_raw_room_types (
    hotel_id,
    pms_integration_id,
    raw_data,
    scidoo_room_type_id,
    name,
    description,
    size,
    capacity,
    capacity_default,
    additional_beds,
    rooms,
    active_flag,
    synced_at,
    processed
  ) VALUES (
    p_hotel_id,
    p_pms_integration_id,
    p_raw_data,
    p_scidoo_room_type_id,
    p_name,
    p_description,
    p_size,
    p_capacity,
    p_capacity_default,
    p_additional_beds,
    p_rooms,
    p_active_flag,
    NOW(),
    false
  )
  ON CONFLICT (hotel_id, scidoo_room_type_id)
  DO UPDATE SET
    raw_data = EXCLUDED.raw_data,
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    size = EXCLUDED.size,
    capacity = EXCLUDED.capacity,
    capacity_default = EXCLUDED.capacity_default,
    additional_beds = EXCLUDED.additional_beds,
    rooms = EXCLUDED.rooms,
    active_flag = EXCLUDED.active_flag,
    synced_at = NOW(),
    updated_at = NOW()
  RETURNING id INTO v_id;
  
  RETURN v_id;
END;
$$;

-- Funzione per inserire rates
CREATE OR REPLACE FUNCTION public.insert_scidoo_rate(
  p_hotel_id UUID,
  p_pms_integration_id UUID,
  p_raw_data JSONB,
  p_scidoo_rate_id TEXT,
  p_scidoo_room_type_id TEXT,
  p_date DATE,
  p_price NUMERIC
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO connectors.scidoo_raw_rates (
    hotel_id,
    pms_integration_id,
    raw_data,
    scidoo_rate_id,
    scidoo_room_type_id,
    date,
    price,
    synced_at,
    processed
  ) VALUES (
    p_hotel_id,
    p_pms_integration_id,
    p_raw_data,
    p_scidoo_rate_id,
    p_scidoo_room_type_id,
    p_date,
    p_price,
    NOW(),
    false
  )
  ON CONFLICT (hotel_id, scidoo_rate_id, scidoo_room_type_id, date)
  DO UPDATE SET
    raw_data = EXCLUDED.raw_data,
    price = EXCLUDED.price,
    synced_at = NOW(),
    updated_at = NOW()
  RETURNING id INTO v_id;
  
  RETURN v_id;
END;
$$;

-- Funzione per inserire minstay
CREATE OR REPLACE FUNCTION public.insert_scidoo_minstay(
  p_hotel_id UUID,
  p_pms_integration_id UUID,
  p_raw_data JSONB,
  p_scidoo_room_type_id TEXT,
  p_scidoo_rate_id TEXT,
  p_date DATE,
  p_minstay INTEGER,
  p_cta BOOLEAN DEFAULT false,
  p_ctd BOOLEAN DEFAULT false
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO connectors.scidoo_raw_minstay (
    hotel_id,
    pms_integration_id,
    raw_data,
    scidoo_room_type_id,
    scidoo_rate_id,
    date,
    minstay,
    cta,
    ctd,
    synced_at,
    processed
  ) VALUES (
    p_hotel_id,
    p_pms_integration_id,
    p_raw_data,
    p_scidoo_room_type_id,
    p_scidoo_rate_id,
    p_date,
    p_minstay,
    p_cta,
    p_ctd,
    NOW(),
    false
  )
  ON CONFLICT (hotel_id, scidoo_room_type_id, scidoo_rate_id, date)
  DO UPDATE SET
    raw_data = EXCLUDED.raw_data,
    minstay = EXCLUDED.minstay,
    cta = EXCLUDED.cta,
    ctd = EXCLUDED.ctd,
    synced_at = NOW(),
    updated_at = NOW()
  RETURNING id INTO v_id;
  
  RETURN v_id;
END;
$$;

-- Funzione per inserire availability
CREATE OR REPLACE FUNCTION public.insert_scidoo_availability(
  p_hotel_id UUID,
  p_pms_integration_id UUID,
  p_raw_data JSONB,
  p_scidoo_room_type_id TEXT,
  p_date DATE,
  p_rooms_available INTEGER
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO connectors.scidoo_raw_availability (
    hotel_id,
    pms_integration_id,
    raw_data,
    scidoo_room_type_id,
    date,
    rooms_available,
    synced_at,
    processed
  ) VALUES (
    p_hotel_id,
    p_pms_integration_id,
    p_raw_data,
    p_scidoo_room_type_id,
    p_date,
    p_rooms_available,
    NOW(),
    false
  )
  ON CONFLICT (hotel_id, scidoo_room_type_id, date)
  DO UPDATE SET
    raw_data = EXCLUDED.raw_data,
    rooms_available = EXCLUDED.rooms_available,
    synced_at = NOW(),
    updated_at = NOW()
  RETURNING id INTO v_id;
  
  RETURN v_id;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.insert_scidoo_room_type TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.insert_scidoo_rate TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.insert_scidoo_minstay TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.insert_scidoo_availability TO anon, authenticated, service_role;`

const SETUP_SQL = `-- ========================================
-- SANTADDEO Database Setup Script (Unified)
-- Architettura: 1 Database, 2 Schemi
-- ========================================
-- Questo script contiene tutto il codice necessario per il setup
-- Può essere eseguito direttamente nel Supabase SQL Editor
-- ========================================

-- ========================================
-- 1/5 - Creazione schema connectors
-- ========================================

CREATE SCHEMA IF NOT EXISTS connectors;

GRANT USAGE ON SCHEMA connectors TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA connectors TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA connectors TO postgres, anon, authenticated, service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA connectors TO postgres, anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA connectors GRANT ALL ON TABLES TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA connectors GRANT ALL ON SEQUENCES TO postgres, anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA connectors GRANT ALL ON FUNCTIONS TO postgres, anon, authenticated, service_role;

COMMENT ON SCHEMA connectors IS 'Raw data staging area for PMS integrations (DB_CONNETTORI)';

-- ========================================
-- 2/5 - Creazione tabelle raw Scidoo
-- ========================================

-- Raw bookings from Scidoo
CREATE TABLE IF NOT EXISTS connectors.scidoo_raw_bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hotel_id UUID NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
    pms_integration_id UUID NOT NULL REFERENCES public.pms_integrations(id) ON DELETE CASCADE,
    raw_data JSONB NOT NULL,
    booking_code TEXT,
    scidoo_reservation_number TEXT,
    booking_date DATE,
    checkin_date DATE,
    checkout_date DATE,
    status TEXT,
    synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    processed BOOLEAN DEFAULT FALSE,
    processed_at TIMESTAMP WITH TIME ZONE,
    processing_error TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT unique_scidoo_booking UNIQUE(hotel_id, booking_code)
);

CREATE INDEX IF NOT EXISTS idx_scidoo_raw_bookings_hotel ON connectors.scidoo_raw_bookings(hotel_id);
CREATE INDEX IF NOT EXISTS idx_scidoo_raw_bookings_processed ON connectors.scidoo_raw_bookings(processed);
CREATE INDEX IF NOT EXISTS idx_scidoo_raw_bookings_dates ON connectors.scidoo_raw_bookings(checkin_date, checkout_date);
CREATE INDEX IF NOT EXISTS idx_scidoo_raw_bookings_synced ON connectors.scidoo_raw_bookings(synced_at);

-- Raw availability from Scidoo
CREATE TABLE IF NOT EXISTS connectors.scidoo_raw_availability (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hotel_id UUID NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
    pms_integration_id UUID NOT NULL REFERENCES public.pms_integrations(id) ON DELETE CASCADE,
    raw_data JSONB NOT NULL,
    scidoo_room_type_id TEXT,
    date DATE,
    rooms_available INTEGER,
    synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    processed BOOLEAN DEFAULT FALSE,
    processed_at TIMESTAMP WITH TIME ZONE,
    processing_error TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT unique_scidoo_availability UNIQUE(hotel_id, scidoo_room_type_id, date)
);

CREATE INDEX IF NOT EXISTS idx_scidoo_raw_availability_hotel ON connectors.scidoo_raw_availability(hotel_id);
CREATE INDEX IF NOT EXISTS idx_scidoo_raw_availability_processed ON connectors.scidoo_raw_availability(processed);
CREATE INDEX IF NOT EXISTS idx_scidoo_raw_availability_date ON connectors.scidoo_raw_availability(date);

-- Raw rates from Scidoo
CREATE TABLE IF NOT EXISTS connectors.scidoo_raw_rates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hotel_id UUID NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
    pms_integration_id UUID NOT NULL REFERENCES public.pms_integrations(id) ON DELETE CASCADE,
    raw_data JSONB NOT NULL,
    scidoo_rate_id TEXT,
    scidoo_room_type_id TEXT,
    date DATE,
    price NUMERIC(10,2),
    synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    processed BOOLEAN DEFAULT FALSE,
    processed_at TIMESTAMP WITH TIME ZONE,
    processing_error TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT unique_scidoo_rate UNIQUE(hotel_id, scidoo_rate_id, scidoo_room_type_id, date)
);

CREATE INDEX IF NOT EXISTS idx_scidoo_raw_rates_hotel ON connectors.scidoo_raw_rates(hotel_id);
CREATE INDEX IF NOT EXISTS idx_scidoo_raw_rates_processed ON connectors.scidoo_raw_rates(processed);
CREATE INDEX IF NOT EXISTS idx_scidoo_raw_rates_date ON connectors.scidoo_raw_rates(date);

-- Raw fiscal production from Scidoo
CREATE TABLE IF NOT EXISTS connectors.scidoo_raw_fiscal_production (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hotel_id UUID NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
    pms_integration_id UUID NOT NULL REFERENCES public.pms_integrations(id) ON DELETE CASCADE,
    raw_data JSONB NOT NULL,
    date DATE,
    total_revenue NUMERIC(10,2),
    synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    processed BOOLEAN DEFAULT FALSE,
    processed_at TIMESTAMP WITH TIME ZONE,
    processing_error TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT unique_scidoo_fiscal_production UNIQUE(hotel_id, date)
);

CREATE INDEX IF NOT EXISTS idx_scidoo_raw_fiscal_hotel ON connectors.scidoo_raw_fiscal_production(hotel_id);
CREATE INDEX IF NOT EXISTS idx_scidoo_raw_fiscal_processed ON connectors.scidoo_raw_fiscal_production(processed);
CREATE INDEX IF NOT EXISTS idx_scidoo_raw_fiscal_date ON connectors.scidoo_raw_fiscal_production(date);

-- Raw room types from Scidoo
CREATE TABLE IF NOT EXISTS connectors.scidoo_raw_room_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id UUID NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
  pms_integration_id UUID NOT NULL REFERENCES public.pms_integrations(id) ON DELETE CASCADE,
  raw_data JSONB NOT NULL,
  scidoo_room_type_id TEXT NOT NULL,
  name TEXT,
  description TEXT,
  size NUMERIC,
  capacity INTEGER,
  capacity_default INTEGER,
  additional_beds INTEGER,
  rooms INTEGER,
  active_flag BOOLEAN DEFAULT true,
  synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  processed BOOLEAN DEFAULT false,
  processed_at TIMESTAMP WITH TIME ZONE,
  processing_error TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(hotel_id, scidoo_room_type_id)
);

CREATE INDEX IF NOT EXISTS idx_scidoo_room_types_hotel ON connectors.scidoo_raw_room_types(hotel_id);
CREATE INDEX IF NOT EXISTS idx_scidoo_room_types_processed ON connectors.scidoo_raw_room_types(processed);

-- Raw minstay restrictions from Scidoo
CREATE TABLE IF NOT EXISTS connectors.scidoo_raw_minstay (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id UUID NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
  pms_integration_id UUID NOT NULL REFERENCES public.pms_integrations(id) ON DELETE CASCADE,
  raw_data JSONB NOT NULL,
  scidoo_room_type_id TEXT NOT NULL,
  scidoo_rate_id TEXT,
  date DATE NOT NULL,
  minstay INTEGER,
  cta BOOLEAN DEFAULT false,
  ctd BOOLEAN DEFAULT false,
  synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  processed BOOLEAN DEFAULT false,
  processed_at TIMESTAMP WITH TIME ZONE,
  processing_error TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(hotel_id, scidoo_room_type_id, scidoo_rate_id, date)
);

CREATE INDEX IF NOT EXISTS idx_scidoo_minstay_hotel_date ON connectors.scidoo_raw_minstay(hotel_id, date);
CREATE INDEX IF NOT EXISTS idx_scidoo_minstay_processed ON connectors.scidoo_raw_minstay(processed);

-- Sync log table
CREATE TABLE IF NOT EXISTS connectors.sync_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hotel_id UUID NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
    pms_integration_id UUID NOT NULL REFERENCES public.pms_integrations(id) ON DELETE CASCADE,
    sync_type TEXT NOT NULL,
    pms_name TEXT NOT NULL,
    endpoint TEXT NOT NULL,
    request_params JSONB,
    response_status INTEGER,
    response_body JSONB,
    records_fetched INTEGER DEFAULT 0,
    records_inserted INTEGER DEFAULT 0,
    records_updated INTEGER DEFAULT 0,
    records_failed INTEGER DEFAULT 0,
    status TEXT NOT NULL,
    error_message TEXT,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    duration_ms INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sync_logs_hotel ON connectors.sync_logs(hotel_id);
CREATE INDEX IF NOT EXISTS idx_sync_logs_pms ON connectors.sync_logs(pms_integration_id);
CREATE INDEX IF NOT EXISTS idx_sync_logs_type ON connectors.sync_logs(sync_type);
CREATE INDEX IF NOT EXISTS idx_sync_logs_status ON connectors.sync_logs(status);
CREATE INDEX IF NOT EXISTS idx_sync_logs_started ON connectors.sync_logs(started_at);

-- ========================================
-- 3/5 - Creazione tabelle tracking ETL
-- ========================================

CREATE TABLE IF NOT EXISTS public.etl_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hotel_id UUID NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
    job_type TEXT NOT NULL,
    source_schema TEXT NOT NULL DEFAULT 'connectors',
    target_schema TEXT NOT NULL DEFAULT 'public',
    date_from DATE,
    date_to DATE,
    status TEXT NOT NULL DEFAULT 'pending',
    records_processed INTEGER DEFAULT 0,
    records_inserted INTEGER DEFAULT 0,
    records_updated INTEGER DEFAULT 0,
    records_skipped INTEGER DEFAULT 0,
    records_failed INTEGER DEFAULT 0,
    error_message TEXT,
    error_details JSONB,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    duration_ms INTEGER,
    triggered_by TEXT,
    triggered_by_user UUID REFERENCES public.profiles(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_etl_jobs_hotel ON public.etl_jobs(hotel_id);
CREATE INDEX IF NOT EXISTS idx_etl_jobs_status ON public.etl_jobs(status);
CREATE INDEX IF NOT EXISTS idx_etl_jobs_type ON public.etl_jobs(job_type);
CREATE INDEX IF NOT EXISTS idx_etl_jobs_started ON public.etl_jobs(started_at);

CREATE TABLE IF NOT EXISTS public.etl_errors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    etl_job_id UUID NOT NULL REFERENCES public.etl_jobs(id) ON DELETE CASCADE,
    source_table TEXT NOT NULL,
    source_record_id UUID,
    target_table TEXT,
    error_type TEXT NOT NULL,
    error_message TEXT NOT NULL,
    error_details JSONB,
    raw_data JSONB,
    resolved BOOLEAN DEFAULT FALSE,
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolved_by UUID REFERENCES public.profiles(id),
    resolution_notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_etl_errors_job ON public.etl_errors(etl_job_id);
CREATE INDEX IF NOT EXISTS idx_etl_errors_resolved ON public.etl_errors(resolved);
CREATE INDEX IF NOT EXISTS idx_etl_errors_type ON public.etl_errors(error_type);

-- ========================================
-- 4/5 - Aggiunta campo display_order
-- ========================================

ALTER TABLE public.room_types 
ADD COLUMN IF NOT EXISTS display_order INTEGER;

WITH ordered_rooms AS (
  SELECT 
    id,
    ROW_NUMBER() OVER (PARTITION BY hotel_id ORDER BY name) as row_num
  FROM public.room_types
)
UPDATE public.room_types
SET display_order = ordered_rooms.row_num
FROM ordered_rooms
WHERE room_types.id = ordered_rooms.id
AND room_types.display_order IS NULL;

CREATE INDEX IF NOT EXISTS idx_room_types_display_order 
ON public.room_types(hotel_id, display_order);

-- ========================================
-- 5/5 - Aggiunta tabelle minstay
-- ========================================

ALTER TABLE public.room_types 
ADD COLUMN IF NOT EXISTS last_update TIMESTAMP WITH TIME ZONE DEFAULT NOW();

CREATE TABLE IF NOT EXISTS public.minstay_restrictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id UUID NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
  room_type_id UUID REFERENCES public.room_types(id) ON DELETE CASCADE,
  rate_id UUID REFERENCES public.rates(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  minstay INTEGER,
  cta BOOLEAN DEFAULT false,
  ctd BOOLEAN DEFAULT false,
  source TEXT DEFAULT 'pms',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(hotel_id, room_type_id, rate_id, date)
);

CREATE INDEX IF NOT EXISTS idx_minstay_hotel_date ON public.minstay_restrictions(hotel_id, date);
CREATE INDEX IF NOT EXISTS idx_minstay_room_type ON public.minstay_restrictions(room_type_id);

-- ========================================
-- Setup completato!
-- ========================================`

export function DatabaseSetupGuide() {
  const [copied, setCopied] = useState(false)
  const [copiedFunctions, setCopiedFunctions] = useState(false)

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(SETUP_SQL)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error("Failed to copy:", err)
    }
  }

  const copyFunctionsToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(CONNECTOR_FUNCTIONS_SQL)
      setCopiedFunctions(true)
      setTimeout(() => setCopiedFunctions(false), 2000)
    } catch (err) {
      console.error("Failed to copy:", err)
    }
  }

  const openSupabaseDashboard = () => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    if (supabaseUrl) {
      const projectRef = supabaseUrl.split("//")[1]?.split(".")[0]
      window.open(`https://supabase.com/dashboard/project/${projectRef}/sql/new`, "_blank")
    }
  }

  return (
    <Card className="p-6">
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-bold mb-2">Setup Database Connectors</h2>
          <p className="text-muted-foreground">Per configurare lo schema connectors, segui questi passaggi:</p>
        </div>

        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Questo setup è necessario solo una volta per creare lo schema "connectors" nel database.
          </AlertDescription>
        </Alert>

        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-medium">
              1
            </div>
            <div className="space-y-2 flex-1">
              <p className="font-medium">Copia lo script SQL principale</p>
              <Button onClick={copyToClipboard} variant="outline" className="w-full justify-start bg-transparent">
                {copied ? (
                  <>
                    <CheckCircle2 className="mr-2 h-4 w-4 text-green-600" />
                    Copiato!
                  </>
                ) : (
                  <>
                    <Copy className="mr-2 h-4 w-4" />
                    Copia Script SQL
                  </>
                )}
              </Button>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-medium">
              2
            </div>
            <div className="space-y-2 flex-1">
              <p className="font-medium">Apri Supabase SQL Editor</p>
              <Button onClick={openSupabaseDashboard} variant="outline" className="w-full justify-start bg-transparent">
                <ExternalLink className="mr-2 h-4 w-4" />
                Apri Supabase Dashboard
              </Button>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-medium">
              3
            </div>
            <div className="space-y-2 flex-1">
              <p className="font-medium">Esegui lo script principale</p>
              <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                <li>Incolla lo script copiato nell'editor SQL</li>
                <li>Clicca su "Run" per eseguire lo script</li>
                <li>Attendi il completamento (dovrebbe richiedere pochi secondi)</li>
              </ul>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-orange-500 text-white text-sm font-medium">
              4
            </div>
            <div className="space-y-2 flex-1">
              <p className="font-medium">Copia e esegui lo script delle funzioni connettori</p>
              <Button
                onClick={copyFunctionsToClipboard}
                variant="outline"
                className="w-full justify-start bg-transparent mb-2"
              >
                {copiedFunctions ? (
                  <>
                    <CheckCircle2 className="mr-2 h-4 w-4 text-green-600" />
                    Copiato!
                  </>
                ) : (
                  <>
                    <Copy className="mr-2 h-4 w-4" />
                    Copia Script Funzioni Connettori
                  </>
                )}
              </Button>
              <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                <li>Incolla questo secondo script nell'editor SQL</li>
                <li>Clicca su "Run" per creare le funzioni</li>
                <li>Queste funzioni permettono di scrivere nello schema connectors</li>
              </ul>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-medium">
              5
            </div>
            <div className="space-y-2 flex-1">
              <p className="font-medium">Verifica il setup</p>
              <p className="text-sm text-muted-foreground">
                Vai su Database → Tables e verifica che esista lo schema "connectors" con le tabelle create.
              </p>
            </div>
          </div>
        </div>

        <Alert className="bg-green-50 border-green-200">
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800">
            Dopo aver completato il setup, potrai sincronizzare i dati da Scidoo usando il pulsante "Sincronizza" nel
            calendario.
          </AlertDescription>
        </Alert>
      </div>
    </Card>
  )
}
