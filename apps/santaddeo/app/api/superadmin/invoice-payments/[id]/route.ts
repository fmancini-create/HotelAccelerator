import { type NextRequest, NextResponse } from "next/server"
import { createClient, createServiceRoleClient } from "@/lib/supabase/server"

async function assertSuperAdmin() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    }
  }
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle()
  if (profile?.role !== "super_admin") {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    }
  }
  return { ok: true as const, userId: user.id }
}

/**
 * PATCH /api/superadmin/invoice-payments/[id]
 *
 * Modifica un pagamento esistente. Campi consentiti:
 *   - amount (numero >0)
 *   - paymentDate (YYYY-MM-DD)
 *   - notes (string|null)
 *
 * Il trigger DB `trg_invoice_payments_recalc` aggiorna automaticamente
 * `invoices.paid_amount` e `status` quando il pagamento cambia.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await assertSuperAdmin()
  if (!auth.ok) return auth.response

  const { id } = await params
  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Body JSON non valido" }, { status: 400 })
  }

  const update: Record<string, any> = {}

  if (body.amount !== undefined) {
    const a = Number(body.amount)
    if (!Number.isFinite(a) || a <= 0) {
      return NextResponse.json({ error: "Importo non valido" }, { status: 400 })
    }
    update.amount = a
  }
  if (body.paymentDate !== undefined) {
    const d = String(body.paymentDate || "").trim()
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
      return NextResponse.json({ error: "Data non valida (YYYY-MM-DD)" }, { status: 400 })
    }
    update.payment_date = d
  }
  if (body.notes !== undefined) {
    update.notes = body.notes ? String(body.notes).slice(0, 500) : null
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nessun campo da aggiornare" }, { status: 400 })
  }

  const sb = await createServiceRoleClient()
  const { data, error } = await sb
    .from("invoice_payments")
    .update(update)
    .eq("id", id)
    .select("id, amount, payment_date, notes, is_backfill, invoice_id")
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ payment: data })
}

/**
 * DELETE /api/superadmin/invoice-payments/[id]
 *
 * Cancella un pagamento. Il trigger ricalcola paid_amount/status.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await assertSuperAdmin()
  if (!auth.ok) return auth.response

  const { id } = await params
  const sb = await createServiceRoleClient()
  const { error } = await sb.from("invoice_payments").delete().eq("id", id)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
