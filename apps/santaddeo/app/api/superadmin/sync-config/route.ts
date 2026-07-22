import { type NextRequest, NextResponse } from "next/server"
import { createClient, createServiceRoleClient } from "@/lib/supabase/server"

async function checkSuperAdmin() {
  const userSupabase = await createClient()
  const { data: { user }, error } = await userSupabase.auth.getUser()
  if (error || !user) return null

  const supabase = await createServiceRoleClient()
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single()

  if (profile?.role !== "super_admin") return null
  return user
}

/**
 * GET /api/superadmin/sync-config
 * Ritorna tutte le sync_configs con i dati hotel
 */
export async function GET() {
  try {
    const user = await checkSuperAdmin()
    if (!user) return NextResponse.json({ error: "Non autorizzato" }, { status: 403 })

    const supabase = await createServiceRoleClient()

    // Partiamo da `hotels` (non da `sync_configs`) e facciamo left-join sulla
    // config: cosi' TUTTI gli hotel attivi compaiono, anche quelli che non hanno
    // ancora una riga in sync_configs (prima venivano esclusi dal doppio !inner
    // -> 4 hotel mancanti, incl. Cavallino con PMS attivo). Gli hotel senza
    // config ottengono valori di default; al primo salvataggio l'upsert PUT crea
    // la riga.
    const { data, error } = await supabase
      .from("hotels")
      .select(`
        id, name, total_rooms, star_rating, organization_id,
        pms_integrations(pms_name, integration_mode, is_active),
        sync_configs(*)
      `)
      .eq("is_active", true)
      .order("name", { ascending: true })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const configs = (data || []).map((hotel: any) => {
      const sc = Array.isArray(hotel.sync_configs) ? hotel.sync_configs[0] : hotel.sync_configs
      return {
        id: sc?.id ?? null,
        hotel_id: hotel.id,
        auto_sync_enabled: sc?.auto_sync_enabled ?? false,
        sync_interval_minutes: sc?.sync_interval_minutes ?? 360,
        sync_start_date: sc?.sync_start_date ?? null,
        sync_end_date: sc?.sync_end_date ?? null,
        last_sync_at: sc?.last_sync_at ?? null,
        last_sync_status: sc?.last_sync_status ?? null,
        last_sync_error: sc?.last_sync_error ?? null,
        hotels: {
          id: hotel.id,
          name: hotel.name,
          total_rooms: hotel.total_rooms,
          star_rating: hotel.star_rating,
          pms_integrations: hotel.pms_integrations || [],
        },
      }
    })

    return NextResponse.json({ configs })
  } catch (err) {
    return NextResponse.json({ error: "Errore interno" }, { status: 500 })
  }
}

/**
 * PUT /api/superadmin/sync-config
 * Aggiorna la sync_config per un hotel
 * Body: { hotel_id, auto_sync_enabled, sync_interval_minutes, sync_start_date?, sync_end_date? }
 */
export async function PUT(request: NextRequest) {
  try {
    const user = await checkSuperAdmin()
    if (!user) return NextResponse.json({ error: "Non autorizzato" }, { status: 403 })

    const body = await request.json()
    const { hotel_id, auto_sync_enabled, sync_interval_minutes, sync_start_date, sync_end_date } = body

    if (!hotel_id) {
      return NextResponse.json({ error: "hotel_id obbligatorio" }, { status: 400 })
    }

    // Validazione intervallo: minimo 30 minuti, massimo 1440 (24h)
    const interval = Math.max(30, Math.min(1440, sync_interval_minutes || 360))

    const supabase = await createServiceRoleClient()

    const { data, error } = await supabase
      .from("sync_configs")
      .upsert({
        hotel_id,
        auto_sync_enabled: !!auto_sync_enabled,
        sync_interval_minutes: interval,
        sync_start_date: sync_start_date || null,
        sync_end_date: sync_end_date || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: "hotel_id" })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ config: data })
  } catch (err) {
    return NextResponse.json({ error: "Errore interno" }, { status: 500 })
  }
}

/**
 * POST /api/superadmin/sync-config/trigger
 * Trigger sync manuale + aggiorna last_sync_at nella config
 * Body: { hotel_id }
 */
export async function POST(request: NextRequest) {
  try {
    const user = await checkSuperAdmin()
    if (!user) return NextResponse.json({ error: "Non autorizzato" }, { status: 403 })

    const { hotel_id } = await request.json()
    if (!hotel_id) {
      return NextResponse.json({ error: "hotel_id obbligatorio" }, { status: 400 })
    }

    // Chiama il sync endpoint esistente
    const syncRes = await fetch(new URL("/api/superadmin/sync", process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Cookie": request.headers.get("cookie") || "",
      },
      body: JSON.stringify({ hotel_id }),
    })

    const syncJson = await syncRes.json()

    // Aggiorna last_sync nella config
    const supabase = await createServiceRoleClient()
    await supabase
      .from("sync_configs")
      .upsert({
        hotel_id,
        last_sync_at: new Date().toISOString(),
        last_sync_status: syncJson.success ? "success" : "error",
        last_sync_error: syncJson.success ? null : (syncJson.error || "Errore sconosciuto"),
        updated_at: new Date().toISOString(),
      }, { onConflict: "hotel_id" })

    return NextResponse.json(syncJson)
  } catch (err) {
    return NextResponse.json({ error: "Errore interno" }, { status: 500 })
  }
}
