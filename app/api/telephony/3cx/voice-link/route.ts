import { randomBytes } from "crypto"
import { type NextRequest, NextResponse } from "next/server"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"
import { requireAreaApi } from "@/lib/auth/area-access"
import { isAreaDenied, areaDeniedResponse } from "@/lib/auth/area-denied"
import { createServiceClient } from "@/lib/supabase/server"
import { encryptForWrite, loadTelephonyRow, voiceInboundSecretOf } from "@/lib/telephony/config"

const NO_STORE = { "Cache-Control": "no-store, max-age=0" }

/**
 * Predispone la credenziale che gli script degli agenti vocali 3CX presentano
 * nell'header `X-HotelAccelerator-Key`.
 *
 * La chiave non e' il segreto CRM e non viene mai restituita dalla GET della
 * configurazione. POST la mostra solo alla prima creazione; PUT la ruota in
 * modo esplicito, così una normale visita alla pagina non può invalidare il
 * centralino gia' configurato.
 */
async function issueVoiceCredential(request: NextRequest, mode: "create" | "rotate") {
  await requireAreaApi("settings", request)
  const propertyId = await getAuthenticatedPropertyId(request)
  const existing = await loadTelephonyRow(propertyId)

  if (mode === "create" && voiceInboundSecretOf(existing)) {
    return NextResponse.json(
      { ok: true, created: false, configured: true },
      { headers: NO_STORE },
    )
  }

  const secret = randomBytes(32).toString("base64url")
  const supabase = createServiceClient()
  const now = new Date().toISOString()

  if (existing) {
    const { error } = await supabase
      .from("telephony_integrations")
      .update({ voice_inbound_secret_encrypted: encryptForWrite(secret), updated_at: now })
      .eq("id", existing.id)
    if (error) throw error
  } else {
    const { error } = await supabase.from("telephony_integrations").insert({
      property_id: propertyId,
      provider: "3cx",
      voice_inbound_secret_encrypted: encryptForWrite(secret),
      // Chi richiede esplicitamente gli agenti vocali sta attivando il canale.
      // Una configurazione 3CX incompleta resta comunque rilevabile dalle
      // verifiche della pagina e gli endpoint non accettano mai una chiave CRM.
      is_active: true,
      updated_at: now,
    })
    if (error) throw error
  }

  return NextResponse.json(
    { ok: true, created: mode === "create", rotated: mode === "rotate", api_key: secret },
    { headers: NO_STORE },
  )
}

export async function POST(request: NextRequest) {
  try {
    return await issueVoiceCredential(request, "create")
  } catch (error) {
    if (isAreaDenied(error)) return areaDeniedResponse(error)
    console.error("[3cx-voice-link] credential creation failed", {
      error: error instanceof Error ? error.message : "unknown",
    })
    const message = error instanceof Error ? error.message : "Errore"
    const status = message.includes("autenticat") || message.includes("tenant") ? 401 : 500
    return NextResponse.json(
      { error: status === 500 ? "Impossibile predisporre la credenziale vocale." : message },
      { status, headers: NO_STORE },
    )
  }
}

export async function PUT(request: NextRequest) {
  try {
    return await issueVoiceCredential(request, "rotate")
  } catch (error) {
    if (isAreaDenied(error)) return areaDeniedResponse(error)
    console.error("[3cx-voice-link] credential rotation failed", {
      error: error instanceof Error ? error.message : "unknown",
    })
    const message = error instanceof Error ? error.message : "Errore"
    const status = message.includes("autenticat") || message.includes("tenant") ? 401 : 500
    return NextResponse.json(
      { error: status === 500 ? "Impossibile ruotare la credenziale vocale." : message },
      { status, headers: NO_STORE },
    )
  }
}
