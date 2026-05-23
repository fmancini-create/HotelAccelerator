import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"
import { getAutoCaptureSettings } from "@/lib/crm/auto-capture"

// GET /api/admin/crm/auto-capture-settings
// Returns the current tenant's auto-capture policy. Falls back to defaults
// if no row exists yet (the migration bootstraps one per property, but this
// keeps the endpoint resilient to new properties added outside the migration).
export async function GET(request: NextRequest) {
  try {
    const propertyId = await getAuthenticatedPropertyId(request)
    const supabase = await createClient()
    const settings = await getAutoCaptureSettings(supabase, propertyId)
    return NextResponse.json({ settings })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Errore sconosciuto"
    const status = message.includes("Non autenticato") ? 401 : 500
    return NextResponse.json({ error: message }, { status })
  }
}

// PUT /api/admin/crm/auto-capture-settings
// Upsert the tenant policy. All fields are optional — only provided fields
// are updated. Arrays are replaced atomically (not merged).
export async function PUT(request: NextRequest) {
  try {
    const propertyId = await getAuthenticatedPropertyId(request)
    const supabase = await createClient()
    const body = await request.json().catch(() => ({}))

    // Whitelist: only these fields are writable via the public API.
    const payload: Record<string, unknown> = { property_id: propertyId }

    if (typeof body.enabled === "boolean") payload.enabled = body.enabled
    if (typeof body.capture_inbound === "boolean") payload.capture_inbound = body.capture_inbound
    if (typeof body.capture_outbound === "boolean") payload.capture_outbound = body.capture_outbound
    if (typeof body.default_tag === "string") {
      const tag = body.default_tag.trim()
      if (tag.length > 64) {
        return NextResponse.json({ error: "default_tag troppo lungo (max 64)" }, { status: 400 })
      }
      payload.default_tag = tag || "email_auto"
    }

    if (Array.isArray(body.blacklist_domains)) {
      payload.blacklist_domains = normaliseStringList(body.blacklist_domains, 255)
    }
    if (Array.isArray(body.blacklist_keywords)) {
      payload.blacklist_keywords = normaliseStringList(body.blacklist_keywords, 100)
    }

    const { data, error } = await supabase
      .from("crm_auto_capture_settings")
      .upsert(payload, { onConflict: "property_id" })
      .select("*")
      .single()

    if (error) {
      console.error("[v0] auto-capture settings upsert failed", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ settings: data })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Errore sconosciuto"
    const status = message.includes("Non autenticato") ? 401 : 500
    return NextResponse.json({ error: message }, { status })
  }
}

function normaliseStringList(input: unknown[], maxLen: number): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of input) {
    if (typeof raw !== "string") continue
    const v = raw.trim().toLowerCase()
    if (!v || v.length > maxLen) continue
    if (seen.has(v)) continue
    seen.add(v)
    out.push(v)
    if (out.length >= 100) break
  }
  return out
}
