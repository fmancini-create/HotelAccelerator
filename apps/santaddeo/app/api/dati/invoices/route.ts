import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { validateHotelAccess } from "@/lib/auth/validateHotelAccess"

export const dynamic = "force-dynamic"

/**
 * GET /api/dati/invoices?hotel_id=...&year=YYYY
 * Lista delle fatture dell'hotel per l'anno selezionato. Visibile per
 * qualunque piano (commission OR fixed_fee), serve come archivio.
 * Le invoices vengono inserite manualmente in DB (o da futuri tool admin):
 * questa API e' read-only per il tenant.
 */
export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams
    const hotelId = sp.get("hotel_id")
    const yearStr = sp.get("year")
    if (!hotelId) {
      return NextResponse.json({ error: "hotel_id required" }, { status: 400 })
    }

    const denied = await validateHotelAccess(hotelId)
    if (denied) return denied

    const supabase = await createClient()
    let query = supabase
      .from("invoices")
      .select(
        "id, invoice_number, status, plan_type, issue_date, period_start, period_end, subtotal, tax, total, paid_amount, due_date, paid_at, pdf_url, pdf_file_name, notes, created_at",
      )
      .eq("hotel_id", hotelId)
      .order("issue_date", { ascending: false, nullsFirst: false })
      .order("period_start", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })

    if (yearStr) {
      const year = parseInt(yearStr)
      if (!Number.isNaN(year)) {
        // Filtro anno: una fattura "appartiene" all'anno se la sua data
        // di emissione cade in quell'anno (preferito), oppure il periodo
        // di competenza si sovrappone all'anno (fallback per fatture
        // legacy senza issue_date).
        query = query.or(
          `and(issue_date.gte.${year}-01-01,issue_date.lte.${year}-12-31),and(issue_date.is.null,period_start.lte.${year}-12-31,period_end.gte.${year}-01-01)`,
        )
      }
    }

    const { data, error } = await query
    if (error) throw error

    // Carryover: residuo cumulativo (total - paid_amount) di TUTTE le
    // fatture dell'hotel emesse PRIMA del 1 gennaio dell'anno selezionato.
    // Serve a mostrare in alto "Saldo riportato dal YYYY-1: €X" per
    // poter calcolare un saldo progressivo significativo dall'inizio
    // dell'anno corrente. Se yearStr non e' passato, carryover = 0.
    let carryover = 0
    if (yearStr) {
      const year = parseInt(yearStr)
      if (!Number.isNaN(year)) {
        const { data: prior, error: priorErr } = await supabase
          .from("invoices")
          .select("total, paid_amount")
          .eq("hotel_id", hotelId)
          .lt("issue_date", `${year}-01-01`)
        if (priorErr) throw priorErr
        carryover = (prior || []).reduce((acc, r: any) => {
          const t = Number(r.total || 0)
          const p = Number(r.paid_amount || 0)
          return acc + Math.max(0, t - p)
        }, 0)
      }
    }

    return NextResponse.json({ invoices: data || [], carryover })
  } catch (error) {
    console.error("[/api/dati/invoices] Error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
