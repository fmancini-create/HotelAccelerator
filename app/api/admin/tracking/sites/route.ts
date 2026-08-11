/**
 * Admin CRUD for tracking_sites (list + create).
 * Authenticated via Supabase cookie; scoped to the caller's property_id via
 * the admin_users join. No service-role escape.
 */
import { NextResponse, type NextRequest } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { requireAreaApi } from "@/lib/auth/area-access"
import { isAreaDenied, areaDeniedResponse } from "@/lib/auth/area-denied"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Qui la guardia di area sta DENTRO l'aiutante, non nei gestori: questo file
 * non usa `try/catch` ma restituisce l'errore, quindi un `requireAreaApi`
 * lanciato nel gestore diventerebbe un 500 invece di un 403. Un punto solo,
 * attraversato da GET e POST, e nessun gestore puo' dimenticarsene.
 */
async function requireProperty(request?: NextRequest) {
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

  // Permesso di sezione: tradotto in 403 qui, senza passare da un'eccezione.
  try {
    await requireAreaApi("tracking", request)
  } catch (e) {
    if (isAreaDenied(e)) return { supabase, error: areaDeniedResponse(e) }
    throw e
  }

  return { supabase, propertyId: admin.property_id as string, error: null }
}

function generateWriteKey(): string {
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  // base64url without padding
  const b64 = Buffer.from(bytes).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "")
  return `tw_${b64}`
}

export async function GET(request: NextRequest) {
  const { supabase, propertyId, error } = await requireProperty(request)
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
  const { supabase, propertyId, error } = await requireProperty(req)
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
