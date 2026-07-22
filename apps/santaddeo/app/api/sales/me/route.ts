import { NextResponse } from "next/server"
import { resolveCurrentAgentIdentity } from "@/lib/sales/current-agent"

export const dynamic = "force-dynamic"

/**
 * GET /api/sales/me
 * Identità del venditore loggato (nome + email) per risolvere CLIENT-SIDE i
 * placeholder {{nome_venditore}}/{{email_venditore}} nell'editor della posta,
 * così il venditore vede subito la propria firma reale invece del segnaposto.
 * NB: l'invio risolve comunque i placeholder lato server (fonte autoritativa).
 */
export async function GET() {
  const { agentName, agentEmail } = await resolveCurrentAgentIdentity()
  return NextResponse.json({ agentName, agentEmail })
}
