/**
 * Admin CRUD for tracking_sites (list + create) scoped to the selected tenant.
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

  // Platform superadmins can change tenant through platform-context. The
  // legacy RLS policy only sees admin_users.property_id, so after auth + area
  // guard we use service role and explicitly scope every query to propertyId.
  return { supabase: createServiceClient(), propertyId: identity.propertyId, error: null }
}

function generateWriteKey(): string {
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  const b64 = Buffer.from(bytes).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")
  return `tw_${b64}`
}

export async function GET(request: NextRequest) {
  const { supabase, propertyId, error } = await requireProperty(request)
  if (error || !supabase || !propertyId) return error!

  const { data, error: dbErr } = await supabase
    .from("tracking_sites")
    .select("id, name, write_key, allowed_origins, is_active, created_at, updated_at")
    .eq("property_id", propertyId)
    .order("created_at", { ascending: false })

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 })
  return NextResponse.json({ sites: data ?? [] })
}

export async function POST(req: NextRequest) {
  const { supabase, propertyId, error } = await requireProperty(req)
  if (error || !supabase || !propertyId) return error!

  const body = await req.json().catch(() => ({}))
  const name = String(body?.name ?? "").trim() || "Nuovo sito"
  const allowed = Array.isArray(body?.allowed_origins)
    ? body.allowed_origins.map((s: unknown) => String(s).trim()).filter(Boolean)
    : []

  const { data, error: dbErr } = await supabase
    .from("tracking_sites")
    .insert({
      property_id: propertyId,
      name,
      write_key: generateWriteKey(),
      allowed_origins: allowed,
      is_active: allowed.length > 0,
    })
    .select("id, name, write_key, allowed_origins, is_active, created_at, updated_at")
    .single()

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 })
  return NextResponse.json({ site: data }, { status: 201 })
}
