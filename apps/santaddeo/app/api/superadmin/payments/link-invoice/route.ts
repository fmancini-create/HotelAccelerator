import { type NextRequest, NextResponse } from "next/server"
import { createClient, createServiceRoleClient } from "@/lib/supabase/server"
import { isDevAuthAsync } from "@/lib/env/dev-auth"

/**
 * Auth guard: super_admin reale, oppure bypass in v0 preview (nessuna sessione).
 */
async function assertSuperAdmin() {
  if (await isDevAuthAsync()) return { ok: true as const, userId: null as string | null }
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { ok: false as const, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  }
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle()
  if (profile?.role !== "super_admin") {
    return { ok: false as const, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) }
  }
  return { ok: true as const, userId: user.id }
}

function isUuid(v: unknown): v is string {
  return typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
}

/**
 * POST /api/superadmin/payments/link-invoice
 *
 * Associa un pagamento LIBERO del registro (tabella `payments`, origine
 * manuale o estratto conto) a una fattura. Effetto:
 *   1. crea una riga in `invoice_payments` (il trigger DB ricalcola
 *      `invoices.paid_amount` e `status` -> il pagamento compare nel tab
 *      Fatture e riduce lo scoperto);
 *   2. elimina il pagamento libero da `payments` per non contarlo due volte
 *      (resta visibile nel registro unificato come origine "Fattura").
 *
 * Body JSON: { paymentId: uuid, invoiceId: uuid }
 */
export async function POST(req: NextRequest) {
  const auth = await assertSuperAdmin()
  if (!auth.ok) return auth.response

  let body: { paymentId?: unknown; invoiceId?: unknown } | null = null
  try {
    body = (await req.json()) as { paymentId?: unknown; invoiceId?: unknown }
  } catch {
    return NextResponse.json({ error: "JSON non valido" }, { status: 400 })
  }
  if (!isUuid(body?.paymentId)) return NextResponse.json({ error: "paymentId mancante o non valido" }, { status: 400 })
  if (!isUuid(body?.invoiceId)) return NextResponse.json({ error: "invoiceId mancante o non valido" }, { status: 400 })

  const sb = await createServiceRoleClient()

  // 1) Recupera il pagamento libero
  const { data: payment, error: payErr } = await sb
    .from("payments")
    .select("id, amount, payment_date, reference, notes, organization_name, bank_sender")
    .eq("id", body.paymentId)
    .maybeSingle()
  if (payErr) return NextResponse.json({ error: payErr.message }, { status: 500 })
  if (!payment) return NextResponse.json({ error: "Pagamento non trovato" }, { status: 404 })

  const amount = Number(payment.amount || 0)
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "Importo del pagamento non valido" }, { status: 400 })
  }

  // 2) Verifica la fattura
  const { data: invoice, error: invErr } = await sb
    .from("invoices")
    .select("id, invoice_number, total, paid_amount, status")
    .eq("id", body.invoiceId)
    .maybeSingle()
  if (invErr) return NextResponse.json({ error: invErr.message }, { status: 500 })
  if (!invoice) return NextResponse.json({ error: "Fattura non trovata" }, { status: 404 })

  // Note: porta dietro reference/bank_sender per tracciabilita'.
  const noteParts = [
    payment.notes,
    payment.reference ? `Rif. ${payment.reference}` : null,
    payment.bank_sender ? `Da: ${payment.bank_sender}` : null,
    "(da registro pagamenti)",
  ].filter(Boolean)
  const notes = noteParts.join(" — ").slice(0, 500)

  // 3) Crea il pagamento su fattura (il trigger ricalcola paid_amount/status)
  const { data: inserted, error: insErr } = await sb
    .from("invoice_payments")
    .insert({
      invoice_id: invoice.id,
      amount,
      payment_date: payment.payment_date,
      notes,
      created_by: auth.userId,
    })
    .select("id")
    .single()
  if (insErr) {
    return NextResponse.json({ error: `Associazione fallita: ${insErr.message}` }, { status: 500 })
  }

  // 4) Rimuovi il pagamento libero per evitare il doppio conteggio
  const { error: delErr } = await sb.from("payments").delete().eq("id", payment.id)
  if (delErr) {
    // Rollback best-effort del pagamento appena inserito
    await sb.from("invoice_payments").delete().eq("id", inserted.id)
    return NextResponse.json({ error: `Pulizia registro fallita: ${delErr.message}` }, { status: 500 })
  }

  // 5) Rileggi lo stato aggiornato della fattura (post-trigger)
  const { data: updated } = await sb
    .from("invoices")
    .select("id, invoice_number, total, paid_amount, status")
    .eq("id", invoice.id)
    .maybeSingle()

  return NextResponse.json({
    ok: true,
    invoicePaymentId: inserted.id,
    invoice: updated ?? invoice,
  })
}
