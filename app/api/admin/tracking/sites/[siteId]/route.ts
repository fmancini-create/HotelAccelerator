/**
 * Admin: update or delete a single tracking_site for the selected tenant.
 * PATCH accepts { name?, allowed_origins?, is_active?, rotate_key? }.
 */
import { NextResponse, type NextRequest } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { getCallerIdentity } from "@/lib/auth/admin-access"
import { requireAreaApi } from "@/lib/auth/area-access"
import { isAreaDenied, areaDeniedResponse } from "@/lib/auth/area-denied"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

async function requireProperty(request?: NextRequest) {
  const identity = await getCallerIdentity(request)
  if (!identity) {
    return { supabase: null, propertyId: null, error: NextResponse.json({ error: "unauthenticated" }, { status: 401 }) }
  }
  if (!identity.propertyId) {
    return { supabase: null, propertyId: null, error: NextResponse.json({ error: "no property" }, { status: 400 }) }
  }

  try {
    await requireAreaApi("tracking", request)
  } catch (e) {
    if (isAreaDenied(e)) return { supabase: null, propertyId: null, error: areaDeniedResponse(e) }
    throw e
  }

  return { supabase: createServiceClient(), propertyId: identity.propertyId, error: null }
}

function generateWriteKey(): string {
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  const b64 = Buffer.from(bytes).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")
  return `tw_${b64}`
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params
  const { supabase, propertyId, error } = await requireProperty(req)
  if (error || !supabase || !propertyId) return error!

  const body = await req.json().catch(() => ({}))
  const patch: Record<string, unknown> = {}
  if (typeof body?.name === "string") patch.name = body.name.trim() || "Senza nome"
  if (typeof body?.is_active === "boolean") patch.is_active = body.is_active
  if (Array.isArray(body?.allowed_origins))
    patch.allowed_origins = body.allowed_origins.map((s: unknown) => String(s).trim()).filter(Boolean)
  if (body?.rotate_key === true) patch.write_key = generateWriteKey()

  if (Object.keys(patch).length === 0)
    return NextResponse.json({ error: "nothing to update" }, { status: 400 })

  const { data, error: dbErr } = await supabase
    .from("tracking_sites")
    .update(patch)
    .eq("id", siteId)
    .eq("property_id", propertyId)
    .select("id, name, write_key, allowed_origins, is_active, created_at, updated_at")
    .single()

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 })
  return NextResponse.json({ site: data })
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params
  const { supabase, propertyId, error } = await requireProperty(req)
  if (error || !supabase || !propertyId) return error!

  const { error: dbErr } = await supabase
    .from("tracking_sites")
    .delete()
    .eq("id", siteId)
    .eq("property_id", propertyId)

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
