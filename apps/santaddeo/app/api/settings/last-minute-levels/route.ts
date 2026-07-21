import { NextRequest, NextResponse } from "next/server"
import { createClient, createServiceRoleClient } from "@/lib/supabase/server"
import { isDevAuthAsync } from "@/lib/env/dev-auth"
import { cookies } from "next/headers"

export const dynamic = "force-dynamic"

async function getAuthenticatedHotelId() {
  const isV0Preview = await isDevAuthAsync()
  // Use service role client for all DB operations to bypass RLS
  const adminClient = await createServiceRoleClient()

  let userId: string

  if (isV0Preview) {
    userId = "5de43b7b-e661-4e4e-8177-7943df06470c"
  } else {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return { error: "Non autenticato", status: 401 }
    }
    userId = user.id
  }

  const { data: profile } = await adminClient
    .from("profiles")
    .select("role, organization_id")
    .eq("id", userId)
    .maybeSingle()

  const isSuperAdmin = profile?.role === "super_admin"

  const cookieStore = await cookies()
  let hotelId: string | null = null

  const selectedHotelId = cookieStore.get("selected_hotel_id")?.value
  if (selectedHotelId) {
    hotelId = selectedHotelId
  } else if (isSuperAdmin) {
    const impersonatedHotelId = cookieStore.get("impersonated_hotel_id")?.value
    if (impersonatedHotelId) {
      hotelId = impersonatedHotelId
    } else {
      const { data: hotels } = await adminClient
        .from("hotels")
        .select("id")
        .order("created_at", { ascending: true })
        .limit(1)
      hotelId = hotels?.[0]?.id || null
    }
  } else if (profile?.organization_id) {
    const { data: hotels } = await adminClient
      .from("hotels")
      .select("id")
      .eq("organization_id", profile.organization_id)
      .order("created_at", { ascending: true })
      .limit(1)
    hotelId = hotels?.[0]?.id || null
  }

  if (!hotelId) {
    return { error: "Nessun hotel associato", status: 400 }
  }

  return { hotelId, userId, role: profile?.role, supabase: adminClient }
}

// GET: fetch last minute levels with shared bands and discount matrix
export async function GET(_req: NextRequest) {
  try {
    const auth = await getAuthenticatedHotelId()
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const { hotelId, role, supabase } = auth

    // Check accelerator subscription
    const { data: subscription } = await supabase
      .from("accelerator_subscriptions")
      .select("id")
      .eq("hotel_id", hotelId)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle()

    const isAccelerator = !!subscription || role === "super_admin"

    // Fetch all data in parallel
    const [levelsResult, sharedBandsResult, roomTypesResult] = await Promise.all([
      supabase
        .from("last_minute_levels")
        .select("*")
        .eq("hotel_id", hotelId)
        .order("sort_order", { ascending: true }),
      supabase
        .from("hotel_occupancy_bands")
        .select("*")
        .eq("hotel_id", hotelId)
        .order("sort_order", { ascending: true }),
      supabase
        .from("room_types")
        .select("total_rooms")
        .eq("hotel_id", hotelId)
        .eq("is_active", true),
    ])

    if (levelsResult.error) {
      return NextResponse.json({ error: levelsResult.error.message }, { status: 500 })
    }

    const levels = levelsResult.data || []
    const sharedBands = sharedBandsResult.data || []
    const totalRooms = (roomTypesResult.data || []).reduce(
      (sum: number, rt: any) => sum + (rt.total_rooms || 0),
      0
    )

    // Fetch discount matrix for all levels
    const levelIds = levels.map((l: any) => l.id)
    let discountsMap: Record<string, Record<string, any>> = {}
    
    if (levelIds.length > 0) {
      const { data: discounts } = await supabase
        .from("last_minute_level_discounts")
        .select("*")
        .in("level_id", levelIds)

      for (const d of discounts || []) {
        if (!discountsMap[d.level_id]) discountsMap[d.level_id] = {}
        discountsMap[d.level_id][d.band_id] = {
          discount_pct: d.discount_pct,
          discount_eur: d.discount_eur,
          discount_mode: d.discount_mode,
        }
      }
    }

    return NextResponse.json({
      levels,
      sharedBands,
      discountsMap,
      isAccelerator,
      totalRooms,
    })
  } catch (err: any) {
    console.error("Error in GET /api/settings/last-minute-levels:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// POST: save last minute levels with shared bands and discount matrix
export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthenticatedHotelId()
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const { hotelId, supabase } = auth

    const body = await req.json()
    const { levels, sharedBands, discountsMap } = body as {
      levels: Array<{
        id?: string
        name: string
        sort_order: number
        color?: string
      }>
      sharedBands: Array<{
        id?: string
        min_rooms: number
        max_rooms: number
        label?: string
        sort_order: number
      }>
      discountsMap: Record<string, Record<string, {
        discount_pct: number
        discount_eur?: number | null
        discount_mode?: string
      }>>
    }

    if (!levels || !Array.isArray(levels)) {
      return NextResponse.json({ error: "Dati non validi" }, { status: 400 })
    }

    // ------------------------------------------------------------------
    // SALVATAGGIO NON DISTRUTTIVO (fix 16/07/2026)
    //
    // PRIMA: il salvataggio faceva DELETE-all + reinsert di
    // `last_minute_levels` e `hotel_occupancy_bands`. Ogni salvataggio
    // rigenerava NUOVI UUID per i livelli. Ma la griglia pricing memorizza
    // per ogni data quale livello LM e' attivo in `pricing_algo_params`
    // (param_key='last_minute_level_id', param_value=<UUID livello>), che
    // NON e' una FK. Risultato: ogni salvataggio orfanava TUTTE le
    // assegnazioni per-data esistenti -> nella pagina Pricing il last
    // minute appariva "resettato" su tutte le date gia' configurate.
    //
    // ORA: riconciliamo per ID. I livelli/bande esistenti vengono
    // AGGIORNATI in-place (stesso UUID preservato), i nuovi inseriti, e
    // solo quelli realmente rimossi dall'utente vengono cancellati. Cosi'
    // le assegnazioni per-data restano valide.
    // ------------------------------------------------------------------

    // Carica gli ID esistenti per la riconciliazione
    const [existingLevelsRes, existingBandsRes] = await Promise.all([
      supabase.from("last_minute_levels").select("id").eq("hotel_id", hotelId),
      supabase.from("hotel_occupancy_bands").select("id").eq("hotel_id", hotelId),
    ])
    const existingLevelIds = new Set((existingLevelsRes.data || []).map((l: any) => l.id))
    const existingBandIds = new Set((existingBandsRes.data || []).map((b: any) => b.id))

    // Step 1: riconcilia i livelli preservando gli ID (index-aligned)
    const resolvedLevelIds: string[] = []
    const keptLevelIds = new Set<string>()
    for (let i = 0; i < levels.length; i++) {
      const l = levels[i]
      const row = {
        hotel_id: hotelId,
        name: l.name || `Livello ${i + 1}`,
        sort_order: i,
        color: l.color || "#6b7280",
        // Legacy fields - default values
        discount_pct: 0,
        discount_eur: 0,
        discount_mode: "pct",
        min_occupancy_pct: 0,
        max_occupancy_pct: 100,
        occupancy_mode: "num",
        min_occupancy_num: 0,
        max_occupancy_num: 0,
      }
      if (l.id && existingLevelIds.has(l.id)) {
        const { error } = await supabase
          .from("last_minute_levels")
          .update(row)
          .eq("id", l.id)
          .eq("hotel_id", hotelId)
        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
        resolvedLevelIds[i] = l.id
        keptLevelIds.add(l.id)
      } else {
        const { data, error } = await supabase
          .from("last_minute_levels")
          .insert(row)
          .select("id")
          .single()
        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
        resolvedLevelIds[i] = data.id
        keptLevelIds.add(data.id)
      }
    }
    // Cancella SOLO i livelli realmente rimossi dall'utente
    const levelsToDelete = [...existingLevelIds].filter((id) => !keptLevelIds.has(id as string))
    if (levelsToDelete.length > 0) {
      await supabase.from("last_minute_levels").delete().in("id", levelsToDelete).eq("hotel_id", hotelId)
    }

    // Step 2: riconcilia le bande preservando gli ID (index-aligned)
    const resolvedBandIds: string[] = []
    const keptBandIds = new Set<string>()
    for (let i = 0; i < (sharedBands || []).length; i++) {
      const b = sharedBands[i]
      const row = {
        hotel_id: hotelId,
        sort_order: i,
        min_rooms: b.min_rooms ?? 0,
        max_rooms: b.max_rooms ?? 0,
        label: b.label || `${b.min_rooms}-${b.max_rooms} camere`,
      }
      if (b.id && existingBandIds.has(b.id)) {
        const { error } = await supabase
          .from("hotel_occupancy_bands")
          .update(row)
          .eq("id", b.id)
          .eq("hotel_id", hotelId)
        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
        resolvedBandIds[i] = b.id
        keptBandIds.add(b.id)
      } else {
        const { data, error } = await supabase
          .from("hotel_occupancy_bands")
          .insert(row)
          .select("id")
          .single()
        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
        resolvedBandIds[i] = data.id
        keptBandIds.add(data.id)
      }
    }
    // Cancella SOLO le bande realmente rimosse (cascade sui relativi discounts)
    const bandsToDelete = [...existingBandIds].filter((id) => !keptBandIds.has(id as string))
    if (bandsToDelete.length > 0) {
      await supabase.from("hotel_occupancy_bands").delete().in("id", bandsToDelete).eq("hotel_id", hotelId)
    }

    // Step 3: ricostruisci la matrice sconti. I discounts NON sono
    // referenziati da altre tabelle, quindi e' sicuro azzerarli e
    // reinserirli per i livelli sopravvissuti (index-keyed dal frontend).
    if (resolvedLevelIds.length > 0) {
      await supabase.from("last_minute_level_discounts").delete().in("level_id", resolvedLevelIds)
    }

    const discountRows: any[] = []
    if (discountsMap) {
      for (const [levelKey, bandDiscounts] of Object.entries(discountsMap)) {
        const levelIndex = parseInt(levelKey)
        if (isNaN(levelIndex)) continue
        const newLevelId = resolvedLevelIds[levelIndex]
        if (!newLevelId) continue

        for (const [bandKey, discount] of Object.entries(bandDiscounts)) {
          const bandIndex = parseInt(bandKey)
          if (isNaN(bandIndex)) continue
          const newBandId = resolvedBandIds[bandIndex]
          if (!newBandId) continue

          discountRows.push({
            level_id: newLevelId,
            band_id: newBandId,
            discount_pct: discount.discount_pct ?? 0,
            discount_eur: discount.discount_eur ?? null,
            discount_mode: discount.discount_mode || "pct",
          })
        }
      }
    }

    if (discountRows.length > 0) {
      const { error } = await supabase
        .from("last_minute_level_discounts")
        .insert(discountRows)

      if (error) {
        console.error("Error saving discounts:", error)
      }
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error("Error in POST /api/settings/last-minute-levels:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
