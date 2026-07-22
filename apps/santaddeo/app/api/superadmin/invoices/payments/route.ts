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
 * POST /api/superadmin/invoices/payments
 *
 * Batch registrazione pagamenti su fatture esistenti.
 *
 * Modello: ogni pagamento e' una riga in `invoice_payments`. Il
 * trigger DB `trg_invoice_payments_recalc` ricalcola automaticamente
 * `invoices.paid_amount` e `status` come somma dei pagamenti. NON
 * tocchiamo direttamente `invoices.paid_amount` da qui — il trigger e'
 * la fonte di verita'.
 *
 * Body JSON:
 *   {
 *     payments: [
 *       { invoiceId?: "uuid",      // preferito: lock diretto alla riga
 *         invoiceNumber?: "15/2025", hotelId?: "uuid", hotelName?: "..."  // fallback per CSV / dialog non lockato
 *         paidAt: "2026-05-18", amount: 1600.00, notes?: "..." }
 *     ]
 *   }
 */
export async function POST(req: NextRequest) {
  const auth = await assertSuperAdmin()
  if (!auth.ok) return auth.response

  let body: any
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Body JSON non valido" }, { status: 400 })
  }

  const payments = Array.isArray(body?.payments) ? body.payments : null
  if (!payments || payments.length === 0) {
    return NextResponse.json({ error: "Nessun pagamento da registrare" }, { status: 400 })
  }
  if (payments.length > 200) {
    return NextResponse.json({ error: "Massimo 200 pagamenti per richiesta" }, { status: 400 })
  }

  const sb = await createServiceRoleClient()

  type Result =
    | { index: number; success: true; invoiceId: string; paymentId: string }
    | { index: number; success: false; error: string }
  const results: Result[] = []

  // Pre-fetch fallback: tutte le fatture per i numeri richiesti dalle
  // righe che NON hanno invoiceId esplicito.
  const allNumbers = Array.from(
    new Set(
      payments
        .filter((p: any) => !p?.invoiceId)
        .map((p: any) => String(p?.invoiceNumber || "").trim())
        .filter((s: string) => s.length > 0),
    ),
  )

  type InvoiceLite = {
    id: string
    invoice_number: string
    hotel_id: string
    hotels: { name: string | null } | null
  }

  const invoicesByNumber = new Map<string, InvoiceLite[]>()
  if (allNumbers.length > 0) {
    const { data, error } = await sb
      .from("invoices")
      .select("id, invoice_number, hotel_id, hotels(name)")
      .in("invoice_number", allNumbers)
    if (error) {
      return NextResponse.json(
        { error: `Errore lettura fatture: ${error.message}` },
        { status: 500 },
      )
    }
    for (const row of (data || []) as unknown as InvoiceLite[]) {
      const list = invoicesByNumber.get(row.invoice_number) || []
      list.push(row)
      invoicesByNumber.set(row.invoice_number, list)
    }
  }

  for (let i = 0; i < payments.length; i++) {
    const p = payments[i] || {}
    const paidAt = String(p.paidAt || "").trim()
    const amountRaw = p.amount
    const notes = p.notes ? String(p.notes).trim().slice(0, 500) : null

    if (!paidAt || !/^\d{4}-\d{2}-\d{2}$/.test(paidAt)) {
      results.push({
        index: i,
        success: false,
        error: "Data pagamento mancante o formato errato (YYYY-MM-DD)",
      })
      continue
    }
    const amount = typeof amountRaw === "number" ? amountRaw : Number(amountRaw)
    if (!Number.isFinite(amount) || amount <= 0) {
      results.push({ index: i, success: false, error: "Importo non valido (>0 richiesto)" })
      continue
    }

    let invoiceId: string | null = p.invoiceId ? String(p.invoiceId) : null

    // Fallback: match per numero + struttura
    if (!invoiceId) {
      const invoiceNumber = String(p.invoiceNumber || "").trim()
      const hotelId = p.hotelId ? String(p.hotelId) : null
      const hotelName = p.hotelName ? String(p.hotelName).trim() : null

      if (!invoiceNumber) {
        results.push({ index: i, success: false, error: "Numero fattura mancante" })
        continue
      }

      const candidates = invoicesByNumber.get(invoiceNumber) || []
      if (candidates.length === 0) {
        results.push({
          index: i,
          success: false,
          error: `Fattura ${invoiceNumber} non trovata`,
        })
        continue
      }

      let match: InvoiceLite | undefined
      if (hotelId) {
        match = candidates.find((c) => c.hotel_id === hotelId)
        if (!match) {
          results.push({
            index: i,
            success: false,
            error: `Fattura ${invoiceNumber} esiste ma non per la struttura selezionata`,
          })
          continue
        }
      } else if (hotelName) {
        const lc = hotelName.toLowerCase()
        const exact = candidates.filter(
          (c) => (c.hotels?.name || "").toLowerCase() === lc,
        )
        if (exact.length === 1) {
          match = exact[0]
        } else if (exact.length === 0) {
          const partial = candidates.filter(
            (c) =>
              (c.hotels?.name || "").toLowerCase().includes(lc) ||
              lc.includes((c.hotels?.name || "").toLowerCase()),
          )
          if (partial.length === 1) {
            match = partial[0]
          } else if (partial.length === 0) {
            results.push({
              index: i,
              success: false,
              error: `Fattura ${invoiceNumber} non trovata per struttura "${hotelName}"`,
            })
            continue
          } else {
            results.push({
              index: i,
              success: false,
              error: `Struttura "${hotelName}" ambigua per fattura ${invoiceNumber}`,
            })
            continue
          }
        } else {
          results.push({
            index: i,
            success: false,
            error: `Piu' fatture ${invoiceNumber} per "${hotelName}"`,
          })
          continue
        }
      } else {
        if (candidates.length === 1) {
          match = candidates[0]
        } else {
          results.push({
            index: i,
            success: false,
            error: `Fattura ${invoiceNumber} ambigua: ${candidates.length} match. Specifica la struttura.`,
          })
          continue
        }
      }
      invoiceId = match!.id
    }

    const { data: inserted, error: insErr } = await sb
      .from("invoice_payments")
      .insert({
        invoice_id: invoiceId,
        amount,
        payment_date: paidAt,
        notes,
        created_by: auth.userId,
      })
      .select("id")
      .single()

    if (insErr) {
      results.push({
        index: i,
        success: false,
        error: `Insert pagamento fallito: ${insErr.message}`,
      })
      continue
    }

    results.push({
      index: i,
      success: true,
      invoiceId,
      paymentId: inserted.id,
    })
  }

  const successCount = results.filter((r) => r.success).length
  const failureCount = results.length - successCount
  return NextResponse.json({ successCount, failureCount, results })
}
