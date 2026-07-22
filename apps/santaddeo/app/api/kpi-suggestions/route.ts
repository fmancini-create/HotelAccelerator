import { createClient } from "@/lib/supabase/server"
import { supabaseRetry } from "@/lib/supabase/retry"
import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"

// GET: fetch all KPI suggestions (public read for dashboard)
export async function GET() {
  const supabase = await createClient()

  try {
    const data = await supabaseRetry(() =>
      supabase
        .from("kpi_suggestions")
        .select("*")
        .eq("is_active", true)
        .order("sort_order", { ascending: true })
    )

    // Build a map: { [metric_key]: { orange: {...}, red: {...} } }
    const suggestionsMap: Record<string, Record<string, any>> = {}
    for (const row of data || []) {
      if (!suggestionsMap[row.metric_key]) {
        suggestionsMap[row.metric_key] = {}
      }
      suggestionsMap[row.metric_key][row.severity] = row
    }

    return NextResponse.json({ suggestions: data, suggestionsMap })
  } catch (error) {
    console.error("Error in KPI suggestions GET:", error)
    return NextResponse.json({ error: "Failed to fetch KPI suggestions" }, { status: 500 })
  }
}

// GET all including inactive (for SuperAdmin management)
// POST body: { action: "list_all" } or update/create
export async function POST(request: NextRequest) {
  const supabase = await createClient()

  try {
    const body = await request.json()

    // SuperAdmin: list all (including inactive)
    if (body.action === "list_all") {
      const { data, error } = await supabase
        .from("kpi_suggestions")
        .select("*")
        .order("sort_order", { ascending: true })

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      return NextResponse.json({ suggestions: data })
    }

    // SuperAdmin: upsert a suggestion
    const { id, metric_key, severity, label, description, suggestion, is_active, sort_order } = body

    if (!metric_key || !severity || !label || !suggestion) {
      return NextResponse.json(
        { error: "metric_key, severity, label e suggestion sono obbligatori" },
        { status: 400 }
      )
    }

    const upsertData: any = {
      metric_key,
      severity,
      label,
      description: description || "",
      suggestion,
      is_active: is_active !== undefined ? is_active : true,
      sort_order: sort_order || 0,
      updated_at: new Date().toISOString(),
    }

    if (id) {
      upsertData.id = id
    }

    const { data, error } = await supabase
      .from("kpi_suggestions")
      .upsert(upsertData, { onConflict: "metric_key,severity" })
      .select()
      .single()

    if (error) {
      console.error("Error upserting KPI suggestion:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error("Error in KPI suggestions POST:", error)
    return NextResponse.json({ error: "Failed to save KPI suggestion" }, { status: 500 })
  }
}

// DELETE: remove a suggestion
export async function DELETE(request: NextRequest) {
  const supabase = await createClient()
  const { searchParams } = new URL(request.url)
  const id = searchParams.get("id")

  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 })
  }

  try {
    const { error } = await supabase.from("kpi_suggestions").delete().eq("id", id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: "Failed to delete KPI suggestion" }, { status: 500 })
  }
}
