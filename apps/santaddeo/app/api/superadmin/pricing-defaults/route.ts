import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"

// GET: Read all default templates (band groups + bands + LM levels)
export async function GET() {
  try {
    const supabase = await createClient()

    const [groupsRes, bandsRes, lmRes] = await Promise.all([
      supabase.from("default_band_group_templates").select("*").order("sort_order"),
      supabase.from("default_band_templates").select("*").order("group_id").order("band_index"),
      supabase.from("default_lm_level_templates").select("*").order("sort_order"),
    ])

    if (groupsRes.error) throw groupsRes.error
    if (bandsRes.error) throw bandsRes.error
    if (lmRes.error) throw lmRes.error

    // Nest bands inside groups
    const bandGroups = (groupsRes.data || []).map((g) => ({
      ...g,
      bands: (bandsRes.data || []).filter((b) => b.group_id === g.id),
    }))

    return NextResponse.json({
      bandGroups,
      lmLevels: lmRes.data || [],
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error"
    console.error("[error] pricing-defaults GET:", msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// PUT: Update a default template entry
export async function PUT(request: Request) {
  try {
    const supabase = await createClient()
    const body = await request.json()
    const { table, id, data } = body as { table: string; id: string; data: Record<string, unknown> }

    const allowedTables = ["default_band_group_templates", "default_band_templates", "default_lm_level_templates"]
    if (!allowedTables.includes(table)) {
      return NextResponse.json({ error: "Invalid table" }, { status: 400 })
    }

    const { error } = await supabase.from(table).update(data).eq("id", id)
    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error"
    console.error("[error] pricing-defaults PUT:", msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// POST: Apply defaults to a specific hotel
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { hotelId } = (await request.json()) as { hotelId: string }
    if (!hotelId) return NextResponse.json({ error: "hotelId required" }, { status: 400 })

    // 1. Load default templates
    const [groupsRes, bandsRes, lmRes] = await Promise.all([
      supabase.from("default_band_group_templates").select("*").order("sort_order"),
      supabase.from("default_band_templates").select("*").order("group_id").order("band_index"),
      supabase.from("default_lm_level_templates").select("*").order("sort_order"),
    ])
    if (groupsRes.error) throw groupsRes.error
    if (bandsRes.error) throw bandsRes.error
    if (lmRes.error) throw lmRes.error

    // 2. Check if hotel already has band groups
    const { data: existingGroups } = await supabase
      .from("occupancy_band_groups")
      .select("id")
      .eq("hotel_id", hotelId)
      .limit(1)

    if (existingGroups && existingGroups.length > 0) {
      return NextResponse.json({
        error: "La struttura ha gia delle fasce configurate. Eliminale prima di applicare i default.",
        hasExisting: true,
      }, { status: 409 })
    }

    // 3. Create band groups for this hotel
    const newGroups = (groupsRes.data || []).map((g) => ({
      hotel_id: hotelId,
      name: g.name,
      sort_order: g.sort_order,
    }))

    const { data: insertedGroups, error: gErr } = await supabase
      .from("occupancy_band_groups")
      .insert(newGroups)
      .select("id, name, sort_order")

    if (gErr) throw gErr
    if (!insertedGroups) throw new Error("No groups returned after insert")

    // 4. Create bands for each group
    const bandInserts: Array<Record<string, unknown>> = []
    for (const ig of insertedGroups) {
      // Find the corresponding default group by sort_order
      const defaultGroup = (groupsRes.data || []).find((dg) => dg.sort_order === ig.sort_order)
      if (!defaultGroup) continue

      const defaultBands = (bandsRes.data || []).filter((b) => b.group_id === defaultGroup.id)
      for (const db of defaultBands) {
        bandInserts.push({
          hotel_id: hotelId,
          group_id: ig.id,
          band_index: db.band_index,
          min_pct: db.min_pct,
          max_pct: db.max_pct,
          increment_pct: db.increment_pct,
          label: db.label,
          occupancy_mode: "pct",
          increment_mode: "pct",
        })
      }
    }

    if (bandInserts.length > 0) {
      const { error: bErr } = await supabase.from("occupancy_bands").insert(bandInserts)
      if (bErr) throw bErr
    }

    // 5. Check if hotel already has LM levels
    const { data: existingLm } = await supabase
      .from("last_minute_levels")
      .select("id")
      .eq("hotel_id", hotelId)
      .limit(1)

    if (!existingLm || existingLm.length === 0) {
      // Create LM levels for this hotel
      const lmInserts = (lmRes.data || []).map((l) => ({
        hotel_id: hotelId,
        name: l.name,
        sort_order: l.sort_order,
        color: l.color,
        discount_pct: l.discount_pct,
        min_occupancy_pct: l.min_occupancy_pct,
        max_occupancy_pct: l.max_occupancy_pct,
        occupancy_mode: "pct",
        min_occupancy_num: 0,
        max_occupancy_num: 0,
      }))

      const { error: lErr } = await supabase.from("last_minute_levels").insert(lmInserts)
      if (lErr) throw lErr
    }

    return NextResponse.json({
      success: true,
      groupsCreated: insertedGroups.length,
      bandsCreated: bandInserts.length,
    })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error"
    console.error("[error] pricing-defaults POST:", msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
