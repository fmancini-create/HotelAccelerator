import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import {
  AccessError,
  accessErrorStatus,
  adminUserIdPerDatabase,
  requireTenantAdmin,
} from "@/lib/auth/admin-access"
import { isModuleActive } from "@/lib/modules"
import { createServiceClient } from "@/lib/supabase/server"

const patchSchema = z.object({
  employee_id: z.string().uuid(),
  requires_time_clock: z.boolean(),
})

async function context(request: NextRequest) {
  const identity = await requireTenantAdmin(request)
  const db = createServiceClient()

  if (!(await isModuleActive(db, identity.propertyId, "hr"))) {
    throw new AccessError("Modulo HR non attivo", 403)
  }

  return { identity, db }
}

export async function GET(request: NextRequest) {
  try {
    const { identity, db } = await context(request)
    const result = await db
      .from("hr_employees")
      .select("id,first_name,last_name,admin_user_id,requires_time_clock,employment_status")
      .eq("property_id", identity.propertyId)
      .eq("employment_status", "active")
      .order("last_name")
      .order("first_name")

    if (result.error) throw result.error

    return NextResponse.json(
      { employees: result.data ?? [] },
      { headers: { "Cache-Control": "no-store" } },
    )
  } catch (error) {
    console.error("[hr] time-clock requirements load", error)
    return NextResponse.json(
      { error: "time_clock_requirements_load_failed" },
      { status: accessErrorStatus(error) },
    )
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { identity, db } = await context(request)
    const parsed = patchSchema.safeParse(await request.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json(
        { error: "invalid_payload", details: parsed.error.flatten() },
        { status: 400 },
      )
    }

    const current = await db
      .from("hr_employees")
      .select("id,admin_user_id,requires_time_clock")
      .eq("id", parsed.data.employee_id)
      .eq("property_id", identity.propertyId)
      .eq("employment_status", "active")
      .maybeSingle()

    if (current.error) throw current.error
    if (!current.data) {
      return NextResponse.json({ error: "employee_not_found" }, { status: 404 })
    }

    // Il gate vive nel login HotelAccelerator: abilitarlo su una scheda HR non
    // collegata a un account sarebbe una configurazione apparentemente valida ma
    // impossibile da applicare. Falliamo in modo esplicito invece di mentire.
    if (parsed.data.requires_time_clock && !current.data.admin_user_id) {
      return NextResponse.json({ error: "employee_account_required" }, { status: 409 })
    }

    const now = new Date().toISOString()
    const updated = await db
      .from("hr_employees")
      .update({
        requires_time_clock: parsed.data.requires_time_clock,
        updated_at: now,
      })
      .eq("id", parsed.data.employee_id)
      .eq("property_id", identity.propertyId)
      .select("id,admin_user_id,requires_time_clock")
      .maybeSingle()

    if (updated.error) throw updated.error
    if (!updated.data) {
      return NextResponse.json({ error: "employee_not_found" }, { status: 404 })
    }

    const audit = await db.from("hr_audit_log").insert({
      property_id: identity.propertyId,
      actor_admin_user_id: adminUserIdPerDatabase(identity.adminUserId),
      employee_id: updated.data.id,
      action: "employee_time_clock_requirement_changed",
      entity_type: "employee",
      entity_id: updated.data.id,
      metadata: {
        previous_requires_time_clock: Boolean(current.data.requires_time_clock),
        requires_time_clock: updated.data.requires_time_clock,
      },
    })

    if (audit.error) {
      console.error("[hr] time-clock requirement audit failed", {
        property_id: identity.propertyId,
        employee_id: updated.data.id,
        error: audit.error.message,
      })
    }

    return NextResponse.json(updated.data)
  } catch (error) {
    console.error("[hr] time-clock requirement save", error)
    return NextResponse.json(
      { error: "time_clock_requirement_save_failed" },
      { status: accessErrorStatus(error) },
    )
  }
}
