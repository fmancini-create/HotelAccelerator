import { NextResponse } from "next/server"
import { head } from "@vercel/blob"
import { createClient, createServiceRoleClient } from "@/lib/supabase/server"

/**
 * GET /api/superadmin/invoices/[id]/download
 *
 * Proxy che recupera il PDF dal Blob private e lo streamma al browser
 * con Content-Disposition adatto per inline (preview) o attachment.
 * Solo super_admin (validato applicativamente) — i file sono privati e
 * non devono mai essere esposti tramite URL pubblico.
 *
 * NB: per i tenant non-superadmin esponiamo lo stesso pattern in una
 * route separata sotto `/api/dati/invoices/[id]/download` quando servira'.
 *
 * IMPORTANTE: i blob sono caricati con access: "private". La fetch
 * diretta su pdf_url ritorna 4xx (Blob upstream error). Per i blob
 * privati va usato head() che ritorna un downloadUrl firmato a tempo,
 * e poi si fetcha quello.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle()
  if (profile?.role !== "super_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const { id } = await params
  const sb = await createServiceRoleClient()
  const { data: invoice, error } = await sb
    .from("invoices")
    .select("pdf_url, pdf_file_name, invoice_number")
    .eq("id", id)
    .maybeSingle()

  if (error || !invoice?.pdf_url) {
    return NextResponse.json({ error: "PDF non disponibile" }, { status: 404 })
  }

  // Per blob privati va usato head() per ottenere un downloadUrl firmato.
  let signedUrl: string
  try {
    const meta = await head(invoice.pdf_url)
    signedUrl = meta.downloadUrl || meta.url
  } catch (e) {
    console.error("[v0] superadmin invoice download head() failed:", e, invoice.pdf_url)
    return NextResponse.json({ error: "Blob upstream error" }, { status: 502 })
  }

  const upstream = await fetch(signedUrl)
  if (!upstream.ok) {
    console.error(
      "[v0] superadmin invoice download upstream failed:",
      upstream.status,
      invoice.pdf_url,
    )
    return NextResponse.json({ error: "Blob upstream error" }, { status: 502 })
  }

  const filename =
    invoice.pdf_file_name ||
    `fattura-${invoice.invoice_number || id}.pdf`

  return new Response(upstream.body, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "private, max-age=0",
    },
  })
}
