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

const settingsSchema = z.object({
  location_name: z.string().trim().min(3).max(120),
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  geofence_radius_m: z.coerce.number().int().min(25).max(5000),
  require_geolocation: z.boolean(),
  allow_outside_geofence: z.boolean(),
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
    const query = await db
      .from("hr_settings")
      .select(
        "location_name,latitude,longitude,geofence_radius_m,require_geolocation,allow_outside_geofence,updated_at",
      )
      .eq("property_id", identity.propertyId)
      .maybeSingle()

    if (query.error) throw query.error
    return NextResponse.json({ settings: query.data })
  } catch (error) {
    return NextResponse.json({ error: "hr_settings_load_failed" }, { status: accessErrorStatus(error) })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { identity, db } = await context(request)
    const parsed = settingsSchema.safeParse(await request.json())
    if (!parsed.success) {
      return NextResponse.json(
        { error: "invalid_payload", details: parsed.error.flatten() },
        { status: 400 },
      )
    }

    const body = parsed.data
    const updatedAt = new Date().toISOString()
    const query = await db
      .from("hr_settings")
      .upsert(
        {
          property_id: identity.propertyId,
          ...body,
          updated_by: adminUserIdPerDatabase(identity.adminUserId),
          updated_at: updatedAt,
        },
        { onConflict: "property_id" },
      )
      .select(
        "location_name,latitude,longitude,geofence_radius_m,require_geolocation,allow_outside_geofence,updated_at",
      )
      .single()

    if (query.error) throw query.error

    const audit = await db.from("hr_audit_log").insert({
      property_id: identity.propertyId,
      actor_admin_user_id: adminUserIdPerDatabase(identity.adminUserId),
      action: "hr_geofence_settings_updated",
      entity_type: "hr_settings",
      entity_id: null,
      metadata: {
        location_name: body.location_name,
        geofence_radius_m: body.geofence_radius_m,
        require_geolocation: body.require_geolocation,
        allow_outside_geofence: body.allow_outside_geofence,
      },
    })

    if (audit.error) {
      console.error("[hr-settings] audit", audit.error)
    }

    return NextResponse.json({ settings: query.data, audit_recorded: !audit.error })
  } catch (error) {
    console.error("[hr-settings] save", error)
    return NextResponse.json({ error: "hr_settings_save_failed" }, { status: accessErrorStatus(error) })
  }
}
