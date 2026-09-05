import { type NextRequest, NextResponse } from "next/server"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"
import { requireAreaApi } from "@/lib/auth/area-access"
import { isAreaDenied, areaDeniedResponse } from "@/lib/auth/area-denied"
import { createServiceClient } from "@/lib/supabase/server"
import { loadTelephonyRow, toThreeCxConfig } from "@/lib/telephony/config"
import { ThreeCxError, type ThreeCxConfig } from "@/lib/telephony/threecx-client"
import { configureQueueHoldMusic, inspectThreeCxAudio } from "@/lib/telephony/threecx-xapi"

const QUEUE_4BID = "820"

async function assert4BidProperty(propertyId: string): Promise<{ name: string; slug: string }> {
  const supabase = createServiceClient()
  const { data, error } = await supabase.from("properties").select("name,slug").eq("id", propertyId).single()
  if (error) throw error
  if (data?.slug !== "4bid") throw new ThreeCxError("La configurazione audio avanzata e' riservata al tenant 4BID.", 403)
  return { name: data.name ?? "4BID", slug: data.slug }
}

async function resolvePbxConfig(propertyId: string): Promise<{
  config: ThreeCxConfig | null
  source: "direct" | "shared" | "none"
}> {
  const directRow = await loadTelephonyRow(propertyId)
  const direct = toThreeCxConfig(directRow)
  if (direct) return { config: direct, source: "direct" }

  // 4BID e Villa I Barronci condividono lo stesso PBX. Se il tenant hub non ha
  // credenziali API proprie, riusiamo SOLO la connessione tecnica del property
  // esplicitamente indicato da shared_pbx_journal_property_id. Non ereditiamo
  // contatti, chiamate o altri dati del tenant proprietario della connessione.
  if (directRow?.shared_pbx_journal_property_id) {
    const sharedRow = await loadTelephonyRow(directRow.shared_pbx_journal_property_id)
    const shared = toThreeCxConfig(sharedRow)
    if (shared) return { config: shared, source: "shared" }
  }

  return { config: null, source: "none" }
}

function basePayload(source: "direct" | "shared" | "none") {
  return {
    queue_number: QUEUE_4BID,
    connection_source: source,
    ringback: {
      target: "2 squilli prima del messaggio AI",
      status: "manual_pbx_step_required",
      download_url: "/api/telephony/3cx/audio/ringback",
      note: "Il file e' pronto in WAV 8 kHz / 16 bit / mono. Va usato in un breve Digital Receptionist prima dell'AI Agent.",
    },
    background_music: {
      target: "musica bassa sotto la conversazione AI",
      status: "programmable_extension_required",
      note: "Il 3CX AI Agent integrato non espone un mixer di background. Per questo punto serve una Programmable Extension / call script con controllo media.",
    },
  }
}

export async function GET(request: NextRequest) {
  try {
    await requireAreaApi("settings", request)
    const propertyId = await getAuthenticatedPropertyId(request)
    await assert4BidProperty(propertyId)
    const resolved = await resolvePbxConfig(propertyId)

    if (!resolved.config) {
      return NextResponse.json({
        ...basePayload(resolved.source),
        xapi: {
          ok: false,
          error:
            "Manca una credenziale 3CX valida. In 3CX crea/aggiorna il Service Principal con Call Control + Configuration API e salvalo in Canali → Telefono IP.",
        },
        transfer_music: { status: "blocked_no_credentials" },
      })
    }

    try {
      const inspection = await inspectThreeCxAudio(resolved.config, QUEUE_4BID)
      return NextResponse.json({
        ...basePayload(resolved.source),
        xapi: {
          ok: true,
          pbx_version: inspection.pbxVersion,
          scope: inspection.accessScope,
          system_moh_access: inspection.systemMusicOnHoldAccessible,
        },
        queue: inspection.queue,
        system_music_on_hold: inspection.systemMusicOnHold,
        transfer_music: {
          status: inspection.transferMusicConfigured ? "configured" : "ready_to_configure",
          configured_file: inspection.queue?.onHoldFile ?? null,
          candidate_file: inspection.transferMusicCandidate,
        },
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : "Errore Configuration API 3CX"
      return NextResponse.json({
        ...basePayload(resolved.source),
        xapi: { ok: false, error: message },
        transfer_music: { status: "blocked_xapi" },
      })
    }
  } catch (error) {
    if (isAreaDenied(error)) return areaDeniedResponse(error)
    const message = error instanceof Error ? error.message : "Errore"
    const status = error instanceof ThreeCxError && error.status ? error.status : 500
    return NextResponse.json({ error: message }, { status })
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAreaApi("settings", request)
    const propertyId = await getAuthenticatedPropertyId(request)
    await assert4BidProperty(propertyId)
    const body = await request.json().catch(() => null)
    const action = typeof body?.action === "string" ? body.action : ""
    if (action !== "configure_transfer_moh") {
      return NextResponse.json({ error: "Azione audio non valida." }, { status: 400 })
    }

    const resolved = await resolvePbxConfig(propertyId)
    if (!resolved.config) {
      return NextResponse.json(
        {
          error:
            "Non posso modificare 3CX: manca una credenziale API valida. Abilita Call Control + Configuration API sul Service Principal e salvala in HotelAccelerator.",
        },
        { status: 409 },
      )
    }

    const inspection = await configureQueueHoldMusic(resolved.config, QUEUE_4BID)
    return NextResponse.json({
      ok: true,
      queue: inspection.queue,
      system_music_on_hold: inspection.systemMusicOnHold,
      xapi_scope: inspection.accessScope,
      transfer_music: {
        status: inspection.transferMusicConfigured ? "configured" : "not_configured",
        configured_file: inspection.queue?.onHoldFile ?? null,
      },
    })
  } catch (error) {
    if (isAreaDenied(error)) return areaDeniedResponse(error)
    const message = error instanceof Error ? error.message : "Errore"
    const status = error instanceof ThreeCxError && error.status ? error.status : 500
    return NextResponse.json({ error: message }, { status })
  }
}
