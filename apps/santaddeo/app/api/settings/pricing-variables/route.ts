import { createClient } from "@/lib/supabase/server"
import { type NextRequest, NextResponse } from "next/server"

// POST: Create a new pricing variable
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const body = await request.json()
    const { variable_key, label, description, category, data_type, default_weight, is_active } = body
    
    if (!variable_key || !label) {
      return NextResponse.json({ error: "variable_key and label required" }, { status: 400 })
    }
    
    // Get max sort_order
    const { data: maxSort } = await supabase
      .from("pricing_variables")
      .select("sort_order")
      .order("sort_order", { ascending: false })
      .limit(1)
      .single()
    
    const sortOrder = (maxSort?.sort_order || 0) + 1
    
    const { data, error } = await supabase
      .from("pricing_variables")
      .insert({
        variable_key,
        label,
        description: description || null,
        category: category || "custom",
        data_type: data_type || "numeric",
        default_weight: default_weight ?? 5,
        weight_min: 0,
        weight_max: 10,
        is_active: is_active ?? true,
        sort_order: sortOrder,
      })
      .select()
      .single()
    
    if (error) {
      console.error("[v0] pricing-variables POST error:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    
    console.log("[v0] pricing-variables POST - created variable:", data.id)
    return NextResponse.json({ variable: data })
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error"
    console.error("[v0] pricing-variables POST error:", errorMessage)
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}

// PUT: Update a pricing variable by ID (full update)
export async function PUT(request: NextRequest) {
  try {
    const supabase = await createClient()
    const body = await request.json()
    const { id, label, description, category, default_weight, is_active } = body
    
    if (!id) {
      return NextResponse.json({ error: "Variable ID required" }, { status: 400 })
    }
    
    const updates: Record<string, unknown> = {}
    if (label) updates.label = label
    if (description !== undefined) updates.description = description
    if (category) updates.category = category
    if (typeof default_weight === "number") updates.default_weight = default_weight
    if (typeof is_active === "boolean") updates.is_active = is_active
    
    const { data, error } = await supabase
      .from("pricing_variables")
      .update(updates)
      .eq("id", id)
      .select()
      .single()
    
    if (error) {
      console.error("[v0] pricing-variables PUT error:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    
    console.log("[v0] pricing-variables PUT - updated variable:", id)
    return NextResponse.json({ variable: data })
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error"
    console.error("[v0] pricing-variables PUT error:", errorMessage)
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}

// DELETE: Delete a pricing variable
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    const id = searchParams.get("id")
    
    if (!id) {
      return NextResponse.json({ error: "Variable ID required" }, { status: 400 })
    }
    
    const { error } = await supabase
      .from("pricing_variables")
      .delete()
      .eq("id", id)
    
    if (error) {
      console.error("[v0] pricing-variables DELETE error:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    
    console.log("[v0] pricing-variables DELETE - deleted variable:", id)
    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error"
    console.error("[v0] pricing-variables DELETE error:", errorMessage)
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}

// PATCH: Update a pricing variable (toggle is_active, update weight, etc.)
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient()
    const body = await request.json()
    const { id, is_active, default_weight } = body
    
    if (!id) {
      return NextResponse.json({ error: "Variable ID required" }, { status: 400 })
    }
    
    const updates: Record<string, unknown> = {}
    if (typeof is_active === "boolean") {
      updates.is_active = is_active
    }
    if (typeof default_weight === "number") {
      updates.default_weight = default_weight
    }
    
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No valid updates provided" }, { status: 400 })
    }
    
    const { data, error } = await supabase
      .from("pricing_variables")
      .update(updates)
      .eq("id", id)
      .select()
      .single()
    
    if (error) {
      console.error("[v0] pricing-variables PATCH error:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    
    console.log("[v0] pricing-variables PATCH - updated variable:", id, updates)
    return NextResponse.json({ variable: data })
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error"
    console.error("[v0] pricing-variables PATCH error:", errorMessage)
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    // Use service role to bypass RLS
    const supabase = await createClient()
    const showAll = request.nextUrl.searchParams.get("all") === "1"
    // FASE 6 (12/05/2026): includeDeprecated=1 esposto SOLO per il pannello
    // superadmin (vista di audit). La UI tenant /accelerator/pricing NON
    // deve mai vedere le legacy disattivate (weather_forecast, holidays,
    // visite_sito ecc.) ne' le k_* consolidate (k_season_high/mid/low,
    // k_weather_positive/negative, ecc.). Filtro di default: deprecated=false.
    const includeDeprecated = request.nextUrl.searchParams.get("includeDeprecated") === "1"
    console.log("[v0] pricing-variables API - showAll:", showAll, "includeDeprecated:", includeDeprecated)

    // Try with is_locked + deprecated first, fallback to without them for DEV database compatibility
    let query = supabase
      .from("pricing_variables")
      .select("id, variable_key, label, description, category, data_type, unit, default_weight, weight_min, weight_max, is_active, is_locked, sort_order, deprecated, replaced_by")
    if (!showAll) {
      query = query.eq("is_active", true)
    }
    if (!includeDeprecated) {
      query = query.eq("deprecated", false)
    }
    let { data: variables, error } = await query.order("sort_order", { ascending: true })

    // If is_locked OR deprecated column doesn't exist, retry without it
    if (
      error?.message?.includes("is_locked") ||
      error?.message?.includes("deprecated") ||
      error?.message?.includes("replaced_by")
    ) {
      console.log("[v0] pricing-variables API - new columns not found, retrying with legacy schema")
      let fallbackQuery = supabase
        .from("pricing_variables")
        .select("id, variable_key, label, description, category, data_type, unit, default_weight, weight_min, weight_max, is_active, sort_order")
      if (!showAll) {
        fallbackQuery = fallbackQuery.eq("is_active", true)
      }
      const fallbackResult = await fallbackQuery.order("sort_order", { ascending: true })
      variables =
        fallbackResult.data?.map((v) => ({
          ...v,
          is_locked: false,
          deprecated: false,
          replaced_by: null,
        })) || []
      error = fallbackResult.error
    }

    if (error) {
      console.error("[v0] Error loading pricing variables:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    console.log("[v0] pricing-variables API - returning", variables?.length, "variables")

    // 07/07/2026: quando la griglia pricing chiede le variabili passa anche
    // hotelId. In quel caso restituiamo gli override di peso ATTIVI dell'hotel
    // (limitati alle variabili restituite) cosi' il client puo' calcolare il K
    // per-data con lo STESSO peso del motore server. Backward compatible: senza
    // hotelId la risposta e' identica a prima.
    const hotelId = request.nextUrl.searchParams.get("hotelId") || request.nextUrl.searchParams.get("hotel_id")
    let weightOverrides: unknown[] = []
    if (hotelId && variables && variables.length > 0) {
      const variableIds = variables.map((v) => v.id)
      const { data: overrideRows, error: overrideErr } = await supabase
        .from("pricing_variable_weight_overrides")
        .select("*")
        .eq("hotel_id", hotelId)
        .eq("is_active", true)
        .in("variable_id", variableIds)
      if (overrideErr) {
        // Non fatale: senza override il client cade su default_weight (come prima).
        console.warn("[v0] pricing-variables API - weight overrides fetch error:", overrideErr.message)
      } else {
        weightOverrides = overrideRows || []
      }
    }

    return NextResponse.json({ variables: variables || [], weightOverrides })
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error"
    console.error("[v0] Pricing variables API error:", errorMessage)
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}
