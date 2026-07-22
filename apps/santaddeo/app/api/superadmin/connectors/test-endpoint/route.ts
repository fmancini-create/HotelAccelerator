import { type NextRequest, NextResponse } from "next/server"
import { createClient, createServiceRoleClient } from "@/lib/supabase/server"
import { isDevAuthAsync } from "@/lib/env/dev-auth"
import { getConnector } from "@/lib/connectors/registry"
import type { PMSIntegration } from "@/lib/connectors/connector"
import { findTestEndpoint, toCatalogMetadata } from "@/lib/connectors/test-catalog"
import type { TestIntegration } from "@/lib/connectors/test-endpoint-types"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const maxDuration = 30

/**
 * Verifica che il chiamante sia superadmin (bypass nel preview v0, come le
 * altre route superadmin). Ritorna una NextResponse d'errore se non lo e',
 * altrimenti null.
 */
async function assertSuperAdmin(): Promise<NextResponse | null> {
  const isV0Preview = await isDevAuthAsync()
  if (isV0Preview) return null

  const authClient = await createClient()
  const {
    data: { user },
  } = await authClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 })
  }

  const service = await createServiceRoleClient()
  const { data: profile } = await service.from("profiles").select("role").eq("id", user.id).single()
  if (!profile || !["superadmin", "super_admin", "system_admin"].includes(profile.role)) {
    return NextResponse.json({ error: "Accesso non autorizzato" }, { status: 403 })
  }
  return null
}

/** Risolve il codice connettore (scidoo/brig/slope/...) da una integrazione. */
function resolveConnectorCode(pms: PMSIntegration): string | null {
  return getConnector(pms)?.code ?? null
}

/**
 * GET ?connector=<code>  → metadata del catalogo di test per quel connettore
 * (senza le funzioni run: solo metodo/path/descrizione/readOnly).
 */
export async function GET(request: NextRequest) {
  const denied = await assertSuperAdmin()
  if (denied) return denied

  const code = request.nextUrl.searchParams.get("connector")
  const metadata = toCatalogMetadata(code)
  if (!metadata) {
    return NextResponse.json(
      { error: `Nessun catalogo di test per il connettore "${code ?? ""}"` },
      { status: 404 },
    )
  }
  return NextResponse.json({ catalog: metadata })
}

/**
 * POST { hotelId, endpointKey }  → esegue un endpoint READ-ONLY del connettore
 * attivo dell'hotel, usando le credenziali reali per-hotel, e ritorna l'esito.
 * Gli endpoint di scrittura sono rifiutati (400).
 */
export async function POST(request: NextRequest) {
  const denied = await assertSuperAdmin()
  if (denied) return denied

  let hotelId: string | undefined
  let endpointKey: string | undefined
  try {
    const body = await request.json()
    hotelId = body?.hotelId
    endpointKey = body?.endpointKey
  } catch {
    return NextResponse.json({ error: "Body JSON non valido" }, { status: 400 })
  }

  if (!hotelId || !endpointKey) {
    return NextResponse.json({ error: "hotelId e endpointKey sono obbligatori" }, { status: 400 })
  }

  const service = await createServiceRoleClient()
  const { data: integration, error } = await service
    .from("pms_integrations")
    .select("pms_name, integration_mode, api_key, endpoint_url, property_id, vat_number, config, is_active")
    .eq("hotel_id", hotelId)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: `Errore lettura integrazione: ${error.message}` }, { status: 500 })
  }
  if (!integration) {
    return NextResponse.json({ error: "Nessuna integrazione PMS per questa struttura" }, { status: 404 })
  }

  const code = resolveConnectorCode(integration as PMSIntegration)
  if (!code) {
    return NextResponse.json(
      {
        error: `Connettore non risolvibile (pms_name="${integration.pms_name}", mode="${integration.integration_mode}")`,
      },
      { status: 400 },
    )
  }

  const endpoint = findTestEndpoint(code, endpointKey)
  if (!endpoint) {
    return NextResponse.json(
      { error: `Endpoint "${endpointKey}" non trovato nel catalogo di "${code}"` },
      { status: 404 },
    )
  }

  if (!endpoint.readOnly || !endpoint.run) {
    return NextResponse.json(
      { error: "Endpoint di scrittura: non testabile per non modificare dati reali sul PMS" },
      { status: 400 },
    )
  }

  const result = await endpoint.run(integration as TestIntegration)
  return NextResponse.json({ connector: code, endpointKey, result })
}
