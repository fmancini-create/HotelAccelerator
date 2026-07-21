/**
 * GET /api/pms/capabilities?pmsIntegrationId=...
 *
 * Espone alla UI le capability del connector configurato per l'hotel.
 * Cosi' il front-end puo' mostrare/nascondere bottoni come "Pubblica tariffe"
 * senza fare branching su pms_name (anti-pattern del 19-20/05/2026).
 *
 * Risposta: { code, displayName, capabilities: [...], supportsPushRates: bool }
 */

import { NextResponse, type NextRequest } from "next/server"
import { createClient, createServiceRoleClient } from "@/lib/supabase/server"
import { getConnector } from "@/lib/connectors/registry"

export async function GET(req: NextRequest) {
  const authClient = await createClient()
  const {
    data: { user },
  } = await authClient.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const pmsIntegrationId = req.nextUrl.searchParams.get("pmsIntegrationId")
  if (!pmsIntegrationId) {
    return NextResponse.json({ error: "pmsIntegrationId required" }, { status: 400 })
  }

  const supabase = await createServiceRoleClient()
  const { data: pms, error } = await supabase
    .from("pms_integrations")
    .select("id, pms_name, integration_mode, hotel_id")
    .eq("id", pmsIntegrationId)
    .single()
  if (error || !pms) {
    return NextResponse.json({ error: "Integrazione PMS non trovata" }, { status: 404 })
  }

  const connector = getConnector(pms as any)
  if (!connector) {
    return NextResponse.json({
      code: null,
      displayName: null,
      capabilities: [],
      supportsPushRates: false,
      reason: `Nessun connector registrato per pms_name="${pms.pms_name}" integration_mode="${pms.integration_mode}"`,
    })
  }

  const capabilities = Array.from(connector.capabilities)
  return NextResponse.json({
    code: connector.code,
    displayName: connector.displayName,
    capabilities,
    supportsPushRates: capabilities.includes("push_rates") && typeof connector.pushRates === "function",
  })
}
