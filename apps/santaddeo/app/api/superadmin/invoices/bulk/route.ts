import { NextResponse } from "next/server"
import { put } from "@vercel/blob"
import { createClient, createServiceRoleClient } from "@/lib/supabase/server"
import { reconcileCommissionsForInvoice } from "@/lib/sales/commissions-engine"

/**
 * Tool superadmin per il caricamento bulk di fatture.
 *
 * POST /api/superadmin/invoices/bulk  (multipart/form-data)
 *
 * Schema del payload:
 *   count: numero di righe (n)
 *   per ogni indice i in [0..n-1]:
 *     hotelId_<i>          (required)
 *     file_<i>             (optional, PDF max 10MB)
 *     invoiceNumber_<i>    (optional)
 *     issueDate_<i>        (optional, YYYY-MM-DD)
 *     periodStart_<i>      (optional)
 *     periodEnd_<i>        (optional)
 *     subtotal_<i>         (optional, numero)
 *     tax_<i>              (optional, numero)
 *     total_<i>            (optional, numero)
 *     dueDate_<i>          (optional)
 *     paidAt_<i>           (optional)
 *     status_<i>           (optional, default "pending")
 *     planType_<i>         (optional)
 *     notes_<i>            (optional)
 *
 * Risposta:
 *   {
 *     results: [
 *       { index, success: true, invoiceId } |
 *       { index, success: false, error }
 *     ],
 *     successCount,
 *     failureCount
 *   }
 *
 * Auth: solo super_admin (stesso pattern del POST singolo).
 *
 * Filosofia: ogni riga e' indipendente. Se 9 funzionano e 1 fallisce, le 9
 * vengono comunque create. Lato UI mostriamo l'esito riga per riga, l'utente
 * puo' correggere e ri-inviare solo le falliti.
 */

async function assertSuperAdmin() {
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

function parseNumeric(raw: string): { ok: true; value: number | null } | { ok: false; error: string } {
  const trimmed = raw.trim()
  if (trimmed === "") return { ok: true, value: null }
  const n = Number(trimmed)
  if (Number.isNaN(n)) return { ok: false, error: `Numero non valido: "${trimmed}"` }
  return { ok: true, value: n }
}

export const maxDuration = 300

export async function POST(request: Request) {
  const auth = await assertSuperAdmin()
  if (!auth.ok) return auth.response

  let form: FormData
  try {
    form = await request.formData()
  } catch (err: any) {
    return NextResponse.json({ error: `Multipart non valido: ${err?.message || err}` }, { status: 400 })
  }

  const count = Number(form.get("count") || 0)
  if (!Number.isInteger(count) || count <= 0) {
    return NextResponse.json({ error: "count deve essere un intero positivo" }, { status: 400 })
  }
  if (count > 50) {
    return NextResponse.json({ error: "Massimo 50 fatture per upload bulk" }, { status: 400 })
  }

  const sb = await createServiceRoleClient()

  // Pre-fetch organization_id per tutti gli hotel coinvolti, una sola volta.
  const hotelIds = new Set<string>()
  const invoiceNumbers = new Set<string>()
  for (let i = 0; i < count; i++) {
    const hid = String(form.get(`hotelId_${i}`) || "")
    if (hid) hotelIds.add(hid)
    const inv = String(form.get(`invoiceNumber_${i}`) || "").trim()
    if (inv) invoiceNumbers.add(inv)
  }
  const orgMap = new Map<string, string | null>()
  const hotelNameMap = new Map<string, string | null>()
  if (hotelIds.size > 0) {
    const { data: hotelRows } = await sb
      .from("hotels")
      .select("id, organization_id, name")
      .in("id", Array.from(hotelIds))
    for (const h of hotelRows || []) {
      const row = h as { id: string; organization_id: string | null; name: string | null }
      orgMap.set(row.id, row.organization_id)
      hotelNameMap.set(row.id, row.name)
    }
  }

  // Pre-check fatture gia' esistenti con lo stesso invoice_number.
  // Dato che `invoice_number` ha UNIQUE globale (non scoped per hotel/org),
  // un duplicato significa "fattura gia' caricata". Ricostruiamo una mappa
  // per matching per chiave (invoice_number) cosi' possiamo:
  // - rifiutare con messaggio chiaro se i dati divergono
  // - fare auto-attach del PDF se la fattura esiste senza pdf_url e l'utente
  //   ne sta caricando uno ora.
  type ExistingInvoice = {
    id: string
    invoice_number: string
    hotel_id: string | null
    issue_date: string | null
    total: number | null
    pdf_url: string | null
  }
  const existingByNumber = new Map<string, ExistingInvoice>()
  if (invoiceNumbers.size > 0) {
    const { data: existingRows } = await sb
      .from("invoices")
      .select("id, invoice_number, hotel_id, issue_date, total, pdf_url")
      .in("invoice_number", Array.from(invoiceNumbers))
    for (const row of (existingRows || []) as ExistingInvoice[]) {
      existingByNumber.set(row.invoice_number, row)
    }
  }

  type Result =
    | { index: number; success: true; invoiceId: string; reused?: boolean; pdfAttached?: boolean }
    | { index: number; success: false; error: string }
  const results: Result[] = []

  const fmtEuro = (n: number | null) =>
    n == null ? "-" : new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" }).format(n)
  const fmtDate = (d: string | null) => {
    if (!d) return "-"
    const [y, m, day] = d.split("-")
    return y && m && day ? `${day}/${m}/${y}` : d
  }

  for (let i = 0; i < count; i++) {
    const hotelId = String(form.get(`hotelId_${i}`) || "")
    if (!hotelId) {
      results.push({ index: i, success: false, error: "hotelId mancante" })
      continue
    }

    const subtotalRes = parseNumeric(String(form.get(`subtotal_${i}`) || ""))
    if (!subtotalRes.ok) {
      results.push({ index: i, success: false, error: `Imponibile: ${subtotalRes.error}` })
      continue
    }
    const taxRes = parseNumeric(String(form.get(`tax_${i}`) || ""))
    if (!taxRes.ok) {
      results.push({ index: i, success: false, error: `IVA: ${taxRes.error}` })
      continue
    }
    const totalRes = parseNumeric(String(form.get(`total_${i}`) || ""))
    if (!totalRes.ok) {
      results.push({ index: i, success: false, error: `Totale: ${totalRes.error}` })
      continue
    }

    const invoiceNumber = String(form.get(`invoiceNumber_${i}`) || "").trim() || null

    // Controllo duplicato PRIMA di toccare blob storage o DB.
    // Se la fattura esiste gia' (stesso invoice_number):
    //   - se ha gia' un pdf_url -> errore chiaro, skippiamo
    //   - se non ha pdf_url e l'utente sta caricando un PDF -> auto-attach,
    //     trattato come "success: reused" senza creare una nuova riga
    //   - se non ha pdf_url e l'utente non sta caricando un PDF -> errore
    //     (caricare la stessa fattura due volte senza PDF non ha senso)
    const existing = invoiceNumber ? existingByNumber.get(invoiceNumber) : undefined
    if (existing) {
      const hotelName = hotelNameMap.get(existing.hotel_id || "") || "altra struttura"
      const sameHotel = existing.hotel_id === hotelId
      const baseInfo = `Fattura ${invoiceNumber} gia' presente${
        sameHotel ? "" : ` per ${hotelName}`
      } (emessa ${fmtDate(existing.issue_date)}, totale ${fmtEuro(existing.total)})`

      const incomingFile = form.get(`file_${i}`) as File | null
      const hasIncomingPdf = incomingFile && incomingFile.size > 0

      if (existing.pdf_url) {
        results.push({ index: i, success: false, error: `${baseInfo}. PDF gia' allegato.` })
        continue
      }

      if (!hasIncomingPdf) {
        results.push({
          index: i,
          success: false,
          error: `${baseInfo} senza PDF. Per allegare il PDF, ricarica la riga selezionando il file.`,
        })
        continue
      }

      // Auto-attach: la fattura esiste senza PDF, l'utente ne sta caricando uno.
      if (incomingFile.type !== "application/pdf") {
        results.push({ index: i, success: false, error: "Il file deve essere un PDF" })
        continue
      }
      if (incomingFile.size > 10 * 1024 * 1024) {
        results.push({ index: i, success: false, error: "PDF deve essere < 10 MB" })
        continue
      }

      try {
        const blob = await put(`invoices/${hotelId}/${Date.now()}-${incomingFile.name}`, incomingFile, {
          access: "private",
          contentType: "application/pdf",
          addRandomSuffix: true,
        })
        const { error: updateErr } = await sb
          .from("invoices")
          .update({
            pdf_url: blob.url,
            pdf_file_name: incomingFile.name,
            pdf_file_size: incomingFile.size,
          })
          .eq("id", existing.id)
        if (updateErr) {
          results.push({ index: i, success: false, error: `Auto-attach PDF fallito: ${updateErr.message}` })
          continue
        }
        results.push({ index: i, success: true, invoiceId: existing.id, reused: true, pdfAttached: true })
        continue
      } catch (err: any) {
        results.push({
          index: i,
          success: false,
          error: `Upload PDF fallito: ${err?.message || "errore sconosciuto"}`,
        })
        continue
      }
    }

    // Upload PDF se presente
    let pdfUrl: string | null = null
    let pdfFileName: string | null = null
    let pdfFileSize: number | null = null
    const file = form.get(`file_${i}`) as File | null
    if (file && file.size > 0) {
      if (file.type !== "application/pdf") {
        results.push({ index: i, success: false, error: "Il file deve essere un PDF" })
        continue
      }
      if (file.size > 10 * 1024 * 1024) {
        results.push({ index: i, success: false, error: "PDF deve essere < 10 MB" })
        continue
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
        results.push({ index: i, success: false, error: `Upload PDF fallito: ${err?.message || "errore sconosciuto"}` })
        continue
      }
    }

    const { data: inserted, error } = await (async () => {
      const paidAtVal = String(form.get(`paidAt_${i}`) || "").trim() || null
      const paidAmountRaw = String(form.get(`paidAmount_${i}`) || "").trim()
      const paidAmount =
        paidAmountRaw === "" || Number.isNaN(Number(paidAmountRaw))
          ? null
          : Number(paidAmountRaw)
      let st = String(form.get(`status_${i}`) || "pending").trim()
      // Auto-bump come nelle altre route: paid_amount >= total => paid;
      // back-compat: paid_at senza importo => paid.
      if (
        paidAmount != null &&
        totalRes.value != null &&
        paidAmount >= totalRes.value &&
        st !== "cancelled" &&
        st !== "draft"
      ) {
        st = "paid"
      } else if (paidAtVal && paidAmount == null) {
        if (st === "pending" || st === "overdue") st = "paid"
      }
      return sb
        .from("invoices")
        .insert({
          hotel_id: hotelId,
          organization_id: orgMap.get(hotelId) ?? null,
          invoice_number: invoiceNumber,
          status: st,
          plan_type: String(form.get(`planType_${i}`) || "").trim() || null,
          issue_date: String(form.get(`issueDate_${i}`) || "").trim() || null,
          period_start: String(form.get(`periodStart_${i}`) || "").trim() || null,
          period_end: String(form.get(`periodEnd_${i}`) || "").trim() || null,
          subtotal: subtotalRes.value,
          tax: taxRes.value,
          total: totalRes.value,
          due_date: String(form.get(`dueDate_${i}`) || "").trim() || null,
          paid_at: paidAtVal,
          paid_amount: paidAmount,
          pdf_url: pdfUrl,
          pdf_file_name: pdfFileName,
          pdf_file_size: pdfFileSize,
          notes: String(form.get(`notes_${i}`) || "").trim() || null,
          uploaded_by: auth.userId,
        })
        .select("id")
        .single()
    })()

    if (error) {
      console.error(`[v0] superadmin invoice bulk insert ${i} failed:`, error)
      // Race condition: qualcuno ha appena creato una fattura con lo stesso
      // numero tra la pre-check e questa insert. Messaggio piu' chiaro.
      const friendly =
        error.code === "23505" && (error.message || "").includes("invoices_invoice_number_key")
          ? `Fattura ${invoiceNumber} gia' esistente nel sistema (creata in parallelo)`
          : error.message
      results.push({ index: i, success: false, error: friendly })
      continue
    }

    results.push({ index: i, success: true, invoiceId: inserted.id as string })
  }

  const successCount = results.filter((r) => r.success).length
  const failureCount = results.length - successCount

  // Reconcile commissioni venditore per tutte le fatture create con successo.
  // In serie (le righe sono al massimo 50, idempotente, safe).
  for (const r of results) {
    if (r.success) {
      await reconcileCommissionsForInvoice(r.invoiceId).catch((e) =>
        console.error("[v0] reconcile commissions on bulk invoice failed:", e),
      )
    }
  }

  return NextResponse.json({ results, successCount, failureCount })
}
