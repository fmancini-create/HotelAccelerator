import { type NextRequest, NextResponse } from "next/server"

import { accessErrorStatus, getCallerIdentity, isAccessError, requireTenantAdmin } from "@/lib/auth/admin-access"
import { requireAreaApi } from "@/lib/auth/area-access"
import { areaDeniedResponse, isAreaDenied } from "@/lib/auth/area-denied"
import { BrowserConfigValidationError, validaConfigurazioneBrowser } from "@/lib/pms/browser-config"
import { createServiceClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

function risposta(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store, max-age=0" },
  })
}

async function verificaArea(request: NextRequest): Promise<NextResponse | null> {
  const decision = await requireAreaApi("crm", request)
  return isAreaDenied(decision) ? (areaDeniedResponse(decision) as NextResponse) : null
}

async function identificaLettura(request: NextRequest): Promise<{ propertyId: string } | { denied: NextResponse }> {
  const denied = await verificaArea(request)
  if (denied) return { denied }

  const identity = await getCallerIdentity(request)
  if (!identity) return { denied: risposta({ error: "Non autenticato" }, 401) }
  if (!identity.propertyId) return { denied: risposta({ error: "Nessuna struttura attiva selezionata" }, 400) }
  return { propertyId: identity.propertyId }
}

async function identificaAmministratore(
  request: NextRequest,
): Promise<{ propertyId: string } | { denied: NextResponse }> {
  const denied = await verificaArea(request)
  if (denied) return { denied }

  try {
    return { propertyId: (await requireTenantAdmin(request)).propertyId }
  } catch (error) {
    if (isAccessError(error)) {
      return {
        denied: risposta(
          { error: error instanceof Error ? error.message : "Accesso negato" },
          accessErrorStatus(error),
        ),
      }
    }
    throw error
  }
}

export async function GET(request: NextRequest) {
  const who = await identificaLettura(request)
  if ("denied" in who) return who.denied

  const sb = createServiceClient()
  const { data, error } = await sb
    .from("pms_browser_configs")
    .select("id, name, web_url, is_active, updated_at")
    .eq("property_id", who.propertyId)
    .maybeSingle()

  if (error) return risposta({ error: `Lettura configurazione non riuscita: ${error.message}` }, 500)

  return risposta({
    configurata: Boolean(data),
    config: data
      ? {
          name: data.name,
          webUrl: data.web_url,
          isActive: data.is_active,
          updatedAt: data.updated_at,
        }
      : null,
  })
}

export async function PUT(request: NextRequest) {
  const who = await identificaAmministratore(request)
  if ("denied" in who) return who.denied

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return risposta({ error: "Richiesta non in formato JSON" }, 400)
  }

  let config: ReturnType<typeof validaConfigurazioneBrowser>
  try {
    config = validaConfigurazioneBrowser(
      (body ?? {}) as { name?: unknown; webUrl?: unknown; isActive?: unknown },
    )
  } catch (error) {
    if (error instanceof BrowserConfigValidationError) return risposta({ error: error.message }, 400)
    throw error
  }

  const sb = createServiceClient()
  const now = new Date().toISOString()
  const { error } = await sb.from("pms_browser_configs").upsert(
    {
      property_id: who.propertyId,
      name: config.name,
      web_url: config.webUrl,
      is_active: config.isActive,
      updated_at: now,
    },
    { onConflict: "property_id" },
  )

  if (error) return risposta({ error: `Salvataggio non riuscito: ${error.message}` }, 500)
  return risposta({ ok: true })
}
