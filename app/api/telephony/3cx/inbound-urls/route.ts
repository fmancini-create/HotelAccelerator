import { type NextRequest, NextResponse } from "next/server"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"
import { requireAreaApi } from "@/lib/auth/area-access"
import { isAreaDenied, areaDeniedResponse } from "@/lib/auth/area-denied"
import { getKnowledgeBases } from "@/lib/ai/knowledge-bases"
import { loadTelephonyRow, inboundSecretOf } from "@/lib/telephony/config"
import { resolveVoiceKnowledgeBase, VOICE_PRODUCTS } from "@/lib/telephony/voice-products"

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
    await requireAreaApi("settings", request)
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
    const voiceQuery = `property=${encodeURIComponent(propertyId)}`
    const knowledgeBases = await getKnowledgeBases(propertyId)
    const voiceAgents = VOICE_PRODUCTS.map((product) => {
      const resolution = resolveVoiceKnowledgeBase(product, knowledgeBases)
      const knowledgeBase = resolution.ok
        ? {
            id: resolution.base.id,
            name: resolution.base.name,
            source_count: resolution.base.source_count,
            matched_by: resolution.matchedBy,
          }
        : null
      const status = !resolution.ok
        ? resolution.reason
        : resolution.base.source_count < 1
          ? "empty"
          : "ready"

      return {
        key: product.key,
        dtmf: product.dtmf,
        label: product.label,
        suggested_extension: product.suggestedExtension,
        fallback_extension: "200",
        status,
        knowledge_base: knowledgeBase,
        query_url: `${root}/api/telephony/3cx/voice/v1/query?${voiceQuery}&product=${encodeURIComponent(product.key)}`,
      }
    })

    return NextResponse.json({
      lookup_url: `${root}/api/telephony/3cx/lookup?${query}&number=[Number]`,
      journal_url: `${root}/api/telephony/3cx/journal?${query}`,
      voice_agents: voiceAgents,
    })
  } catch (error) {
    if (isAreaDenied(error)) return areaDeniedResponse(error)
    const message = error instanceof Error ? error.message : "Errore"
    const status = message.includes("autenticat") || message.includes("tenant") ? 401 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
