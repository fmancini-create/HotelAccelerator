import { createPublicKey, createVerify } from "node:crypto"

/**
 * Verifica dell'origine delle notifiche Google Pub/Sub.
 *
 * La subscription push di produzione usa l'account di servizio indicato sotto
 * e invia un JWT OIDC firmato da Google. Il webhook deve accettare soltanto
 * quel mittente, per l'audience pubblica esatta: conoscere l'indirizzo del
 * webhook o di una casella non deve bastare per avviare una sincronizzazione.
 *
 * Le variabili permettono di sostituire l'identita' in un ambiente separato;
 * i fallback sono la configurazione di produzione verificata il 24/08/2026.
 * Nessuna dipendenza aggiunta: la firma RS256 viene verificata con `node:crypto`
 * contro le chiavi pubbliche di Google.
 */

const JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs"
const EMITTENTI_LECITI = new Set(["accounts.google.com", "https://accounts.google.com"])
const AUDIENCE_ATTESA =
  process.env.GOOGLE_PUBSUB_AUDIENCE ??
  "https://www.hotelaccelerator.com/api/channels/email/webhook/gmail"
const SERVICE_ACCOUNT_ATTESO =
  process.env.GOOGLE_PUBSUB_SERVICE_ACCOUNT ??
  "hotelaccelerator-pubsub@hotelaccelerator.iam.gserviceaccount.com"

export type EsitoVerifica =
  | { stato: "valida"; email: string; aud: string; iss: string }
  | { stato: "assente"; motivo: string }
  | { stato: "non_valida"; motivo: string; aud?: string; iss?: string }

type Jwk = { kid: string; n: string; e: string; kty: string; alg?: string }

let cacheChiavi: { chiavi: Jwk[]; scadenza: number } | null = null

async function chiaviGoogle(): Promise<Jwk[]> {
  if (cacheChiavi && cacheChiavi.scadenza > Date.now()) return cacheChiavi.chiavi

  const risposta = await fetch(JWKS_URL)
  if (!risposta.ok) throw new Error(`JWKS HTTP ${risposta.status}`)
  const corpo = await risposta.json()
  const chiavi: Jwk[] = corpo?.keys ?? []

  // Rispetta il max-age dichiarato da Google, con un minimo prudenziale.
  const cacheControl = risposta.headers.get("cache-control") || ""
  const maxAge = Number(/max-age=(\d+)/.exec(cacheControl)?.[1] ?? 3600)
  cacheChiavi = { chiavi, scadenza: Date.now() + Math.max(maxAge, 600) * 1000 }
  return chiavi
}

function base64UrlToBuffer(input: string): Buffer {
  let b64 = input.replace(/-/g, "+").replace(/_/g, "/")
  const resto = b64.length % 4
  if (resto) b64 += "=".repeat(4 - resto)
  return Buffer.from(b64, "base64")
}

function leggiJson(parte: string): any {
  return JSON.parse(base64UrlToBuffer(parte).toString("utf-8"))
}

/**
 * Restituisce l'esito della verifica. NON lancia MAI: un difetto del
 * verificatore non deve poter fermare la posta.
 */
export async function verificaNotificaPubSub(request: Request): Promise<EsitoVerifica> {
  try {
    const intestazione = request.headers.get("authorization") || ""
    const token = intestazione.replace(/^Bearer\s+/i, "").trim()

    if (!token || !intestazione.toLowerCase().startsWith("bearer ")) {
      return { stato: "assente", motivo: "nessuna intestazione Authorization: Bearer" }
    }

    const parti = token.split(".")
    if (parti.length !== 3) return { stato: "non_valida", motivo: "token non in tre parti" }

    const intestazioneJwt = leggiJson(parti[0])
    const corpo = leggiJson(parti[1])

    if (intestazioneJwt.alg !== "RS256") {
      // Rifiuta esplicitamente `alg: none` e simili.
      return { stato: "non_valida", motivo: `algoritmo non ammesso: ${intestazioneJwt.alg}` }
    }

    const chiavi = await chiaviGoogle()
    const chiave = chiavi.find((k) => k.kid === intestazioneJwt.kid)
    if (!chiave) return { stato: "non_valida", motivo: "kid sconosciuto fra le chiavi Google" }

    const pubblica = createPublicKey({ key: chiave as any, format: "jwk" })
    const verificatore = createVerify("RSA-SHA256")
    verificatore.update(`${parti[0]}.${parti[1]}`)
    verificatore.end()

    if (!verificatore.verify(pubblica, base64UrlToBuffer(parti[2]))) {
      return { stato: "non_valida", motivo: "firma non valida", aud: corpo.aud, iss: corpo.iss }
    }

    const adesso = Math.floor(Date.now() / 1000)
    if (typeof corpo.exp !== "number" || corpo.exp <= adesso) {
      return { stato: "non_valida", motivo: "token scaduto", aud: corpo.aud, iss: corpo.iss }
    }
    if (!EMITTENTI_LECITI.has(String(corpo.iss))) {
      return { stato: "non_valida", motivo: `emittente inatteso: ${corpo.iss}`, aud: corpo.aud, iss: corpo.iss }
    }
    if (corpo.aud !== AUDIENCE_ATTESA) {
      return { stato: "non_valida", motivo: "audience diversa da quella attesa", aud: corpo.aud, iss: corpo.iss }
    }
    if (corpo.email !== SERVICE_ACCOUNT_ATTESO || corpo.email_verified !== true) {
      return { stato: "non_valida", motivo: "account di servizio inatteso", aud: corpo.aud, iss: corpo.iss }
    }

    return { stato: "valida", email: corpo.email, aud: corpo.aud, iss: corpo.iss }
  } catch (errore) {
    return {
      stato: "non_valida",
      motivo: `verifica fallita: ${errore instanceof Error ? errore.message : String(errore)}`,
    }
  }
}
