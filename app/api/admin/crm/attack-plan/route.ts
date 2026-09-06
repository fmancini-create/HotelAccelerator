import { type NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { getCurrentProperty } from "@/lib/auth-property"
import { isAreaDenied, areaDeniedResponse } from "@/lib/auth/area-denied"
import { requireAreaApi } from "@/lib/auth/area-access"

type AttackAction = { id: string; text: string; done: boolean }

export async function GET(request: NextRequest) {
  try {
    await requireAreaApi("crm", request)
    const propertyId = await getCurrentProperty(request)
    if (!propertyId) return NextResponse.json({ error: "Property not found" }, { status: 404 })

    const supabase = createServiceClient()
    const { data, error } = await supabase
      .from("crm_attack_plan_days")
      .select("id, day_number, plan_date, phase, objective, actions, kpi_target, avoid_today, notes, status, completed_at")
      .eq("property_id", propertyId)
      .order("day_number", { ascending: true })
    if (error) throw error

    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date())
    const rows = data ?? []
    return NextResponse.json({ days: rows, today: rows.find((row) => row.plan_date === today) ?? null, today_date: today })
  } catch (error) {
    if (isAreaDenied(error)) return areaDeniedResponse(error)
    console.error("Error fetching CRM attack plan:", error)
    return NextResponse.json({ error: "Failed to fetch attack plan" }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    await requireAreaApi("crm", request)
    const propertyId = await getCurrentProperty(request)
    if (!propertyId) return NextResponse.json({ error: "Property not found" }, { status: 404 })

    const body = (await request.json()) as { day_id?: string; action_id?: string; done?: boolean; notes?: string }
    if (!body.day_id) return NextResponse.json({ error: "day_id required" }, { status: 400 })

    const supabase = createServiceClient()
    const { data: day, error: loadError } = await supabase
      .from("crm_attack_plan_days")
      .select("id, actions")
      .eq("id", body.day_id)
      .eq("property_id", propertyId)
      .maybeSingle()
    if (loadError) throw loadError
    if (!day) return NextResponse.json({ error: "Day not found" }, { status: 404 })

    const actions = ((day.actions ?? []) as AttackAction[]).map((action) =>
      body.action_id && action.id === body.action_id ? { ...action, done: body.done === true } : action,
    )
    const allDone = actions.length > 0 && actions.every((action) => action.done)
    const update: Record<string, unknown> = {
      actions,
      status: allDone ? "done" : "open",
      completed_at: allDone ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    }
    if (typeof body.notes === "string") update.notes = body.notes.slice(0, 4000)

    const { data, error } = await supabase
      .from("crm_attack_plan_days")
      .update(update)
      .eq("id", body.day_id)
      .eq("property_id", propertyId)
      .select("id, day_number, plan_date, phase, objective, actions, kpi_target, avoid_today, notes, status, completed_at")
      .single()
    if (error) throw error
    return NextResponse.json(data)
  } catch (error) {
    if (isAreaDenied(error)) return areaDeniedResponse(error)
    console.error("Error updating CRM attack plan:", error)
    return NextResponse.json({ error: "Failed to update attack plan" }, { status: 500 })
  }
}
