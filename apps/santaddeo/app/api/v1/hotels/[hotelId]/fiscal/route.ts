/**
 * GET /api/v1/hotels/:hotelId/fiscal
 *
 * Produzione fiscale: lista completa documenti (fatture, corrispettivi,
 * fatture sospese, acconti) con dettaglio righe IVA, metodi di pagamento,
 * centri di ricavo e intestatario.
 * Scope richiesto: fiscal:read
 *
 * Query params:
 *   from=YYYY-MM-DD                              (default: primo giorno mese corrente)
 *   to=YYYY-MM-DD                                (default: oggi)
 *   startDate=YYYY-MM-DD / endDate=YYYY-MM-DD    (alias di from/to)
 *   type=invoice|fee|receipt|suspended_invoice|deposit  (opzionale: filtra per tipo)
 *   page=1                                       (paginazione)
 *   per_page=50                                  (max 200)
 *
 * Response:
 *   summary: {
 *     period: { from, to },
 *     total_documents,
 *     grand_total,                              // lordo IVA inclusa
 *     taxable_total,                            // imponibile (= sum fees[].taxable)
 *     tax_total,                                // IVA (= sum fees[].tax)
 *     by_type: {
 *       invoice|fee|receipt|suspended_invoice|deposit: { count, total, taxable, tax }
 *     },
 *     invoices: { count, total }                // back-compat
 *     receipts: { count, total }                // back-compat
 *     by_month: [{ month:"YYYY-MM", documents, taxable, tax, total }],
 *                                              // = "Riepilogo Mensile" UI Scidoo
 *     vat_breakdown: [{ vat_rate, label, taxable, tax, count }],
 *                                              // ripartizione per aliquota pura
 *     revenue_centers: [{ code, name, vat_rate, label, taxable, tax, total, count }]
 *                                              // = "Riepilogo Aliquota" UI Scidoo
 *                                              //   (es. "IVA 10% Pernottamenti",
 *                                              //   "IVA 10% F&B", "Imposta di Soggiorno")
 *   }
 *   data: [ documenti paginati con taxable_total, tax_total, fees[].label,
 *           account_revenues[] per reparto ]
 *   meta: { total, page, per_page, has_more }
 */

import { type NextRequest, NextResponse } from "next/server"
import { authenticateApiKey, assertHotelAccess } from "@/lib/api/v1/auth"
import { apiError, apiInternalError, parsePagination, parseDateRange } from "@/lib/api/v1/response"
import { createServiceRoleClient } from "@/lib/supabase/server"

// --- Types ---

interface FiscalDocument {
  id: string
  /**
   * Tipo documento. Il sync salva `type="invoice"` per fatture emesse,
   * `type="fee"` per corrispettivi giornalieri, `type="suspended_invoice"`
   * per fatture sospese, `type="deposit"` per acconti. Conserviamo il valore
   * originale per dare visibilita' completa al consumer.
   */
  type: "invoice" | "fee" | "receipt" | "suspended_invoice" | "deposit"
  number: string | null
  code_number: string | null
  document_date: string | null
  registration_date: string | null
  document_name: string | null
  description: string | null
  total: number
  /** Imponibile totale (somma fees[].taxable) — utile per ripartizione IVA */
  taxable_total: number
  /** IVA totale (somma fees[].tax) */
  tax_total: number
  currency: string
  split_payment: boolean
  holder: {
    name: string | null
    vat_number: string | null
    tax_code: string | null
    address: string | null
    city: string | null
    province: string | null
    postal_code: string | null
    country: string | null
    account_type: string | null
    pec: string | null
    destination_code: string | null
  } | null
  fees: {
    /**
     * Label leggibile dell'aliquota (es. "IVA 10%", "Imposta di Soggiorno").
     * Generato lato API perche' Scidoo non lo include nei fees[] del response.
     */
    label: string
    vat_rate: string
    taxable: number
    tax: number
    fiscal_nature: string | null
    regulatory_reference: string | null
  }[]
  lines: {
    description: string
    qty: number
    taxable: number
    tax: number
    vat_rate: string
    fiscal_nature: string | null
  }[]
  payment_methods: {
    id: string
    code: string
    name: string
    value: number
    suspended: boolean
  }[]
  /**
   * Ripartizione per centro di ricavo (Scidoo "account_revenues").
   * Es: [{code:"Pernott", name:"Pernottamenti", value:106.36, vat_rate:"10"}].
   * Da usare per la ripartizione per reparto (room/F&B/SPA/imposta soggiorno).
   */
  account_revenues: {
    code: string
    name: string
    value: number
    vat_rate: string | null
  }[]
}

/**
 * Genera un label leggibile per una riga IVA. Scidoo non manda labels nelle
 * `fees[]` ma fornisce vat_rate + fiscal_nature; mappiamo questi due alla
 * nomenclatura standard italiana.
 */
function feeLabel(vatRate: string, fiscalNature: string | null): string {
  const rate = parseFloat(vatRate)
  // Imposta di soggiorno: aliquota 0% con fiscal_nature N1 (Operazioni escluse)
  if (rate === 0 && fiscalNature === "N1") return "Imposta di Soggiorno"
  if (rate === 0) return `Esente IVA${fiscalNature ? ` (${fiscalNature})` : ""}`
  if (Number.isFinite(rate) && rate > 0) return `IVA ${rate}%`
  return `IVA ${vatRate}`
}

// --- Helpers ---

/** Strip HTML tags from Scidoo line descriptions */
function stripHtml(s: string | null | undefined): string {
  if (!s) return ""
  return s.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim()
}

/**
 * Map raw `type` from Scidoo sync to a stable enum.
 * Il sync salva i documenti con `type` originale Scidoo (sempre "invoice")
 * sovrascritto a "invoice" | "fee" | "suspended_invoice" | "deposit" in base
 * a quale array della response li conteneva. Il valore "receipt" non e' mai
 * usato dal sync ma lo manteniamo per compat con codice esterno.
 */
function normalizeType(rawType: any): FiscalDocument["type"] {
  const t = String(rawType || "").toLowerCase()
  if (t === "fee" || t === "receipt" || t === "suspended_invoice" || t === "deposit") return t
  // "invoice" e tutto il resto (default): fattura emessa
  return "invoice"
}

/** Extract and normalize documents from raw_data JSONB */
function extractDocuments(rawData: any): FiscalDocument[] {
  if (!rawData?.documents || !Array.isArray(rawData.documents)) return []

  return rawData.documents.map((doc: any): FiscalDocument => {
    const fees = (doc.fees || []).map((f: any) => {
      const vatRate = String(f.vat_rate || "0")
      const fiscalNature = f.fiscal_nature || null
      return {
        label: feeLabel(vatRate, fiscalNature),
        vat_rate: vatRate,
        taxable: Number(f.taxable) || 0,
        tax: Number(f.tax) || 0,
        fiscal_nature: fiscalNature,
        regulatory_reference: f.regulatory_reference || null,
      }
    })
    const taxableTotal = fees.reduce((s: number, f: any) => s + f.taxable, 0)
    const taxTotal = fees.reduce((s: number, f: any) => s + f.tax, 0)

    return {
      id: String(doc.id || ""),
      type: normalizeType(doc.type),
      number: doc.number || null,
      code_number: doc.code_number || null,
      document_date: doc.document_date || null,
      registration_date: doc.registration_date || null,
      document_name: stripHtml(doc.document_name),
      description: doc.description || null,
      total: Number(doc.total) || 0,
      taxable_total: Math.round(taxableTotal * 100) / 100,
      tax_total: Math.round(taxTotal * 100) / 100,
      currency: doc.currency || "EUR",
      split_payment: Boolean(doc.split_payment),
      holder: doc.holder
        ? {
            name: doc.holder.name || null,
            vat_number: doc.holder.vat_number || null,
            tax_code: doc.holder.tax_code || null,
            address: doc.holder.address || null,
            city: doc.holder.city || null,
            province: doc.holder.province || null,
            postal_code: doc.holder.postal_code || null,
            country: doc.holder.country || null,
            account_type: doc.holder.account_type || null,
            pec: doc.holder.pec || null,
            destination_code: doc.holder.destination_code || null,
          }
        : null,
      fees,
      lines: (doc.lines || [])
        .filter((l: any) => Number(l.taxable) > 0 || Number(l.tax) > 0)
        .map((l: any) => ({
          description: stripHtml(l.good),
          qty: Number(l.qty) || 1,
          taxable: Number(l.taxable) || 0,
          tax: Number(l.tax) || 0,
          vat_rate: String(l.vat_rate || "0"),
          fiscal_nature: l.fiscal_nature || null,
        })),
      payment_methods: (doc.payment_methods || []).map((p: any) => ({
        id: String(p.id || ""),
        code: p.code || "",
        name: p.name || "",
        value: Number(p.value) || 0,
        suspended: Boolean(p.suspended),
      })),
      account_revenues: (doc.account_revenues || []).map((a: any) => ({
        code: a.code || "",
        name: a.name || "",
        value: Number(a.value) || 0,
        vat_rate: a.vat_rate != null ? String(a.vat_rate) : null,
      })),
    }
  })
}

// --- Route handler ---

export async function GET(req: NextRequest, { params }: { params: Promise<{ hotelId: string }> }) {
  const auth = await authenticateApiKey(req, "fiscal:read")
  if ("error" in auth) return apiError("auth_error", auth.error, auth.status)

  const { hotelId } = await params
  const accessErr = assertHotelAccess(auth, hotelId)
  if (accessErr) return apiError("access_denied", accessErr.error, accessErr.status)

  try {
    const supabase = await createServiceRoleClient()
    const searchParams = req.nextUrl.searchParams

    // Default: primo giorno mese corrente -> oggi
    const now = new Date()
    const defaultFrom = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`
    const defaultTo = now.toISOString().slice(0, 10)

    // Supporta sia `from`/`to` (standard del nostro API) sia
    // `startDate`/`endDate` (usato dai client esterni tipo HotelProfitAI).
    // parseDateRange valida solo from/to, quindi aggiungiamo qui il
    // fallback con la stessa regex YYYY-MM-DD.
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/
    const { from, to } = parseDateRange(searchParams)
    const startDateAlias = searchParams.get("startDate")
    const endDateAlias = searchParams.get("endDate")
    const dateFrom =
      from || (startDateAlias && dateRegex.test(startDateAlias) ? startDateAlias : null) || defaultFrom
    const dateTo =
      to || (endDateAlias && dateRegex.test(endDateAlias) ? endDateAlias : null) || defaultTo
    const typeFilter = searchParams.get("type") // "invoice" | "receipt" | null

    // BUG FIX 16/05/2026: la query puntava alla tabella `rms_fiscal_production`
    // che NON esiste (legacy name mai migrato). La tabella reale, dopo il
    // rename della pipeline connectors del 30/04, e' `connectors.scidoo_raw_fiscal_production`
    // con colonna `raw_data` (JSONB) e non `source_data`. PostgREST ritornava
    // "relation does not exist" e il catch generico restituiva 500 con
    // "Failed to fetch fiscal data".
    const supabaseConnectors = supabase.schema("connectors")
    const { data: rows, error } = await supabaseConnectors
      .from("scidoo_raw_fiscal_production")
      .select("id, date, raw_data")
      .eq("hotel_id", hotelId)
      .gte("date", dateFrom)
      .lte("date", dateTo)
      .order("date", { ascending: true })

    if (error) {
      // Log full PostgREST diagnostic (code/details/hint), non solo message:
      // gli errori 42P01/42703 sono identificabili solo con code+details.
      console.error(
        "[v1/fiscal] DB error:",
        error.code,
        error.message,
        error.details,
        error.hint,
      )
      return apiInternalError("Failed to fetch fiscal data")
    }

    // Estrai e appiattisci tutti i documenti dal JSONB raw_data.documents[]
    let allDocuments: FiscalDocument[] = []
    for (const row of rows || []) {
      allDocuments.push(...extractDocuments(row.raw_data))
    }

    // Filtra per tipo se richiesto. Accetta anche valori legacy.
    const allowedTypes = new Set(["invoice", "fee", "receipt", "suspended_invoice", "deposit"])
    if (typeFilter && allowedTypes.has(typeFilter)) {
      allDocuments = allDocuments.filter((d) => d.type === typeFilter)
    }

    // Deduplicazione per document ID (lo stesso doc puo' apparire in piu' date)
    const seen = new Set<string>()
    allDocuments = allDocuments.filter((d) => {
      if (seen.has(d.id)) return false
      seen.add(d.id)
      return true
    })

    // Ordina per data documento
    allDocuments.sort((a, b) => (a.document_date || "").localeCompare(b.document_date || ""))

    // --- Aggregazioni summary ---
    const round2 = (n: number) => Math.round(n * 100) / 100

    // Breakdown per tipo (anche tipi 0-count vengono restituiti come stub)
    const typeBuckets: Record<FiscalDocument["type"], { count: number; total: number; taxable: number; tax: number }> = {
      invoice: { count: 0, total: 0, taxable: 0, tax: 0 },
      fee: { count: 0, total: 0, taxable: 0, tax: 0 },
      receipt: { count: 0, total: 0, taxable: 0, tax: 0 },
      suspended_invoice: { count: 0, total: 0, taxable: 0, tax: 0 },
      deposit: { count: 0, total: 0, taxable: 0, tax: 0 },
    }
    // Breakdown per aliquota IVA "pura" (10%, 22%, 0%)
    const vatByRate = new Map<string, { taxable: number; tax: number; count: number; label: string }>()
    // Breakdown per centro di ricavo + aliquota: replica esatta della
    // "Riepilogo Aliquota" della UI Scidoo. Chiave = name + vat_rate.
    // Es: ("Pernottamenti","10") => "Iva 10% Room" UI Scidoo
    //     ("F&B","10")           => "Iva 10% F&B"
    //     ("SPA","10")           => "Iva 10% Spa"
    //     ("Pernottamenti","0")  => "Imposta di Soggiorno" / esenti
    // Per ricostruire l'IVA per riga (account_revenues[].value e' imponibile,
    // non lordo) calcoliamo: tax = taxable * vat_rate/100.
    const byRevenueCenter = new Map<
      string,
      { code: string; name: string; vat_rate: string; label: string; taxable: number; tax: number; count: number }
    >()
    // Breakdown mensile: replica della "Riepilogo Mensile" della UI Scidoo.
    const byMonth = new Map<string, { month: string; taxable: number; tax: number; total: number; count: number }>()

    for (const d of allDocuments) {
      const b = typeBuckets[d.type]
      b.count += 1
      b.total += d.total
      b.taxable += d.taxable_total
      b.tax += d.tax_total

      // Aggregazione mensile basata su document_date (fallback registration_date).
      const dateForMonth = d.document_date || d.registration_date
      if (dateForMonth && /^\d{4}-\d{2}/.test(dateForMonth)) {
        const monthKey = dateForMonth.slice(0, 7) // "YYYY-MM"
        const m = byMonth.get(monthKey) || {
          month: monthKey,
          taxable: 0,
          tax: 0,
          total: 0,
          count: 0,
        }
        m.taxable += d.taxable_total
        m.tax += d.tax_total
        m.total += d.total
        m.count += 1
        byMonth.set(monthKey, m)
      }

      for (const f of d.fees) {
        const key = f.vat_rate
        const cur = vatByRate.get(key) || { taxable: 0, tax: 0, count: 0, label: f.label }
        cur.taxable += f.taxable
        cur.tax += f.tax
        cur.count += 1
        cur.label = f.label
        vatByRate.set(key, cur)
      }

      for (const r of d.account_revenues) {
        const vat = r.vat_rate || "0"
        const key = `${r.code || r.name || "?"}__${vat}`
        // Calcolo label stile Scidoo: "Iva 10% Pernottamenti" -> "Iva 10% Room"
        // non e' 1:1 (Scidoo usa alias custom), quindi esponiamo entrambi
        // name (raw) + label (auto-generato) e lasciamo che il client mappi
        // "Pernottamenti" -> "Room" se necessario.
        let label: string
        const ratePct = parseFloat(vat)
        if (Number.isFinite(ratePct) && ratePct > 0) {
          label = `IVA ${ratePct}% ${r.name || r.code || ""}`.trim()
        } else if (r.name) {
          label = r.name
        } else {
          label = "Esente IVA"
        }
        const cur =
          byRevenueCenter.get(key) ||
          {
            code: r.code,
            name: r.name,
            vat_rate: vat,
            label,
            taxable: 0,
            tax: 0,
            count: 0,
          }
        // account_revenues[].value = imponibile (verificato vs Scidoo UI aprile).
        cur.taxable += r.value
        // IVA derivata dall'aliquota dichiarata su quella riga.
        if (Number.isFinite(ratePct) && ratePct > 0) {
          cur.tax += r.value * (ratePct / 100)
        }
        cur.count += 1
        byRevenueCenter.set(key, cur)
      }
    }

    const summary = {
      period: { from: dateFrom, to: dateTo },
      total_documents: allDocuments.length,
      grand_total: round2(allDocuments.reduce((s, d) => s + d.total, 0)),
      taxable_total: round2(allDocuments.reduce((s, d) => s + d.taxable_total, 0)),
      tax_total: round2(allDocuments.reduce((s, d) => s + d.tax_total, 0)),
      by_type: Object.fromEntries(
        Object.entries(typeBuckets).map(([k, v]) => [
          k,
          { count: v.count, total: round2(v.total), taxable: round2(v.taxable), tax: round2(v.tax) },
        ]),
      ),
      // Back-compat: i client esistenti leggono summary.invoices / summary.receipts
      invoices: { count: typeBuckets.invoice.count, total: round2(typeBuckets.invoice.total) },
      receipts: { count: typeBuckets.receipt.count, total: round2(typeBuckets.receipt.total) },
      // Riepilogo Mensile (replica della tabella "Riepilogo Mensile" in UI Scidoo)
      by_month: Array.from(byMonth.values())
        .map((m) => ({
          month: m.month,
          documents: m.count,
          taxable: round2(m.taxable),
          tax: round2(m.tax),
          total: round2(m.total),
        }))
        .sort((a, b) => a.month.localeCompare(b.month)),
      // Riepilogo per aliquota IVA "pura" (10%, 22%, 0%) — solo aliquote
      vat_breakdown: Array.from(vatByRate.entries())
        .map(([vat_rate, v]) => ({
          vat_rate,
          label: v.label,
          taxable: round2(v.taxable),
          tax: round2(v.tax),
          count: v.count,
        }))
        .sort((a, b) => b.taxable - a.taxable),
      // Riepilogo per centro di ricavo + aliquota (replica della "Riepilogo
      // Aliquota" in UI Scidoo, con label tipo "IVA 10% Pernottamenti")
      revenue_centers: Array.from(byRevenueCenter.values())
        .map((r) => ({
          code: r.code,
          name: r.name,
          vat_rate: r.vat_rate,
          label: r.label,
          taxable: round2(r.taxable),
          tax: round2(r.tax),
          total: round2(r.taxable + r.tax),
          count: r.count,
        }))
        .sort((a, b) => b.taxable - a.taxable),
    }

    // Paginazione sui documenti estratti (max 200 per pagina per fiscale)
    const { page, perPage, offset } = parsePagination(searchParams)
    const cappedPerPage = Math.min(perPage, 200)
    const total = allDocuments.length
    const paginatedDocs = allDocuments.slice(offset, offset + cappedPerPage)

    return NextResponse.json(
      {
        summary,
        data: paginatedDocs,
        meta: {
          total,
          page,
          per_page: cappedPerPage,
          has_more: page * cappedPerPage < total,
        },
      },
      { status: 200, headers: { "X-API-Version": "1", "Cache-Control": "no-store" } }
    )
  } catch (err: any) {
    console.error("[v1/fiscal] Unexpected:", err.message)
    return apiInternalError()
  }
}
