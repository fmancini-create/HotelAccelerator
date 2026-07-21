import { NextResponse } from "next/server"
import { requireSuperadmin } from "@/lib/sales/superadmin-guard"
import { renderLeadPresentationEmail } from "@/lib/sales/lead-email-renderer"

export const dynamic = "force-dynamic"

/**
 * POST /api/superadmin/sales/email-template/preview
 *
 * Renderizza il template (passato nel body, non quello DB) con dati
 * placeholder fittizi cosi' il superadmin vede il risultato finale prima
 * di salvare.
 *
 * Body: { subject_template, html_template }
 */
export async function POST(req: Request) {
  const guard = await requireSuperadmin()
  if ("error" in guard) return guard.error

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: "invalid_body" }, { status: 400 })

  const subject_template = String(body.subject_template ?? "")
  const html_template = String(body.html_template ?? "")

  const { subject, html } = await renderLeadPresentationEmail({
    leadFirstName: "Mario",
    leadLastName: "Rossi",
    leadHotelName: "Hotel Esempio",
    agentName: "Anna Bianchi",
    agentEmail: "anna.bianchi@santaddeo.com",
    trackingToken: "PREVIEW_TOKEN_NOT_REAL",
    templateOverride: { subject_template, html_template },
  })

  return NextResponse.json({ subject, html })
}
