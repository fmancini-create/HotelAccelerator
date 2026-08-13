import { type NextRequest, NextResponse } from "next/server"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"
import { requireAreaApi } from "@/lib/auth/area-access"
import { loadTelephonyRow, inboundSecretOf } from "@/lib/telephony/config"

/**
 * Restituisce gli URL da incollare nel template CRM di 3CX.
 *
 * Contengono il segreto in chiaro, quindi stanno in una rotta SEPARATA e non
 * nella GET di configurazione: la lettura normale della pagina non deve
 * trasportare un segreto utilizzabile. Serve una richiesta esplicita, con
 * permesso d'area verificato.
 */
export async function GET(request: NextRequest) {
  try {
    const decision = await requireAreaApi("channels", request)
    if (!decision.allowed) {
      return NextResponse.json({ error: "Accesso non consentito a questa area." }, { status: 403 })
    }
    const propertyId = await getAuthenticatedPropertyId(request)
    const row = await loadTelephonyRow(propertyId)
    const secret = inboundSecretOf(row)

    if (!row || !secret) {
      return NextResponse.json({ error: "Centralino non ancora configurato." }, { status: 404 })
    }

    // Uso l'host della richiesta: su un dominio con redirect verso www, l'URL
    // salvato sull'host sbagliato porterebbe 3CX a seguire un 307 che non
    // gestisce, e le chiamate non arriverebbero mai. Stessa insidia gia' vista
    // con il webhook di Telegram.
    const forwardedHost = request.headers.get("x-forwarded-host") || request.headers.get("host")
    const proto = request.headers.get("x-forwarded-proto") || "https"
    const base = forwardedHost ? `${proto}://${forwardedHost}` : (process.env.NEXT_PUBLIC_APP_URL || "")
    const root = base.replace(/\/+$/, "")
    const query = `property=${encodeURIComponent(propertyId)}&token=${encodeURIComponent(secret)}`

    return NextResponse.json({
      lookup_url: `${root}/api/telephony/3cx/lookup?${query}&number=[Number]`,
      journal_url: `${root}/api/telephony/3cx/journal?${query}`,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Errore"
    const status = message.includes("autenticat") || message.includes("tenant") ? 401 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
