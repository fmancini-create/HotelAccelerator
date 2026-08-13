import { type NextRequest, NextResponse } from "next/server"
import { randomBytes } from "crypto"
import { createServiceClient } from "@/lib/supabase/server"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"
import { requireAreaApi } from "@/lib/auth/area-access"
import { isAreaDenied, areaDeniedResponse } from "@/lib/auth/area-denied"
import { loadTelephonyRow, inboundSecretOf, encryptForWrite } from "@/lib/telephony/config"

/**
 * Predispone il collegamento CRM generando la chiave che 3CX usera' per
 * chiamarci, SENZA richiedere l'applicazione API del centralino.
 *
 * PERCHE' SERVE UNA ROTTA A PARTE: la configurazione (`POST /3cx`) pretende
 * indirizzo, Client ID e Client Secret, e scrive la chiave solo se l'accesso al
 * centralino riesce. La scheda con il template era inoltre mostrata solo con
 * `last_check_status === "ok"`. Risultato: la strada che NON richiede
 * l'applicazione API era raggiungibile solo da chi l'applicazione API ce l'ha
 * gia'. Una porta chiusa a chiave davanti all'unica strada percorribile per chi
 * non e' Proprietario del sistema.
 *
 * E' un POST, non un GET: scrive: non deve poter partire da un precaricamento.
 */
export async function POST(request: NextRequest) {
  try {
    await requireAreaApi("settings", request)
    const propertyId = await getAuthenticatedPropertyId(request)
    const supabase = createServiceClient()

    const existing = await loadTelephonyRow(propertyId)

    // Chiave gia' presente: la riuso. Rigenerarla invaliderebbe un template
    // gia' caricato in 3CX, e il riconoscimento del chiamante smetterebbe di
    // funzionare senza che nessuno abbia toccato il centralino.
    const already = existing ? inboundSecretOf(existing) : null
    if (already) {
      // La chiave viene restituita anche quando esisteva già: va incollata nel
      // campo "Chiave di collegamento" della console 3CX, quindi deve essere
      // recuperabile. Senza questo, chi ricarica la pagina dopo aver
      // predisposto il collegamento non potrebbe più completare la
      // configurazione e resterebbe bloccato.
      return NextResponse.json({ ok: true, created: false, api_key: already })
    }

    const secret = randomBytes(24).toString("base64url")

    if (existing) {
      const { error } = await supabase
        .from("telephony_integrations")
        .update({ inbound_secret_encrypted: encryptForWrite(secret), updated_at: new Date().toISOString() })
        .eq("id", existing.id)
      if (error) return NextResponse.json({ error: "Errore interno" }, { status: 500 })
    } else {
      const { error } = await supabase.from("telephony_integrations").insert({
        property_id: propertyId,
        provider: "3cx",
        inbound_secret_encrypted: encryptForWrite(secret),
        // Attivo: e' l'operatore che sta chiedendo esplicitamente di collegare
        // il CRM. Con `is_active` a falso gli endpoint risponderebbero 403 e il
        // template caricato in 3CX non troverebbe mai un contatto.
        is_active: true,
      })
      if (error) return NextResponse.json({ error: "Errore interno" }, { status: 500 })
    }

    return NextResponse.json({ ok: true, created: true, api_key: secret })
  } catch (error) {
    if (isAreaDenied(error)) return areaDeniedResponse(error)
    const message = error instanceof Error ? error.message : "Errore"
    const status = message.includes("autenticat") || message.includes("tenant") ? 401 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
