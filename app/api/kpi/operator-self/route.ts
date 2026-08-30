import { type NextRequest, NextResponse } from "next/server"

import { getCallerIdentity } from "@/lib/auth/admin-access"
import { computeOperatorPerformance, GIORNI_PREDEFINITI } from "@/lib/platform/operator-performance"
import { createServiceClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

/**
 * Self-only KPI snapshot for the authenticated operator.
 *
 * The tenant explicitly opts a person into measurement. We reuse the same
 * trusted computation as the personalized dashboard, so the Inbox never falls
 * back to the legacy Gmail historical metrics that were intentionally disabled.
 */
export async function GET(request: NextRequest) {
  const identity = await getCallerIdentity(request)
  if (!identity?.propertyId) return NextResponse.json({ error: "Sessione non valida" }, { status: 401 })

  if (!identity.adminUserId) {
    return NextResponse.json({ enabled: false, days: GIORNI_PREDEFINITI, responses: null, conversations: null, medianResponseSeconds: null, measuredResponses: 0 })
  }

  const sb = createServiceClient()
  const { data: setting, error: settingError } = await sb
    .from("operator_kpi_settings")
    .select("enabled")
    .eq("property_id", identity.propertyId)
    .eq("user_id", identity.adminUserId)
    .maybeSingle()

  if (settingError) throw settingError
  if (!setting?.enabled) {
    return NextResponse.json({ enabled: false, days: GIORNI_PREDEFINITI, responses: null, conversations: null, medianResponseSeconds: null, measuredResponses: 0 })
  }

  const performance = await computeOperatorPerformance(sb, identity.propertyId, GIORNI_PREDEFINITI)
  const me = performance.righe.find((row) => row.genere === "persona" && row.id === identity.adminUserId)

  return NextResponse.json({
    enabled: true,
    days: performance.giorni,
    responses: me?.risposte ?? 0,
    conversations: me?.conversazioni ?? 0,
    medianResponseSeconds: me?.attesaMedianaSec ?? null,
    measuredResponses: me?.attesaSu ?? 0,
  })
}
