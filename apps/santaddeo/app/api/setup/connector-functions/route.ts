import { NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"

export async function POST() {
  try {
    const supabase = await createServiceRoleClient()

    // Execute the SQL script to create stored procedures
    const sql = `
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
GRANT EXECUTE ON FUNCTION public.insert_scidoo_availability TO anon, authenticated, service_role;
`

    // Execute the SQL using raw query
    const { error } = await supabase.rpc("exec_sql", { sql_query: sql })

    if (error) {
      // If exec_sql doesn't exist, try direct execution
      const { error: directError } = await supabase.from("_sql").insert({ query: sql })

      if (directError) {
        console.error("[v0] Error executing SQL:", directError)
        return NextResponse.json(
          { error: "Errore durante l'esecuzione dello script SQL. Contatta il supporto." },
          { status: 500 },
        )
      }
    }

    return NextResponse.json({
      success: true,
      message: "Stored procedures create con successo!",
    })
  } catch (error: any) {
    console.error("[v0] Setup error:", error)
    return NextResponse.json({ error: error.message || "Errore durante il setup" }, { status: 500 })
  }
}
