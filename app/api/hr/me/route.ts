import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getCallerIdentity } from "@/lib/auth/admin-access"
import { createServiceClient } from "@/lib/supabase/server"
import { isModuleActive } from "@/lib/modules"

const schema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("respond"),
    shift_id: z.string().uuid(),
    response: z.enum(["confirmed", "declined"]),
  }),
  z.object({
    action: z.literal("leave"),
    kind: z.enum(["holiday", "permission", "rol", "sickness", "unavailability"]),
    starts_on: z.string().date(),
    ends_on: z.string().date(),
    reason: z.string().max(500).optional(),
  }),
  z.object({
    action: z.literal("cancel_leave"),
    request_id: z.string().uuid(),
  }),
])

async function employee(req: NextRequest) {
  const identity = await getCallerIdentity(req)
  if (!identity?.propertyId || !identity.adminUserId) return null

  const db = createServiceClient()
  if (!(await isModuleActive(db, identity.propertyId, "hr"))) return null

  const result = await db
    .from("hr_employees")
    .select("id,property_id,first_name,last_name")
    .eq("property_id", identity.propertyId)
    .eq("admin_user_id", identity.adminUserId)
    .eq("employment_status", "active")
    .maybeSingle()

  return result.data ? { db, identity, employee: result.data } : null
}

export async function GET(req: NextRequest) {
  const context = await employee(req)
  if (!context) return NextResponse.json({ error: "employee_not_linked" }, { status: 403 })

  const [shifts, leaves] = await Promise.all([
    context.db
      .from("hr_shifts")
      .select("id,starts_at,ends_at,location,status,response_status")
      .eq("property_id", context.identity.propertyId)
      .eq("employee_id", context.employee.id)
      .gte("ends_at", new Date().toISOString())
      .neq("status", "cancelled")
      .order("starts_at"),
    context.db
      .from("hr_leave_requests")
      .select("id,kind,starts_on,ends_on,status")
      .eq("property_id", context.identity.propertyId)
      .eq("employee_id", context.employee.id)
      .order("created_at", { ascending: false })
      .limit(30),
  ])

  // Una query fallita NON e' "nessun turno": con `|| []` un errore di database
  // mostrava al dipendente un'agenda vuota, che e' indistinguibile dal non avere
  // turni assegnati. Meglio un errore visibile che far mancare qualcuno al lavoro.
  if (shifts.error || leaves.error) {
    console.error("[hr] agenda dipendente", shifts.error || leaves.error)
    return NextResponse.json({ error: "hr_me_load_failed" }, { status: 500 })
  }

  return NextResponse.json({
    employee: context.employee,
    shifts: shifts.data || [],
    leave_requests: leaves.data || [],
  })
}

export async function POST(req: NextRequest) {
  const context = await employee(req)
  if (!context) return NextResponse.json({ error: "employee_not_linked" }, { status: 403 })

  const parsed = schema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: "invalid_payload" }, { status: 400 })

  if (parsed.data.action === "respond") {
    const result = await context.db
      .from("hr_shifts")
      .update({ response_status: parsed.data.response, updated_at: new Date().toISOString() })
      .eq("id", parsed.data.shift_id)
      .eq("property_id", context.identity.propertyId)
      .eq("employee_id", context.employee.id)
      .eq("status", "published")
      .select()
      .maybeSingle()

    // Turno inesistente, non suo o non ancora pubblicato: rispondere 200 con `null`
    // faceva credere al dipendente di aver confermato, mentre il responsabile
    // continuava a vedere "in attesa".
    if (result.error) {
      console.error("[hr] risposta turno", result.error)
      return NextResponse.json({ error: "respond_failed" }, { status: 500 })
    }
    if (!result.data) return NextResponse.json({ error: "shift_not_respondable" }, { status: 409 })
    return NextResponse.json(result.data)
  }

  if (parsed.data.action === "cancel_leave") {
    const result = await context.db
      .from("hr_leave_requests")
      .update({ status: "cancelled" })
      .eq("id", parsed.data.request_id)
      .eq("property_id", context.identity.propertyId)
      .eq("employee_id", context.employee.id)
      .eq("status", "pending")
      .select()
      .maybeSingle()

    if (result.error) {
      console.error("[hr] annullamento assenza", result.error)
      return NextResponse.json({ error: "leave_cancel_failed" }, { status: 500 })
    }
    if (!result.data) return NextResponse.json({ error: "leave_not_cancellable" }, { status: 409 })
    return NextResponse.json(result.data)
  }

  if (parsed.data.ends_on < parsed.data.starts_on) {
    return NextResponse.json({ error: "invalid_range" }, { status: 400 })
  }

  const result = await context.db
    .from("hr_leave_requests")
    .insert({
      property_id: context.identity.propertyId,
      employee_id: context.employee.id,
      kind: parsed.data.kind,
      starts_on: parsed.data.starts_on,
      ends_on: parsed.data.ends_on,
      reason: parsed.data.reason || null,
    })
    .select()
    .single()

  // Senza questo controllo un inserimento rifiutato tornava 201 con corpo `null`:
  // il dipendente vedeva la richiesta accettata e nessuno la riceveva.
  if (result.error) {
    console.error("[hr] richiesta assenza", result.error)
    return NextResponse.json({ error: "leave_failed" }, { status: 500 })
  }

  return NextResponse.json(result.data, { status: 201 })
}
