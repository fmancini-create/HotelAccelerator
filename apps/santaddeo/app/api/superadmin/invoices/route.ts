import { NextResponse } from "next/server"
import { put } from "@vercel/blob"
import { createClient, createServiceRoleClient } from "@/lib/supabase/server"
import { isDevAuthAsync } from "@/lib/env/dev-auth"
import { reconcileCommissionsForInvoice } from "@/lib/sales/commissions-engine"

/**
 * Tool superadmin per la gestione delle fatture per struttura.
 *
 * GET  /api/superadmin/invoices?hotelId=...&year=YYYY
 *   Elenca tutte le fatture filtrabili per hotel e anno (issue_date).
 *
 * POST /api/superadmin/invoices  (multipart/form-data)
 *   Crea una nuova fattura. Campi:
 *     - hotelId (required)
 *     - invoiceNumber, issueDate, periodStart, periodEnd
 *     - subtotal, tax, total
 *     - dueDate, paidAt, status (pending|paid|overdue|cancelled|draft)
 *     - planType (commission|fixed_fee|setup|other)
 *     - notes
 *     - file (optional, PDF, max 10MB) -> caricato su Vercel Blob private
 *
 * Auth: solo super_admin. Non c'e' RLS bypass automatico, quindi usiamo
 * service-role dopo aver validato il role applicativamente (stesso pattern
 * di /api/superadmin/subscriptions/[id]/route.ts).
 */

async function assertSuperAdmin() {
  // Dev bypass: in v0 preview non c'è sessione utente reale
  const isV0Preview = await isDevAuthAsync()
  if (isV0Preview) {
    return { ok: true as const, userId: "dev-user" }
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return { ok: false as const, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }), userId: null }
  }
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle()
  if (profile?.role !== "super_admin") {
    return { ok: false as const, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }), userId: null }
  }
  return { ok: true as const, userId: user.id }
}

export async function GET(request: Request) {
  const auth = await assertSuperAdmin()
  if (!auth.ok) return auth.response

  const url = new URL(request.url)
  const hotelId = url.searchParams.get("hotelId")
  const year = url.searchParams.get("year")

  const sb = await createServiceRoleClient()
  let query = sb
    .from("invoices")
    .select(
      "id, hotel_id, organization_id, invoice_number, status, plan_type, issue_date, period_start, period_end, subtotal, tax, total, due_date, paid_at, paid_amount, pdf_url, pdf_file_name, pdf_file_size, notes, created_at, hotels(name)",
    )
    .order("issue_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(500)

  if (hotelId) query = query.eq("hotel_id", hotelId)
  if (year) {
    const yStart = `${year}-01-01`
    const yEnd = `${year}-12-31`
    query = query.gte("issue_date", yStart).lte("issue_date", yEnd)
  }

  const { data, error } = await query
  if (error) {
    console.error("[v0] superadmin invoices GET failed:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ invoices: data || [] })
}

export async function POST(request: Request) {
  const auth = await assertSuperAdmin()
  if (!auth.ok) return auth.response

  const form = await request.formData()
  const hotelId = String(form.get("hotelId") || "")
  if (!hotelId) {
    return NextResponse.json({ error: "hotelId required" }, { status: 400 })
  }

  const file = form.get("file") as File | null
  const invoiceNumber = String(form.get("invoiceNumber") || "").trim() || null
  const issueDate = String(form.get("issueDate") || "").trim() || null
  const periodStart = String(form.get("periodStart") || "").trim() || null
  const periodEnd = String(form.get("periodEnd") || "").trim() || null
  const subtotalRaw = String(form.get("subtotal") || "").trim()
  const taxRaw = String(form.get("tax") || "").trim()
  const totalRaw = String(form.get("total") || "").trim()
  const dueDate = String(form.get("dueDate") || "").trim() || null
  const paidAt = String(form.get("paidAt") || "").trim() || null
  const paidAmountRaw = String(form.get("paidAmount") || "").trim()
  let status = String(form.get("status") || "pending").trim()
  const planType = String(form.get("planType") || "").trim() || null
  const notes = String(form.get("notes") || "").trim() || null

  // Numerici: vuoto -> null, altrimenti numero
  const subtotal = subtotalRaw === "" ? null : Number(subtotalRaw)
  const tax = taxRaw === "" ? null : Number(taxRaw)
  const total = totalRaw === "" ? null : Number(totalRaw)
  const paidAmount = paidAmountRaw === "" ? null : Number(paidAmountRaw)

  if (subtotal !== null && Number.isNaN(subtotal)) {
    return NextResponse.json({ error: "subtotal non valido" }, { status: 400 })
  }
  if (tax !== null && Number.isNaN(tax)) {
    return NextResponse.json({ error: "tax non valido" }, { status: 400 })
  }
  if (total !== null && Number.isNaN(total)) {
    return NextResponse.json({ error: "total non valido" }, { status: 400 })
  }
  if (paidAmount !== null && (Number.isNaN(paidAmount) || paidAmount < 0)) {
    return NextResponse.json({ error: "paidAmount non valido" }, { status: 400 })
  }

  // Auto-bump status: se l'importo pagato copre il totale, e lo stato non
  // e' un terminale negativo (cancelled/draft/overdue), passiamo a 'paid'.
  // Idem se l'utente ha messo una data pagamento esplicita e nessun importo
  // (back-compat con il flusso "segno pagata in toto").
  if (paidAmount !== null && total !== null && paidAmount >= total) {
    if (status !== "cancelled" && status !== "draft") status = "paid"
  } else if (paidAt && paidAmount === null) {
    if (status === "pending" || status === "overdue") status = "paid"
  }

  // Valida PDF se presente
  let pdfUrl: string | null = null
  let pdfFileName: string | null = null
  let pdfFileSize: number | null = null
  if (file && file.size > 0) {
    if (file.type !== "application/pdf") {
      return NextResponse.json({ error: "Il file deve essere un PDF" }, { status: 400 })
    }
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "PDF deve essere < 10 MB" }, { status: 400 })
    }
    try {
      const blob = await put(`invoices/${hotelId}/${Date.now()}-${file.name}`, file, {
        access: "private",
        contentType: "application/pdf",
        addRandomSuffix: true,
      })
      pdfUrl = blob.url
      pdfFileName = file.name
      pdfFileSize = file.size
    } catch (err: any) {
      console.error("[v0] superadmin invoice PDF blob upload failed:", err)
      return NextResponse.json({ error: `Upload PDF fallito: ${err?.message || "errore sconosciuto"}` }, { status: 500 })
    }
  }

  const sb = await createServiceRoleClient()

  // Recupera organization_id dall'hotel per popolarlo automaticamente
  const { data: hotel } = await sb
    .from("hotels")
    .select("organization_id")
    .eq("id", hotelId)
    .maybeSingle()

  const { data: inserted, error } = await sb
    .from("invoices")
    .insert({
      hotel_id: hotelId,
      organization_id: hotel?.organization_id ?? null,
      invoice_number: invoiceNumber,
      status,
      plan_type: planType,
      issue_date: issueDate,
      period_start: periodStart,
      period_end: periodEnd,
      subtotal,
      tax,
      total,
      due_date: dueDate,
      paid_at: paidAt,
      paid_amount: paidAmount,
      pdf_url: pdfUrl,
      pdf_file_name: pdfFileName,
      pdf_file_size: pdfFileSize,
      notes,
      uploaded_by: auth.userId,
    })
    .select()
    .single()

  if (error) {
    console.error("[v0] superadmin invoice insert failed:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Reconcile commissioni venditore (idempotente, side-effect best-effort).
  // Non bloccare la risposta se fallisce: l'engine logga l'errore.
  reconcileCommissionsForInvoice(inserted.id as string).catch((e) =>
    console.error("[v0] reconcile commissions on invoice insert failed:", e),
  )

  return NextResponse.json({ invoice: inserted })
}
