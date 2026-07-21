import { type NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { ScidooClient } from "@/lib/services/scidoo-client"
import { BrigClient, BrigError } from "@/lib/connectors/brig/client"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"
export const maxDuration = 30

interface Blocker {
  code: string
  message: string
}

/**
 * Pre-flight ETL check per il super admin (tab "Binding & Versioni").
 *
 * Verifica:
 *  1. Esiste binding e l'hotel e' COMPLETE/ACTIVE.
 *  2. Esiste integrazione PMS attiva con api_key.
 *  3. Le credenziali PMS sono valide: ping reale al PMS (Scidoo /rooms,
 *     BRiG /api/nol/roomtypes/list). Senza questo passo il test
 *     restituiva "ETL OK" anche con api_key sbagliata (vedi memoria
 *     19/05 Cavallino: JWT incollato al posto dell'UUID).
 *
 * Per modalita' gsheets il ping PMS e' skippato.
 */
export async function GET(request: NextRequest) {
  const supabase = await createServiceRoleClient()
  const { searchParams } = new URL(request.url)
  const hotelId = searchParams.get("hotel_id")

  if (!hotelId) {
    return NextResponse.json({ error: "hotel_id richiesto" }, { status: 400 })
  }

  const blockers: Blocker[] = []

  try {
    const [bindingRes, integrationRes] = await Promise.all([
      supabase
        .from("hotel_bindings")
        .select("id, status, checklist_status, pms_provider_id")
        .eq("hotel_id", hotelId)
        .maybeSingle(),
      supabase
        .from("pms_integrations")
        .select("id, pms_name, api_key, integration_mode, is_active, endpoint_url, property_id, config")
        .eq("hotel_id", hotelId)
        .maybeSingle(),
    ])

    const binding = bindingRes.data
    const integration = integrationRes.data

    // ─────────────── 1. Binding ───────────────
    if (!binding) {
      blockers.push({ code: "NO_BINDING", message: "Nessun binding configurato per questa struttura" })
    } else if (binding.status !== "ACTIVE" && binding.status !== "COMPLETE") {
      blockers.push({
        code: "BINDING_INCOMPLETE",
        message: `Binding in stato ${binding.status} - deve essere COMPLETE o ACTIVE`,
      })
    }

    // ─────────────── 2. Integrazione ───────────────
    if (!integration) {
      blockers.push({ code: "NO_INTEGRATION", message: "Nessuna integrazione PMS configurata" })
    } else if (!integration.is_active) {
      blockers.push({ code: "INTEGRATION_INACTIVE", message: "Integrazione PMS disattivata" })
    } else if (integration.integration_mode === "api" && !integration.api_key) {
      blockers.push({ code: "NO_API_KEY", message: "Modalita' API ma API Key non configurata" })
    }

    // ─────────────── 3. Ping PMS (solo modalita' API + nessun blocker pregresso) ───────────────
    let pmsPing: { ok: boolean; provider: string; sample?: unknown; error?: string } | null = null

    if (
      blockers.length === 0 &&
      integration &&
      integration.integration_mode === "api" &&
      integration.is_active
    ) {
      const pmsName = (integration.pms_name || "").toLowerCase()

      try {
        if (pmsName === "scidoo") {
          const scidoo = new ScidooClient({
            apiKey: integration.api_key,
            propertyId: integration.property_id,
          })
          const rooms = await scidoo.getRoomTypes()
          pmsPing = {
            ok: true,
            provider: "scidoo",
            sample: { roomTypesCount: Array.isArray(rooms) ? rooms.length : 0 },
          }
        } else if (pmsName === "brig") {
          const apiKey: string = integration.api_key || ""
          if (apiKey.startsWith("eyJ") && apiKey.length > 100) {
            blockers.push({
              code: "PMS_BAD_API_KEY",
              message:
                "BRiG api_key sembra essere un JWT invece dell'UUID. Aggiornala in /superadmin/connectors-mapping.",
            })
          } else if (!integration.endpoint_url) {
            blockers.push({
              code: "PMS_NO_ENDPOINT",
              message: "BRiG endpoint_url non configurato per questo hotel",
            })
          } else {
            const structureId: string =
              integration.property_id || (integration.config as any)?.structure_id || ""
            if (!structureId) {
              blockers.push({
                code: "PMS_NO_STRUCTURE_ID",
                message: "BRiG structureId (property_id) non configurato per questo hotel",
              })
            } else {
              const brig = new BrigClient({
                baseUrl: integration.endpoint_url,
                apiKey,
                structureId,
              })
              const raw = await brig.getRoomTypes()
              const arr: any[] = Array.isArray(raw)
                ? raw
                : (raw as any)?.data ?? (raw as any)?.items ?? []
              pmsPing = {
                ok: true,
                provider: "brig",
                sample: { roomTypesCount: arr.length },
              }
              if (arr.length === 0) {
                blockers.push({
                  code: "PMS_EMPTY_RESPONSE",
                  message:
                    "BRiG ha risposto 200 ma senza room types. Verifica lo structureId/sid.",
                })
              }
            }
          }
        } else if (pmsName) {
          // Provider non gestito qui (gsheets, altri PMS futuri): skip.
          pmsPing = { ok: true, provider: pmsName, sample: { skipped: "provider non testabile" } }
        } else {
          blockers.push({ code: "PMS_UNKNOWN", message: "pms_name non valorizzato in pms_integrations" })
        }
      } catch (err: any) {
        const provider = (integration.pms_name || "pms").toLowerCase()

        if (err instanceof BrigError) {
          if (err.status === 401 || err.status === 403) {
            blockers.push({
              code: "PMS_AUTH_FAILED",
              message: `BRiG ha rifiutato le credenziali (${err.status}). Verifica api_key/structureId.`,
            })
          } else {
            blockers.push({
              code: "PMS_HTTP_ERROR",
              message: `BRiG ha risposto ${err.status}: ${err.body.slice(0, 200)}`,
            })
          }
        } else {
          const msg = String(err?.message || err)
          const isAuth = /401|403|not authorized|unauthorized|forbidden/i.test(msg)
          blockers.push({
            code: isAuth ? "PMS_AUTH_FAILED" : "PMS_UNREACHABLE",
            message: isAuth
              ? `${provider}: credenziali rifiutate (${msg.slice(0, 200)})`
              : `${provider} non raggiungibile: ${msg.slice(0, 200)}`,
          })
        }
        pmsPing = {
          ok: false,
          provider,
          error: String(err?.message || err).slice(0, 500),
        }
      }
    }

    const canRun = blockers.length === 0

    return NextResponse.json({
      can_run: canRun,
      blockers,
      binding_status: binding?.status || null,
      integration_mode: integration?.integration_mode || null,
      has_api_key: !!integration?.api_key,
      pms_ping: pmsPing,
    })
  } catch (error: any) {
    console.error("[v0] Error in test-etl API:", error)
    return NextResponse.json({
      can_run: false,
      blockers: [{ code: "API_ERROR", message: error?.message || "Errore interno test-etl" }],
    })
  }
}
