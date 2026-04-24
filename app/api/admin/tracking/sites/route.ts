/**
 * Admin CRUD for tracking_sites (list + create).
 * Authenticated via Supabase cookie; scoped to the caller's property_id via
 * the admin_users join. No service-role escape.
 */
import { NextResponse, type NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

async function requireProperty() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { supabase, error: NextResponse.json({ error: "unauthenticated" }, { status: 401 }) }

  const { data: admin } = await supabase
    .from("admin_users")
    .select("property_id")
    .eq("email", user.email)
    .maybeSingle()

  if (!admin?.property_id)
    return { supabase, error: NextResponse.json({ error: "no property" }, { status: 403 }) }

  return { supabase, propertyId: admin.property_id as string, error: null }
}

function generateWriteKey(): string {
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  // base64url without padding
  const b64 = Buffer.from(bytes).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")
  return `tw_${b64}`
}

export async function GET() {
  const { supabase, propertyId, error } = await requireProperty()
  if (error) return error

  const { data, error: dbErr } = await supabase
    .from("tracking_sites")
    .select("id, name, write_key, allowed_origins, is_active, created_at, updated_at")
    .eq("property_id", propertyId!)
    .order("created_at", { ascending: false })

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 })
  return NextResponse.json({ sites: data ?? [] })
}

export async function POST(req: NextRequest) {
  const { supabase, propertyId, error } = await requireProperty()
  if (error) return error

  const body = await req.json().catch(() => ({}))
  const name = String(body?.name ?? "").trim() || "Nuovo sito"
  const allowed = Array.isArray(body?.allowed_origins)
    ? body.allowed_origins.map((s: unknown) => String(s).trim()).filter(Boolean)
    : []

  const { data, error: dbErr } = await supabase
    .from("tracking_sites")
    .insert({
      property_id: propertyId!,
      name,
      write_key: generateWriteKey(),
      allowed_origins: allowed,
      is_active: allowed.length > 0, // only activate if the admin already gave at least one origin
    })
    .select("id, name, write_key, allowed_origins, is_active, created_at, updated_at")
    .single()

  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 })
  return NextResponse.json({ site: data }, { status: 201 })
}
