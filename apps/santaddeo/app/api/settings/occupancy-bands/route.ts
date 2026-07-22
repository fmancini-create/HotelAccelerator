import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { isDevAuthAsync } from "@/lib/env/dev-auth"
import { cookies } from "next/headers"

async function getAuthenticatedHotelId() {
  const isV0Preview = await isDevAuthAsync()
  const adminClient = await createClient()

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

  // Resolve hotel_id following the same logic as /api/ui/selected-hotel
  const cookieStore = await cookies()
  let hotelId: string | null = null

  // Priority 1: SuperAdmin with impersonation cookie
  if (isSuperAdmin) {
    const impersonatedHotelId = cookieStore.get("impersonated_hotel_id")?.value
    if (impersonatedHotelId) {
      hotelId = impersonatedHotelId
    } else {
      // Priority 2: SuperAdmin without impersonation -> first hotel in system
      const { data: hotels } = await adminClient
        .from("hotels")
        .select("id")
        .order("created_at", { ascending: true })
        .limit(1)
      hotelId = hotels?.[0]?.id || null
    }
  }
  // Priority 3: Regular user -> hotel from their organization
  else if (profile?.organization_id) {
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

export async function GET(_req: NextRequest) {
  try {
    const auth = await getAuthenticatedHotelId()
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const { hotelId, role, supabase } = auth

    // Check subscription
    const { data: subscription } = await supabase
      .from("accelerator_subscriptions")
      .select("is_active")
      .eq("hotel_id", hotelId)
      .eq("is_active", true)
      .maybeSingle()

    const isAccelerator = role === "super_admin" || !!subscription?.is_active

    // Fetch groups, bands, and room types in parallel
    const [groupsResult, bandsResult, roomTypesResult] = await Promise.all([
      supabase
        .from("occupancy_band_groups")
        .select("*")
        .eq("hotel_id", hotelId)
        .order("sort_order", { ascending: true }),
      supabase
        .from("occupancy_bands")
        .select("*")
        .eq("hotel_id", hotelId)
        .order("band_index", { ascending: true }),
      supabase
        .from("room_types")
        .select("total_rooms")
        .eq("hotel_id", hotelId)
        .eq("is_active", true),
    ])

    if (groupsResult.error) {
      return NextResponse.json({ error: groupsResult.error.message }, { status: 500 })
    }
    if (bandsResult.error) {
      return NextResponse.json({ error: bandsResult.error.message }, { status: 500 })
    }

    const groups = groupsResult.data
    const bands = bandsResult.data
    const roomTypes = roomTypesResult.data

    const totalRooms = (roomTypes || []).reduce((sum, rt) => sum + (rt.total_rooms || 0), 0)

    // Build nested structure: groups with their bands
    const groupsWithBands = (groups || []).map((g) => ({
      ...g,
      bands: (bands || []).filter((b) => b.group_id === g.id),
    }))

    // Flat bands for backward compatibility
    return NextResponse.json({
      groups: groupsWithBands,
      bands: bands || [],
      isAccelerator,
      totalRooms,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthenticatedHotelId()
    if ("error" in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status })
    }

    const { hotelId, role, supabase } = auth

    // Check subscription - only allow edits if accelerator is active
    const { data: subscription } = await supabase
      .from("accelerator_subscriptions")
      .select("is_active")
      .eq("hotel_id", hotelId)
      .eq("is_active", true)
      .maybeSingle()

    const isAccelerator = role === "super_admin" || !!subscription?.is_active
    if (!isAccelerator) {
      return NextResponse.json({ error: "Accelerator non attivo. Attiva Accelerator per modificare le fasce." }, { status: 403 })
    }

    const body = await req.json()
    const { groups } = body as {
      groups: Array<{
        id?: string
        name: string
        sort_order: number
        color?: string
        bands: Array<{
          min_pct: number; max_pct: number; label?: string;
          increment_pct: number; increment_eur?: number;
          occupancy_mode?: string; increment_mode?: string;
          min_num?: number; max_num?: number;
        }>
      }>
    }

    if (!groups || !Array.isArray(groups)) {
      return NextResponse.json({ error: "Dati non validi" }, { status: 400 })
    }

    // FIX 17/05/2026: NON fare piu' DELETE + INSERT dei gruppi.
    // Il vecchio comportamento generava nuovi UUID a ogni salvataggio,
    // rompendo i riferimenti in `pricing_algo_params.param_value` (chiave
    // `band_group_id`). Risultato: i livelli di domanda salvati per data
    // diventavano orfani e la UI mostrava "non impostato".
    //
    // Nuovo flusso:
    // 1) Carico i gruppi esistenti (id + name).
    // 2) Per ogni gruppo incoming: se l'id matcha un esistente -> UPDATE.
    //    Altrimenti se il name matcha (case-insensitive) un esistente non
    //    ancora consumato -> riuso il suo id e UPDATE.
    //    Altrimenti -> INSERT nuovo.
    // 3) Cancello i gruppi DB rimasti non-matchati (non piu' presenti).
    // 4) Per le bande: DELETE+INSERT per group_id e' SICURO perche'
    //    nessuna FK pricing fa riferimento a `occupancy_bands.id`.
    const { data: existingGroups } = await supabase
      .from("occupancy_band_groups")
      .select("id, name")
      .eq("hotel_id", hotelId)

    const remainingExisting = new Map<string, { id: string; nameLower: string }>()
    for (const eg of existingGroups || []) {
      remainingExisting.set(eg.id, { id: eg.id, nameLower: (eg.name || "").trim().toLowerCase() })
    }
    const consumedIds = new Set<string>()

    function pickExistingId(incomingId: string | undefined, incomingName: string): string | null {
      // 1) Exact id match
      if (incomingId && remainingExisting.has(incomingId) && !consumedIds.has(incomingId)) {
        consumedIds.add(incomingId)
        return incomingId
      }
      // 2) Name match (case-insensitive) on unconsumed groups
      const target = incomingName.trim().toLowerCase()
      for (const [id, info] of remainingExisting.entries()) {
        if (consumedIds.has(id)) continue
        if (info.nameLower === target) {
          consumedIds.add(id)
          return id
        }
      }
      return null
    }

    const finalGroupIds: string[] = []

    for (let gi = 0; gi < groups.length; gi++) {
      const group = groups[gi]
      const desiredName = group.name || `Gruppo ${gi + 1}`
      const desiredColor = group.color || "#6b7280"

      const reuseId = pickExistingId(group.id, desiredName)
      let groupId: string

      if (reuseId) {
        const { error: uErr } = await supabase
          .from("occupancy_band_groups")
          .update({ name: desiredName, sort_order: gi, color: desiredColor })
          .eq("id", reuseId)
          .eq("hotel_id", hotelId)
        if (uErr) {
          return NextResponse.json({ error: uErr.message }, { status: 500 })
        }
        groupId = reuseId
      } else {
        const { data: insertedGroup, error: gErr } = await supabase
          .from("occupancy_band_groups")
          .insert({
            hotel_id: hotelId,
            name: desiredName,
            sort_order: gi,
            color: desiredColor,
          })
          .select("id")
          .single()

        if (gErr || !insertedGroup) {
          return NextResponse.json({ error: gErr?.message || "Errore creazione gruppo" }, { status: 500 })
        }
        groupId = insertedGroup.id
      }

      finalGroupIds.push(groupId)

      // Bands: safe to DELETE+INSERT (no FK from pricing_algo_params to occupancy_bands.id)
      await supabase.from("occupancy_bands").delete().eq("hotel_id", hotelId).eq("group_id", groupId)

      if (group.bands && group.bands.length > 0) {
        const rows = group.bands.map((b: any, i: number) => ({
          hotel_id: hotelId,
          group_id: groupId,
          band_index: i,
          min_pct: b.min_pct ?? 0,
          max_pct: b.max_pct ?? 100,
          min_num: b.min_num ?? 0,
          max_num: b.max_num ?? 0,
          label: b.label || `Fascia ${i + 1}`,
          increment_pct: b.increment_pct || 0,
          increment_eur: b.increment_eur || 0,
          occupancy_mode: b.occupancy_mode || "pct",
          increment_mode: b.increment_mode || "pct",
        }))

        const { error: bErr } = await supabase.from("occupancy_bands").insert(rows)
        if (bErr) {
          return NextResponse.json({ error: bErr.message }, { status: 500 })
        }
      }
    }

    // Delete groups that were not matched (user removed them from the UI).
    // Cascade: bands gone via FK on group_id, and any pricing_algo_params
    // referencing them will become orphan but the next /pricing-params write
    // will overwrite, and the UI handles "not found" gracefully.
    const toDelete: string[] = []
    for (const [id] of remainingExisting.entries()) {
      if (!consumedIds.has(id)) toDelete.push(id)
    }
    if (toDelete.length > 0) {
      await supabase.from("occupancy_bands").delete().eq("hotel_id", hotelId).in("group_id", toDelete)
      await supabase.from("occupancy_band_groups").delete().eq("hotel_id", hotelId).in("id", toDelete)
    }

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
