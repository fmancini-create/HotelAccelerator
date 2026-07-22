/**
 * PATCH /api/superadmin/sales-commissions/periods/[id]
 *   Modifica un periodo esistente. Stesso vincolo no-overlap.
 * DELETE /api/superadmin/sales-commissions/periods/[id]
 *   Elimina il periodo. NB: non c'e' fallback automatico se elimini l'unico
 *   periodo aperto (l'agente non maturera' commissioni finche' non ne crei
 *   uno nuovo). E' una scelta esplicita di processo.
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
  return { ok: true as const }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await assertSuperAdmin()
  if (!auth.ok) return auth.response

  const { id } = await params
  const body = await request.json().catch(() => ({}))

  const patch: Record<string, any> = {}
  if (body.validFrom !== undefined) patch.valid_from = body.validFrom
  if (body.validTo !== undefined) patch.valid_to = body.validTo
  if (body.commissionPercentage !== undefined) {
    const pct = Number(body.commissionPercentage)
    if (Number.isNaN(pct) || pct < 0 || pct > 100) {
      return NextResponse.json({ error: "Commissione 0-100%" }, { status: 400 })
    }
    patch.commission_percentage = pct
  }
  if (body.commissionBasis !== undefined) {
    if (!["invoice_total", "invoice_subtotal"].includes(body.commissionBasis)) {
      return NextResponse.json({ error: "commissionBasis non valido" }, { status: 400 })
    }
    patch.commission_basis = body.commissionBasis
  }
  if (body.notes !== undefined) patch.notes = body.notes ? String(body.notes).slice(0, 1000) : null

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nessuna modifica" }, { status: 400 })
  }

  const sb = await createServiceRoleClient()
  const { data, error } = await sb
    .from("sales_agent_hotel_commission_periods")
    .update(patch)
    .eq("id", id)
    .select()
    .single()

  if (error) {
    if (error.code === "23P01") {
      return NextResponse.json(
        { error: "Modifica genera sovrapposizione con un altro periodo" },
        { status: 409 },
      )
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ period: data })
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await assertSuperAdmin()
  if (!auth.ok) return auth.response

  const { id } = await params
  const sb = await createServiceRoleClient()
  const { error } = await sb.from("sales_agent_hotel_commission_periods").delete().eq("id", id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
