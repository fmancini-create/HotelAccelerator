/**
 * GET /api/ai-report/history/[id]    -> dettaglio completo (testo + KPI)
 * DELETE /api/ai-report/history/[id] -> elimina (solo super_admin o autore)
 */
import { createClient, createServiceRoleClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 })
  }

  const svc = await createServiceRoleClient()
  const { data, error } = await svc.from("ai_reports").select("*").eq("id", id).maybeSingle()

  if (error) {
    return NextResponse.json({ error: "db_error", details: error.message }, { status: 500 })
  }
  if (!data) {
    return NextResponse.json({ error: "not_found" }, { status: 404 })
  }

  return NextResponse.json({ report: data })
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 })
  }

  const svc = await createServiceRoleClient()

  // Verifica accesso: l'autore puo' sempre eliminare; super_admin idem.
  // Altri utenti (membri dello stesso hotel) possono eliminare per evitare
  // di lasciare a singoli operatori la "ownership esclusiva" di un report.
  // Pattern coerente con price-guard: chiunque del team puo' agire.
  const { data: row, error: fetchErr } = await svc
    .from("ai_reports")
    .select("hotel_id, user_id")
    .eq("id", id)
    .maybeSingle()

  if (fetchErr) {
    return NextResponse.json({ error: "db_error", details: fetchErr.message }, { status: 500 })
  }
  if (!row) {
    return NextResponse.json({ error: "not_found" }, { status: 404 })
  }

  // Verifica che l'utente abbia accesso a questo hotel
  const { data: profile } = await svc
    .from("profiles")
    .select("hotel_id, role")
    .eq("id", user.id)
    .maybeSingle()

  const isSuperAdmin = profile?.role === "super_admin"
  const sameHotel = profile?.hotel_id === row.hotel_id
  const isAuthor = row.user_id === user.id
  if (!isSuperAdmin && !sameHotel && !isAuthor) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }

  const { error: delErr } = await svc.from("ai_reports").delete().eq("id", id)
  if (delErr) {
    return NextResponse.json({ error: "db_error", details: delErr.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
