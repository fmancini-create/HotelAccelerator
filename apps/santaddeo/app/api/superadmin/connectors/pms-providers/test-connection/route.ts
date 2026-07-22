import { createClient } from "@/lib/supabase/server"
import { NextResponse } from "next/server"
import {
  discoverAvailableEndpoints,
  SCIDOO_ENDPOINT_MAP,
  type ApiDiscoveryResult,
} from "@/lib/services/api-discovery-service"

export async function POST(request: Request) {
  try {
    const supabase = await createClient()

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 })
    }

    // Verifica ruolo superadmin
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single()

    if (!profile || !["superadmin", "super_admin"].includes(profile.role)) {
      return NextResponse.json({ error: "Accesso non autorizzato" }, { status: 403 })
    }

    const { providerId } = await request.json()

    if (!providerId) {
      return NextResponse.json({ error: "ID provider obbligatorio" }, { status: 400 })
    }

    // Recupera dati provider
    const { data: provider, error: providerError } = await supabase
      .from("pms_providers")
      .select("*")
      .eq("id", providerId)
      .single()

    if (providerError || !provider) {
      return NextResponse.json({ error: "Provider non trovato" }, { status: 404 })
    }

    // Aggiorna stato a "testing"
    await supabase.from("pms_providers").update({ connection_status: "testing" }).eq("id", providerId)

    let result: ApiDiscoveryResult = {
      success: false,
      message: "",
      availableEndpoints: [],
      unavailableEndpoints: [],
      entities: [],
      criticalMissing: [],
      capabilities: {
        hasWebhook: false,
        hasVersioning: false,
        hasDeltaSync: false,
        hasLastModified: false,
        requiresFullHistorization: true,
        syncStrategy: "full",
      },
    }

    if (provider.code === "scidoo") {
      const baseUrl = provider.api_base_url || "https://www.scidoo.com/api/v1"
      const apiKey = provider.api_key

      if (!apiKey) {
        result = {
          ...result,
          success: false,
          message: "API Key non configurata. Inserisci la chiave API di Scidoo.",
        }
      } else {
        try {
          // 1. Test connessione base con /account/getInfo.php
          const accountResponse = await fetch(`${baseUrl}/account/getInfo.php`, {
            method: "POST",
            headers: {
              "Api-Key": apiKey,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({}),
          })

          if (!accountResponse.ok) {
            const errorText = await accountResponse.text()
            result = {
              ...result,
              success: false,
              message: `Errore Scidoo (${accountResponse.status}): ${errorText || accountResponse.statusText}`,
            }
          } else {
            const accountData = await accountResponse.json()

            // 2. Recupera le proprietà
            let properties: { id: number; name: string }[] = []
            try {
              const propsResponse = await fetch(`${baseUrl}/account/getProperties.php`, {
                method: "POST",
                headers: {
                  "Api-Key": apiKey,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({}),
              })
              if (propsResponse.ok) {
                const propsData = await propsResponse.json()
                properties = propsData.properties || propsData.data || []
              }
            } catch {
              // Ignora errori recupero proprietà
            }

            // 3. Discovery automatico di TUTTI gli endpoint disponibili
            const discovery = await discoverAvailableEndpoints(baseUrl, apiKey, "scidoo")

            // 4. Costruisci tutte le entità disponibili da Scidoo
            const allEntities = Object.values(SCIDOO_ENDPOINT_MAP).map((m) => m.entity)
            const uniqueEntities = [...new Set(allEntities)]

            // 5. Salva TUTTI gli endpoint scoperti nella tabella pms_available_endpoints
            if (discovery.endpointResults.length > 0) {
              // Cancella vecchi endpoint per questo provider prima di reinserire
              await supabase
                .from("pms_available_endpoints")
                .delete()
                .eq("provider_id", providerId)

              // Inserisci tutti gli endpoint scoperti
              const endpointRows = discovery.endpointResults.map((ep) => ({
                provider_id: providerId,
                endpoint_path: ep.endpoint_path,
                entity: ep.entity,
                description: ep.description,
                is_critical: ep.is_critical,
                is_available: ep.is_available,
                last_tested_at: new Date().toISOString(),
                last_test_status: ep.status,
                last_test_error: ep.error || null,
              }))

              const { error: insertError } = await supabase
                .from("pms_available_endpoints")
                .insert(endpointRows)

              if (insertError) {
                console.error("[Discovery] Error saving endpoints:", insertError.message)
              } else {
                console.log(`[Discovery] Saved ${endpointRows.length} endpoints for provider ${providerId}`)
              }
            }

            result = {
              success: true,
              message: `Connessione a Scidoo riuscita! Account: ${accountData.name || "N/A"}. Trovate ${properties.length} strutture. Testati ${discovery.endpointResults.length} endpoint: ${discovery.available.length} disponibili, ${discovery.unavailable.length} non disponibili.`,
              accountInfo: {
                name: accountData.name || "N/A",
                email: accountData.email,
                properties,
              },
              availableEndpoints: discovery.available,
              unavailableEndpoints: discovery.unavailable,
              entities: uniqueEntities,
              criticalMissing: discovery.criticalMissing,
              endpointResults: discovery.endpointResults,
              capabilities: {
                hasWebhook: false,
                hasVersioning: false,
                hasDeltaSync: false,
                hasLastModified: true,
                requiresFullHistorization: true,
                syncStrategy: "full",
              },
            }
          }
        } catch (error) {
          result = {
            ...result,
            success: false,
            message: `Errore di connessione: ${error instanceof Error ? error.message : "Errore sconosciuto"}`,
          }
        }
      }
    } else if (provider.code === "slope") {
      // ─── SLOPE (nativo, 13/07/2026) ───
      // NB: il token Slope e' PER STRUTTURA, quindi il vero test e' a livello
      // hotel (ping del connector in hotel_bindings). Qui a livello catalogo
      // testiamo solo se una api_key e' stata messa sul provider (es. la
      // sandbox), altrimenti confermiamo la config senza chiamare l'API.
      const baseUrl = provider.api_base_url || "https://api.slope.it"
      const apiKey = provider.api_key

      const slopeCapabilities = {
        hasWebhook: false,
        hasVersioning: false,
        hasDeltaSync: true, // filter=lastUpdateDate:gt:... (Strategia 1 doc Slope)
        hasLastModified: true,
        requiresFullHistorization: false,
        syncStrategy: "incremental" as const,
      }

      if (!apiKey) {
        result = {
          ...result,
          success: true,
          message: `Provider ${provider.name} configurato. Il token e' per-struttura: inseriscilo nel binding del singolo hotel e usa il test di connessione li'.`,
          entities: ["reservations", "room_types", "rate_plans", "push_rates"],
          capabilities: slopeCapabilities,
        }
      } else {
        try {
          const { SlopeClient, SlopeError } = await import("@/lib/connectors/slope/client")
          const client = new SlopeClient({ apiKey, baseUrl })
          const est = await client.getEstablishment()
          result = {
            ...result,
            success: true,
            message: `Connessione a Slope riuscita! Struttura: "${est.name ?? est.id}".`,
            entities: ["reservations", "room_types", "rate_plans", "push_rates"],
            capabilities: slopeCapabilities,
          }
        } catch (error) {
          const msg =
            error instanceof Error && error.name === "SlopeError"
              ? `Slope ha risposto ${(error as any).status}: ${String((error as any).body).slice(0, 200)}`
              : error instanceof Error
                ? error.message
                : "Errore sconosciuto"
          result = {
            ...result,
            success: false,
            message: `Errore di connessione a Slope: ${msg}`,
            capabilities: slopeCapabilities,
          }
        }
      }
    } else {
      // PMS generico - test simulato
      result = {
        success: true,
        message: `Connessione a ${provider.name} configurata (test manuale richiesto)`,
        availableEndpoints: [],
        unavailableEndpoints: [],
        entities: ["bookings", "room_types", "rates", "availability"],
        criticalMissing: [],
        capabilities: {
          hasWebhook: false,
          hasVersioning: false,
          hasDeltaSync: false,
          hasLastModified: false,
          requiresFullHistorization: true,
          syncStrategy: "full",
        },
      }
    }

    // Aggiorna stato provider con le capabilities e entità scoperte
    await supabase
      .from("pms_providers")
      .update({
        connection_status: result.success ? "connected" : "error",
        last_connection_test: new Date().toISOString(),
        last_connection_error: result.success ? null : result.message,
        has_webhook: result.capabilities.hasWebhook,
        has_versioning: result.capabilities.hasVersioning,
        has_delta_sync: result.capabilities.hasDeltaSync,
        has_last_modified: result.capabilities.hasLastModified,
        requires_full_historization: result.capabilities.requiresFullHistorization,
        sync_strategy: result.capabilities.syncStrategy,
        available_entities: result.entities,
      })
      .eq("id", providerId)

    return NextResponse.json(result)
  } catch (error) {
    console.error("Error testing PMS connection:", error)
    return NextResponse.json({ error: "Errore durante il test di connessione" }, { status: 500 })
  }
}
