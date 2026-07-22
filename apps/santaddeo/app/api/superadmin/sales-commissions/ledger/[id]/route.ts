/**
 * POST /api/superadmin/sales-commissions/ledger/[id]/pay
 *   Marca una riga ledger come 'paid' (Santaddeo ha bonificato il venditore).
 *   Body: { paymentMethod?, paymentReference?, notes?, allowFromAccrued? }
 *   Manda notifica al venditore.
 *
 * POST /api/superadmin/sales-commissions/ledger/[id]/void
 *   Annulla una riga ledger (solo se non gia' paid).
 *   Body: { reason }
 *
 * PATCH /api/superadmin/sales-commissions/ledger/[id]
 *   Modifica manuale (es. note, override importo). Body parziale.
 *
 * Le azioni "pay" e "void" sono esposte come PATCH con campo `action` per
 * semplicita' di routing (Next.js non supporta facilmente piu' verbi su
 * un singolo file).
 */

import { NextResponse } from "next/server"
import { createClient, createServiceRoleClient } from "@/lib/supabase/server"
import { markCommissionPaid, voidCommission } from "@/lib/sales/commissions-engine"
import { notifyUser } from "@/lib/notifications/notify"

type RouteContext = { params: Promise<{ id: string }> }

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
  const action = String(body.action || "")

  // --- Azione: pay ---
  if (action === "pay") {
    const r = await markCommissionPaid(id, {
      paymentMethod: body.paymentMethod ?? null,
      paymentReference: body.paymentReference ?? null,
      notes: body.notes ?? undefined,
      allowFromAccrued: !!body.allowFromAccrued,
    })
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 })

    // Notifica al venditore (best-effort, non blocca la response)
    const sb = await createServiceRoleClient()
    const { data: row } = await sb
      .from("sales_commissions_ledger")
      .select("sales_agent_id, amount_eur, period_year, period_month, hotels(name)")
      .eq("id", id)
      .maybeSingle()
    if (row) {
      const { data: agent } = await sb
        .from("sales_agents")
        .select("user_id")
        .eq("id", row.sales_agent_id as string)
        .maybeSingle()
      const hotelName = (row.hotels as any)?.name ?? "struttura"
      if (agent?.user_id) {
        await notifyUser({
          userId: agent.user_id,
          type: "commission_paid",
          title: "Commissione liquidata",
          body: `Ti abbiamo liquidato € ${Number(row.amount_eur).toFixed(2)} per ${hotelName} (${String(row.period_month).padStart(2, "0")}/${row.period_year}).`,
          actionUrl: "/sales/commissions",
          dedupKey: `commission_paid:${id}`,
        })
      }
    }

    return NextResponse.json({ ledger: r.ledger })
  }

  // --- Azione: void ---
  if (action === "void") {
    const reason = String(body.reason || "").trim()
    if (!reason) return NextResponse.json({ error: "reason required" }, { status: 400 })
    const r = await voidCommission(id, reason)
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 })
    return NextResponse.json({ ledger: r.ledger })
  }

  // --- Azione: revert paid -> earned (gestione errore) ---
  if (action === "unpay") {
    const sb = await createServiceRoleClient()
    const { data: row } = await sb
      .from("sales_commissions_ledger")
      .select("status, invoice:invoices(status)")
      .eq("id", id)
      .maybeSingle()
    if (!row) return NextResponse.json({ error: "Non trovato" }, { status: 404 })
    if (row.status !== "paid") return NextResponse.json({ error: "Non in stato paid" }, { status: 400 })
    const invoiceStatus = (row.invoice as any)?.status
    const newStatus = invoiceStatus === "paid" ? "earned" : "accrued"
    const { data, error } = await sb
      .from("sales_commissions_ledger")
      .update({
        status: newStatus,
        paid_at: null,
        payment_method: null,
        payment_reference: null,
      })
      .eq("id", id)
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ledger: data })
  }

  // --- Modifica generica (note) ---
  const patch: Record<string, any> = {}
  if (body.notes !== undefined) patch.notes = body.notes ? String(body.notes).slice(0, 2000) : null
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nessuna modifica o action sconosciuta" }, { status: 400 })
  }
  const sb = await createServiceRoleClient()
  const { data, error } = await sb
    .from("sales_commissions_ledger")
    .update(patch)
    .eq("id", id)
    .select()
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ledger: data })
}

/**
 * DELETE /api/superadmin/sales-commissions/ledger/[id]
 *   Elimina fisicamente una riga dal ledger.
 *   Usato per correggere backfill errati o rimuovere periodi non dovuti.
 *   Solo super_admin puo' eliminare.
 */
export async function DELETE(request: Request, { params }: RouteContext) {
  const auth = await assertSuperAdmin()
  if (!auth.ok) return auth.response

  const { id } = await params
  const sb = await createServiceRoleClient()

  // Verifica che la riga esista
  const { data: existing } = await sb
    .from("sales_commissions_ledger")
    .select("id, status, period_year, period_month, hotels(name)")
    .eq("id", id)
    .maybeSingle()

  if (!existing) {
    return NextResponse.json({ error: "Riga non trovata" }, { status: 404 })
  }

  // Elimina
  const { error } = await sb
    .from("sales_commissions_ledger")
    .delete()
    .eq("id", id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ 
    success: true, 
    deleted: {
      id,
      period: `${existing.period_month}/${existing.period_year}`,
      hotel: (existing.hotels as any)?.name,
      status: existing.status,
    }
  })
}
