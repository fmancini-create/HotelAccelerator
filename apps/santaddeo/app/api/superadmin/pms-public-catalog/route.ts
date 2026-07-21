import { createClient, createServiceRoleClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import { isV0Preview } from "@/lib/v0-preview"

export const dynamic = "force-dynamic"

const VALID_STATUS = ["connected", "certifying", "upcoming"] as const

// Verifica che il chiamante sia super admin. Ritorna il client service-role
// (bypassa RLS) oppure una NextResponse di errore.
async function requireSuperAdmin() {
  const isPreview = await isV0Preview()
  const supabase = await createServiceRoleClient()

  if (isPreview) {
    return { supabase }
  }

  const authClient = await createClient()
  const {
    data: { user },
  } = await authClient.auth.getUser()
  if (!user) {
    return { error: NextResponse.json({ error: "Non autenticato" }, { status: 401 }) }
  }
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single()
  if (!profile || !["superadmin", "super_admin"].includes(profile.role)) {
    return { error: NextResponse.json({ error: "Accesso non autorizzato" }, { status: 403 }) }
  }
  return { supabase }
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

// GET: tutte le voci (incluse non pubbliche) per la gestione admin.
export async function GET() {
  const auth = await requireSuperAdmin()
  if ("error" in auth) return auth.error
  const { supabase } = auth

  const { data, error } = await supabase
    .from("pms_public_catalog")
    .select("*")
    .order("display_order", { ascending: true })

  if (error) {
    console.error("[v0] GET pms-public-catalog error:", error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ entries: data || [] })
}

// POST: crea una nuova voce.
export async function POST(request: Request) {
  const auth = await requireSuperAdmin()
  if ("error" in auth) return auth.error
  const { supabase } = auth

  const body = await request.json()
  const name = (body.name || "").trim()
  if (!name) {
    return NextResponse.json({ error: "Il nome è obbligatorio" }, { status: 400 })
  }
  const status = VALID_STATUS.includes(body.status) ? body.status : "connected"
  const slug = (body.slug && slugify(body.slug)) || slugify(name)

  const { data, error } = await supabase
    .from("pms_public_catalog")
    .insert({
      name,
      slug,
      status,
      note: body.note?.trim() || null,
      display_order: Number.isFinite(body.display_order) ? body.display_order : 0,
      is_public: body.is_public ?? true,
    })
    .select()
    .single()

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "Esiste già una voce con questo slug" }, { status: 400 })
    }
    console.error("[v0] POST pms-public-catalog error:", error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ entry: data })
}

// PATCH: aggiorna una voce esistente.
export async function PATCH(request: Request) {
  const auth = await requireSuperAdmin()
  if ("error" in auth) return auth.error
  const { supabase } = auth

  const body = await request.json()
  const { id } = body
  if (!id) {
    return NextResponse.json({ error: "ID obbligatorio" }, { status: 400 })
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (typeof body.name === "string") update.name = body.name.trim()
  if (typeof body.slug === "string" && body.slug.trim()) update.slug = slugify(body.slug)
  if (VALID_STATUS.includes(body.status)) update.status = body.status
  if (body.note !== undefined) update.note = body.note?.trim() || null
  if (Number.isFinite(body.display_order)) update.display_order = body.display_order
  if (typeof body.is_public === "boolean") update.is_public = body.is_public

  const { data, error } = await supabase
    .from("pms_public_catalog")
    .update(update)
    .eq("id", id)
    .select()
    .single()

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "Esiste già una voce con questo slug" }, { status: 400 })
    }
    console.error("[v0] PATCH pms-public-catalog error:", error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ entry: data })
}

// DELETE: rimuove una voce (?id=...).
export async function DELETE(request: Request) {
  const auth = await requireSuperAdmin()
  if ("error" in auth) return auth.error
  const { supabase } = auth

  const id = new URL(request.url).searchParams.get("id")
  if (!id) {
    return NextResponse.json({ error: "ID obbligatorio" }, { status: 400 })
  }

  const { error } = await supabase.from("pms_public_catalog").delete().eq("id", id)
  if (error) {
    console.error("[v0] DELETE pms-public-catalog error:", error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}
