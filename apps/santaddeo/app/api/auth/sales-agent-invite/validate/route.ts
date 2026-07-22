import { NextResponse } from "next/server"
import { validateSalesAgentInvitation } from "@/lib/sales/agent-invitation"

export const dynamic = "force-dynamic"

/**
 * GET /api/auth/sales-agent-invite/validate?token=...
 *
 * Usato dalla pagina /auth/sign-up per validare un token di invito
 * venditore arrivato via email. Ritorna i dati pre-impostati cosi la UI
 * puo' pre-popolare l'email read-only e mostrare "%commissione".
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const token = searchParams.get("token") ?? ""

  const inv = await validateSalesAgentInvitation(token)
  if (!inv) {
    return NextResponse.json({ error: "Invito non valido o scaduto" }, { status: 404 })
  }

  return NextResponse.json({
    valid: true,
    email: inv.email,
    display_name: inv.display_name,
    default_commission_percentage: inv.default_commission_percentage,
    invited_by_name: inv.invited_by_name,
    expires_at: inv.expires_at,
  })
}
