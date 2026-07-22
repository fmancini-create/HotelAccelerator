import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

/**
 * PATCH /api/settings/reorder
 * Saves display_order for room_types or rates in batch.
 * Body: { table: "room_types" | "rates", items: [{ id: string, display_order: number }] }
 */
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { table, items } = await request.json()

    if (!table || !["room_types", "rates"].includes(table)) {
      return NextResponse.json({ error: "Invalid table. Must be 'room_types' or 'rates'" }, { status: 400 })
    }
    if (!items || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "items array is required" }, { status: 400 })
    }

    // Validate items
    for (const item of items) {
      if (!item.id || typeof item.display_order !== "number") {
        return NextResponse.json({ error: "Each item must have id and display_order (number)" }, { status: 400 })
      }
    }

    // Update all items in parallel
    const updates = items.map((item: { id: string; display_order: number }) =>
      supabase
        .from(table)
        .update({ display_order: item.display_order, updated_at: new Date().toISOString() })
        .eq("id", item.id),
    )

    const results = await Promise.all(updates)
    const errors = results.filter((r) => r.error)

    if (errors.length > 0) {
      console.error("Reorder errors:", errors.map((e) => e.error))
      return NextResponse.json({ error: "Failed to update some items" }, { status: 500 })
    }

    return NextResponse.json({ success: true, count: items.length })
  } catch (error) {
    console.error("Reorder API error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
