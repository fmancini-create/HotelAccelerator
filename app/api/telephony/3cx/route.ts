import { type NextRequest, NextResponse } from "next/server"
import { randomBytes } from "crypto"
import { createServiceClient } from "@/lib/supabase/server"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"
import { requireAreaApi } from "@/lib/auth/area-access"
import { isAreaDenied, areaDeniedResponse } from "@/lib/auth/area-denied"
import { loadTelephonyRow, maskSecret, encryptForWrite, type TelephonyRow } from "@/lib/telephony/config"
import { normalizeBaseUrl, testConnection } from "@/lib/telephony/threecx-client"
import { decryptSecretIfNeeded } from "@/lib/crypto/secrets"

/**
 * Configurazione del centralino 3CX, per struttura.
 *
 * Il Client Secret NON viene mai restituito in chiaro: la GET manda un'anteprima
 * mascherata e un booleano, come per il bot token di Telegram.
 */

function serialize(row: TelephonyRow | null) {
  if (!row) return null
  return {
    id: row.id,
    provider: row.provider,
    base_url: row.base_url ?? "",
    client_id: row.client_id ?? "",
    default_extension: row.default_extension ?? "",
    credentials_preview: {
      client_secret: maskSecret(decryptSecretIfNeeded(row.client_secret_encrypted)),
    },
    has_credentials: {
      client_secret: Boolean(row.client_secret_encrypted),
      inbound_secret: Boolean(row.inbound_secret_encrypted),
    },
    is_active: row.is_active,
    last_check_at: row.last_check_at,
    last_check_status: row.last_check_status,
    last_check_error: row.last_check_error,
    updated_at: row.updated_at,
  }
}

export async function GET(request: NextRequest) {
  try {
    // Area "settings": l'elenco delle aree valide (lib/platform/areas.ts) NON
    // contiene "channels" — con una chiave inesistente la guardia negherebbe
    // sempre, rendendo la pagina inutilizzabile. Configurare il centralino e'
    // un'impostazione di struttura, quindi "settings" e' la chiave giusta.
    await requireAreaApi("settings", request)
    const propertyId = await getAuthenticatedPropertyId(request)
    const row = await loadTelephonyRow(propertyId)
    return NextResponse.json({ integration: serialize(row) })
  } catch (error) {
    // In modalita' "enforce" la guardia LANCIA: senza questo, un diniego di
    // permesso diventerebbe un 500 "server rotto" invece di un 403.
    if (isAreaDenied(error)) return areaDeniedResponse(error)
    const message = error instanceof Error ? error.message : "Errore"
    const status = message.includes("autenticat") || message.includes("tenant") ? 401 : 500
    return NextResponse.json({ error: message }, { status })
  }
}

/**
 * POST: salva la connessione e la VERIFICA subito.
 *
 * Salvare senza provare lascerebbe l'amministratore convinto di aver finito,
 * con l'errore che compare solo al primo clic su "Chiama" — magari davanti al
 * cliente. Se la verifica non passa, la riga viene comunque salvata (per non
 * fargli riscrivere tutto) ma la risposta dichiara il fallimento e l'esito
 * resta registrato in `last_check_*`.
 */
export async function POST(request: NextRequest) {
  try {
    await requireAreaApi("settings", request)
    const propertyId = await getAuthenticatedPropertyId(request)
    const body = await request.json().catch(() => null)
    const baseUrlRaw = typeof body?.base_url === "string" ? body.base_url : ""
    const clientIdRaw = typeof body?.client_id === "string" ? body.client_id : ""
    const clientSecretRaw = typeof body?.client_secret === "string" ? body.client_secret : ""
    const extensionRaw = typeof body?.default_extension === "string" ? body.default_extension : ""

    const baseUrl = normalizeBaseUrl(baseUrlRaw)
    const clientId = clientIdRaw.trim()
    const defaultExtension = extensionRaw.trim()

    if (!baseUrl || !clientId) {
      return NextResponse.json({ error: "Indirizzo del centralino e Client ID sono obbligatori." }, { status: 400 })
    }
    // Un indirizzo senza https non e' un dettaglio: le credenziali viaggerebbero
    // in chiaro verso il centralino.
    if (!/^https:\/\//i.test(baseUrl)) {
      return NextResponse.json(
        { error: "L'indirizzo deve iniziare con https:// (le credenziali non vanno inviate su una connessione non cifrata)." },
        { status: 400 },
      )
    }

    const existing = await loadTelephonyRow(propertyId)

    // Segreto lasciato in bianco = "non cambiarlo": e' l'unico modo per
    // modificare l'interno senza dover reincollare il secret ogni volta.
    const newSecret = clientSecretRaw.trim() !== "" ? clientSecretRaw.trim() : null
    const effectiveSecret = newSecret ?? decryptSecretIfNeeded(existing?.client_secret_encrypted ?? null)
    if (!effectiveSecret) {
      return NextResponse.json({ error: "Client Secret obbligatorio." }, { status: 400 })
    }

    // Il segreto in ingresso serve a 3CX per autenticarsi verso di noi: lo
    // genero io, non lo chiedo all'utente, cosi' non puo' essere debole.
    const inboundSecret = existing?.inbound_secret_encrypted
      ? decryptSecretIfNeeded(existing.inbound_secret_encrypted)
      : randomBytes(24).toString("base64url")

    const check = await testConnection({ baseUrl, clientId, clientSecret: effectiveSecret })

    const supabase = createServiceClient()
    const payload = {
      property_id: propertyId,
      provider: "3cx",
      base_url: baseUrl,
      client_id: clientId,
      client_secret_encrypted: encryptForWrite(effectiveSecret),
      default_extension: defaultExtension || null,
      inbound_secret_encrypted: encryptForWrite(inboundSecret),
      is_active: true,
      last_check_at: new Date().toISOString(),
      last_check_status: check.ok ? "ok" : "error",
      last_check_error: check.ok ? null : check.error,
      updated_at: new Date().toISOString(),
    }

    const { error } = await supabase
      .from("telephony_integrations")
      .upsert(payload, { onConflict: "property_id,provider" })
    if (error) throw error

    const row = await loadTelephonyRow(propertyId)

    if (!check.ok) {
      return NextResponse.json(
        {
          integration: serialize(row),
          verified: false,
          error: check.error,
        },
        // 200: il salvataggio e' RIUSCITO, la verifica no. Un 4xx qui farebbe
        // credere all'interfaccia che non sia stato salvato niente.
        { status: 200 },
      )
    }

    return NextResponse.json({
      integration: serialize(row),
      verified: true,
      extensions: check.extensions,
    })
  } catch (error) {
    if (isAreaDenied(error)) return areaDeniedResponse(error)
    const message = error instanceof Error ? error.message : "Errore"
    const status = message.includes("autenticat") || message.includes("tenant") ? 401 : 500
    return NextResponse.json({ error: message }, { status })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await requireAreaApi("settings", request)
    const propertyId = await getAuthenticatedPropertyId(request)
    const supabase = createServiceClient()
    const { error } = await supabase
      .from("telephony_integrations")
      .delete()
      .eq("property_id", propertyId)
      .eq("provider", "3cx")
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (error) {
    if (isAreaDenied(error)) return areaDeniedResponse(error)
    const message = error instanceof Error ? error.message : "Errore"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
