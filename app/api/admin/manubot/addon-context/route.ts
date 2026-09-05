import { type NextRequest, NextResponse } from "next/server"

import { requireAreaApi } from "@/lib/auth/area-access"
import { isAreaDenied, areaDeniedResponse } from "@/lib/auth/area-denied"
import { getCallerIdentity } from "@/lib/auth/admin-access"
import { resolvePropertyIdForCaller } from "@/lib/auth/property-scope"
import { getSuiteManubotTaskFormData } from "@/lib/manubot/suite-task-hub"

export const dynamic = "force-dynamic"

/**
 * Stato autorevole dell'addon ManuBot per le superfici operative HA.
 *
 * Diversamente dal vecchio capability check, distingue un vero addon non
 * acquistato da una configurazione tecnica incompleta. Questo evita che un
 * errore di provisioning venga presentato all'utente come invito ad acquistare
 * di nuovo ManuBot.
 */
export async function GET(request: NextRequest) {
  try {
    await requireAreaApi("todos", request)
    const identity = await getCallerIdentity(request)
    if (!identity) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

    const scope = await resolvePropertyIdForCaller(
      identity,
      request.nextUrl.searchParams.get("property_id"),
      { verifyExists: true },
    )
    if (!scope.ok) {
      return NextResponse.json(
        { error: scope.error, message: scope.message },
        { status: scope.status },
      )
    }

    const result = await getSuiteManubotTaskFormData("hotelaccelerator", scope.propertyId)
    if (!result) return NextResponse.json({ error: "suite_customer_not_linked" }, { status: 404 })

    return NextResponse.json(
      {
        addon: "manubot",
        status: result.context.status,
        active: result.context.active,
        reason: result.context.reason,
        activation_url: result.context.activationUrl,
        task_data: result.taskData,
      },
      { headers: { "Cache-Control": "no-store" } },
    )
  } catch (error) {
    if (isAreaDenied(error)) return areaDeniedResponse(error)
    console.error("[manubot/addon-context] failed", {
      error: error instanceof Error ? error.message : "unknown",
    })
    return NextResponse.json({ error: "manubot_context_unavailable" }, { status: 502 })
  }
}
