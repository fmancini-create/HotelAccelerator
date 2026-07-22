/**
 * Storia commissioni venditore-hotel.
 *
 * GET  /api/superadmin/sales-commissions/periods?agentId=&hotelId=
 *      Lista i periodi (ordinati per valid_from DESC).
 *
 * POST /api/superadmin/sales-commissions/periods
 *      Crea un nuovo periodo. Body JSON:
 *        { agentId, hotelId, validFrom, validTo|null,
 *          commissionPercentage, commissionBasis?, notes? }
 *      Il vincolo gist sahcp_no_overlap impedisce le sovrapposizioni:
 *      l'errore 23P01 viene mappato a 409 con messaggio chiaro.
 */

import { NextResponse } from "next/server"
import { createClient, createServiceRoleClient } from "@/lib/supabase/server"

async function assertSuperAdmin() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false as const, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle()
  if (profile?.role !== "super_admin") {
    return { ok: false as const, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) }
  }
  return { ok: true as const, userId: user.id }
}

export async function GET(request: Request) {
  const auth = await assertSuperAdmin()
  if (!auth.ok) return auth.response

  const url = new URL(request.url)
  const agentId = url.searchParams.get("agentId")
  const hotelId = url.searchParams.get("hotelId")
  if (!agentId || !hotelId) {
    return NextResponse.json({ error: "agentId e hotelId required" }, { status: 400 })
  }

  const sb = await createServiceRoleClient()
  const { data, error } = await sb
    .from("sales_agent_hotel_commission_periods")
    .select("*")
    .eq("sales_agent_id", agentId)
    .eq("hotel_id", hotelId)
    .order("valid_from", { ascending: false })

  if (error) {
    console.error("[v0] periods GET failed:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ periods: data ?? [] })
}

export async function POST(request: Request) {
  const auth = await assertSuperAdmin()
  if (!auth.ok) return auth.response

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "JSON non valido" }, { status: 400 })
  }

  const agentId = String(body.agentId || "")
  const hotelId = String(body.hotelId || "")
  const validFrom = String(body.validFrom || "")
  const validTo = body.validTo ? String(body.validTo) : null
  const pct = Number(body.commissionPercentage)
  const basis = (body.commissionBasis as string) || "invoice_total"
  const notes = body.notes ? String(body.notes).slice(0, 1000) : null

  if (!agentId || !hotelId || !validFrom || Number.isNaN(pct)) {
    return NextResponse.json({ error: "Campi obbligatori mancanti" }, { status: 400 })
  }
  if (pct < 0 || pct > 100) {
    return NextResponse.json({ error: "Commissione deve essere 0-100%" }, { status: 400 })
  }
  if (!["invoice_total", "invoice_subtotal"].includes(basis)) {
    return NextResponse.json({ error: "commissionBasis non valido" }, { status: 400 })
  }

  const sb = await createServiceRoleClient()
  const { data, error } = await sb
    .from("sales_agent_hotel_commission_periods")
    .insert({
      sales_agent_id: agentId,
      hotel_id: hotelId,
      valid_from: validFrom,
      valid_to: validTo,
      commission_percentage: pct,
      commission_basis: basis,
      notes,
    })
    .select()
    .single()

  if (error) {
    if (error.code === "23P01") {
      return NextResponse.json(
        { error: "Periodo sovrapposto con uno esistente per questo venditore/hotel" },
        { status: 409 },
      )
    }
    console.error("[v0] periods POST failed:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ period: data })
}
