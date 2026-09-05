import { type NextRequest, NextResponse } from "next/server"

import { getCallerIdentity } from "@/lib/auth/admin-access"
import { isAreaDenied, areaDeniedResponse } from "@/lib/auth/area-denied"
import { requireAreaApi } from "@/lib/auth/area-access"
import { getManubotClient } from "@/lib/manubot"
import { categorizeManubotError, logManubotError } from "@/lib/manubot/route-errors"
import { loadManubotPropertyForCaller } from "@/lib/manubot/tenant-context"
import { isModuleActive } from "@/lib/modules"
import { createServiceClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

/**
 * Opzioni del form task ManuBot, tenant-scoped e filtrate sul permesso Todos.
 * La stessa risposta vale anche come capability check: se il modulo non e'
 * attivo il client NON deve mostrare l'opzione ManuBot.
 */
export async function GET(request: NextRequest) {
  try {
    await requireAreaApi("todos", request)
    const identity = await getCallerIdentity(request)
    if (!identity) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

    const resolved = await loadManubotPropertyForCaller(
      identity,
      request.nextUrl.searchParams.get("property_id"),
    )
    if (!resolved.ok) {
      return NextResponse.json(
        { error: resolved.error, message: resolved.message },
        { status: resolved.status },
      )
    }

    const active = await isModuleActive(createServiceClient(), resolved.property.id, "manubot")
    if (!active) {
      return NextResponse.json({ error: "module_inactive" }, { status: 404 })
    }

    const client = await getManubotClient(resolved.property)
    const data = await client.getTaskFormData()
    return NextResponse.json(
      { ...data, active: true },
      { headers: { "Cache-Control": "no-store" } },
    )
  } catch (error) {
    if (isAreaDenied(error)) return areaDeniedResponse(error)
    const category = categorizeManubotError(error)
    logManubotError("manubot/task-data", error, category)
    return NextResponse.json({ error: category }, { status: 502 })
  }
}
