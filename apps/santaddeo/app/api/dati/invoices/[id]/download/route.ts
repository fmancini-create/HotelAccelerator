import { NextResponse } from "next/server"
import { head } from "@vercel/blob"
import { createClient } from "@/lib/supabase/server"
import { validateHotelAccess } from "@/lib/auth/validateHotelAccess"

export const dynamic = "force-dynamic"

/**
 * GET /api/dati/invoices/[id]/download
 *
 * Proxy che recupera il PDF privato della fattura e lo streamma al
 * browser del tenant. Verifica che l'utente abbia accesso all'hotel
 * proprietario della fattura via `validateHotelAccess` (super_admin,
 * organization_id match, o riga in `hotel_users`).
 *
 * I blob sono caricati con access: "private", quindi serve head()
 * per ottenere un downloadUrl firmato prima di poterli leggere.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await createClient()

  const { data: invoice, error } = await supabase
    .from("invoices")
    .select("hotel_id, pdf_url, pdf_file_name, invoice_number")
    .eq("id", id)
    .maybeSingle()

  if (error || !invoice?.pdf_url) {
    return NextResponse.json({ error: "Fattura o PDF non disponibile" }, { status: 404 })
  }

  const denied = await validateHotelAccess(invoice.hotel_id)
  if (denied) return denied

  let signedUrl: string
  try {
    const meta = await head(invoice.pdf_url)
    signedUrl = meta.downloadUrl || meta.url
  } catch (e) {
    console.error("[v0] tenant invoice download head() failed:", e, invoice.pdf_url)
    return NextResponse.json({ error: "Blob upstream error" }, { status: 502 })
  }

  const upstream = await fetch(signedUrl)
  if (!upstream.ok) {
    console.error("[v0] tenant invoice download upstream failed:", upstream.status, invoice.pdf_url)
    return NextResponse.json({ error: "Blob upstream error" }, { status: 502 })
  }

  const filename = invoice.pdf_file_name || `fattura-${invoice.invoice_number || id}.pdf`
  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "private, max-age=0",
    },
  })
}
