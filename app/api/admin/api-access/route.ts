import { NextResponse, type NextRequest } from "next/server"
import crypto from "node:crypto"

import { requireTenantAdmin, isAccessError, accessErrorStatus } from "@/lib/auth/admin-access"
import { createServiceClient } from "@/lib/supabase/server"
import { hashApiToken } from "@/lib/security/token-hash"

/**
 * Token di accesso API della struttura.
 *
 * Contesto verificato prima di scrivere questa rotta:
 *  - il token vive su `properties` in DUE colonne: `api_token` (in chiaro) e
 *    `api_token_hash` (impronta HMAC). La verifica in ingresso usa l'impronta
 *    come via primaria e il chiaro come ripiego, quindi ogni scrittura deve
 *    aggiornare ENTRAMBE: aggiornarne una sola le lascia discordi;
 *  - lo STESSO token autentica anche il webhook ManuBot in entrata. Rigenerarlo
 *    interrompe quel flusso finche' ManuBot non riceve il valore nuovo, percio'
 *    l'interfaccia deve avvisarlo quando ManuBot risulta configurato.
 */

type PropertyRow = {
  id: string
  api_token: string | null
  api_token_hash: string | null
  manubot_email: string | null
}

/**
 * Indirizzo pubblico da mostrare e copiare.
 *
 * NON derivato da `NEXT_PUBLIC_APP_URL`, per due ragioni entrambe misurate:
 *  1. in produzione quella variabile vale `https://hotelaccelerator.com`, cioe'
 *     l'APEX, e l'apex risponde 307 verso `www` (verificato con curl). Un
 *     redirect puo' far PERDERE l'intestazione `Authorization: Bearer`, quindi
 *     l'integratore riceverebbe 401 seguendo alla lettera le nostre istruzioni.
 *     E' la stessa ragione per cui l'URL del webhook ManuBot e' fissato con `www`;
 *  2. in sviluppo vale `http://localhost:3000`: copiarlo significherebbe
 *     consegnare a un sistema esterno un indirizzo che per lui non esiste.
 */
const CANONICAL_PUBLIC_ORIGIN = "https://www.hotelaccelerator.com"

function publicBase(request: NextRequest): string {
  const url = new URL(request.url)
  const isLocal = url.hostname === "localhost" || url.hostname === "127.0.0.1"
  if (!isLocal) return CANONICAL_PUBLIC_ORIGIN
  // Lo SCHEMA va ricostruito, non ereditato da `url.origin`: quando la pagina e'
  // servita da un proxy in https che inoltra a `localhost:3000`, `url.origin`
  // combina lo schema esterno con l'host interno e produce
  // `https://localhost:3000` — un indirizzo che NON esiste (visto a schermo).
  // In locale il protocollo e' sempre http.
  return `http://${url.host}`
}

/**
 * Il segreto di hashing e' utilizzabile? Non si controlla l'esistenza della
 * variabile ma si PROVA a calcolare un'impronta, perche' `hashApiToken` rifiuta
 * anche i segreti troppo corti: "variabile presente" non implica "funzionante".
 */
function hashSecretUsable(): boolean {
  try {
    hashApiToken("verifica")
    return true
  } catch {
    return false
  }
}

/** Mostra abbastanza per riconoscere il token, non abbastanza per usarlo. */
function maschera(token: string): string {
  if (token.length <= 10) return "•".repeat(token.length)
  return `${token.slice(0, 6)}${"•".repeat(10)}${token.slice(-4)}`
}

async function loadProperty(propertyId: string): Promise<PropertyRow | null> {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from("properties")
    .select("id, api_token, api_token_hash, manubot_email")
    .eq("id", propertyId)
    .maybeSingle()

  if (error) {
    console.error("[v0] api-access: lettura struttura fallita")
    return null
  }
  return (data as PropertyRow) ?? null
}

/**
 * `requireTenantAdmin` LANCIA `AccessError` (401/403), non restituisce un errore:
 * va quindi avvolto in try/catch, altrimenti l'eccezione diventerebbe un 500 e
 * un accesso negato somiglierebbe a un guasto del server.
 */
async function risolviAmministratore(): Promise<{ propertyId: string } | NextResponse> {
  try {
    return await requireTenantAdmin()
  } catch (errore) {
    if (isAccessError(errore)) {
      return NextResponse.json(
        { error: errore instanceof Error ? errore.message : "Accesso negato" },
        { status: accessErrorStatus(errore) },
      )
    }
    throw errore
  }
}

export async function GET(request: NextRequest) {
  const identity = await risolviAmministratore()
  if (identity instanceof NextResponse) return identity

  const property = await loadProperty(identity.propertyId)
  if (!property) {
    return NextResponse.json({ error: "Struttura non trovata" }, { status: 404 })
  }

  const token = property.api_token
  return NextResponse.json({
    hasToken: Boolean(token),
    // Il valore in chiaro NON viaggia qui: serve un'azione esplicita.
    masked: token ? maschera(token) : null,
    tokenLength: token?.length ?? 0,
    hashPresent: Boolean(property.api_token_hash),
    // Il server sa calcolare l'impronta? Se no la rigenerazione e' impossibile e
    // il pulsante va spento CON la ragione: premerlo darebbe altrimenti un
    // errore che non dipende da chi lo preme.
    hashSecretPresent: hashSecretUsable(),
    // Serve a decidere se avvisare prima di rigenerare: senza ManuBot
    // configurato, rigenerare non interrompe alcun flusso in entrata.
    manubotConfigured: Boolean(property.manubot_email),
    endpoint: `${publicBase(request)}/api/external/demand`,
  })
}

export async function POST(request: NextRequest) {
  const identity = await risolviAmministratore()
  if (identity instanceof NextResponse) return identity

  let azione: string | undefined
  try {
    azione = (await request.json())?.action
  } catch {
    return NextResponse.json({ error: "Corpo della richiesta non valido" }, { status: 400 })
  }

  if (azione !== "reveal" && azione !== "rotate") {
    return NextResponse.json(
      { error: "Azione non riconosciuta: usare 'reveal' oppure 'rotate'" },
      { status: 400 },
    )
  }

  const propertyId = identity.propertyId
  const property = await loadProperty(propertyId)
  if (!property) {
    return NextResponse.json({ error: "Struttura non trovata" }, { status: 404 })
  }

  if (azione === "reveal") {
    if (!property.api_token) {
      return NextResponse.json({ error: "Nessun token da mostrare" }, { status: 404 })
    }
    // Sola lettura: non tocca nulla, cosi' mostrare il token non puo' invalidarlo.
    return NextResponse.json({ token: property.api_token, rotated: false })
  }

  // --- rotate ---------------------------------------------------------------
  // Esadecimale: ASCII per costruzione, quindi sempre valido in un'intestazione.
  const nuovo = crypto.randomBytes(32).toString("hex")

  // L'impronta si calcola PRIMA di scrivere. `hashApiToken` lancia se il segreto
  // manca o e' troppo corto: senza questo blocco l'eccezione diventerebbe un 500
  // opaco e, peggio, la scrittura potrebbe partire aggiornando una sola delle due
  // colonne, lasciando token e impronta discordi e il webhook muto.
  let nuovoHash: string
  try {
    nuovoHash = hashApiToken(nuovo)
  } catch {
    console.error("[v0] api-access rotate: impronta non calcolabile (segreto di hashing assente)")
    return NextResponse.json(
      {
        error:
          "Rigenerazione non disponibile: manca il segreto di hashing dei token sul server. " +
          "Il token attuale NON è stato modificato.",
      },
      { status: 503 },
    )
  }

  const supabase = createServiceClient()
  const { data: scritte, error } = await supabase
    .from("properties")
    // Scrittura doppia deliberata: `api_token` perche' la verifica in ingresso lo
    // usa come ripiego, `api_token_hash` perche' e' la via primaria.
    .update({ api_token: nuovo, api_token_hash: nuovoHash, updated_at: new Date().toISOString() })
    .eq("id", propertyId)
    // `.select()` non e' decorativo: senza di esso Supabase riporta `error: null`
    // anche quando il filtro non colpisce NESSUNA riga, e la rotta annuncerebbe
    // una rotazione mai avvenuta consegnando un token che il database non conosce.
    .select("id, api_token, api_token_hash")

  if (error || !scritte || scritte.length !== 1) {
    console.error(`[v0] api-access rotate: scrittura non confermata (righe=${scritte?.length ?? 0})`)
    return NextResponse.json(
      { error: "Rigenerazione non riuscita: il token NON è stato modificato." },
      { status: 500 },
    )
  }

  // Controprova sul valore riletto: se un trigger o una colonna generata avesse
  // alterato cio' che abbiamo scritto, mostreremmo un token diverso da quello
  // effettivamente memorizzato.
  if (scritte[0].api_token !== nuovo || scritte[0].api_token_hash !== nuovoHash) {
    console.error("[v0] api-access rotate: il valore riletto non combacia con quello scritto")
    return NextResponse.json(
      { error: "Rigenerazione incoerente: verifica lo stato del token prima di usarlo." },
      { status: 500 },
    )
  }

  return NextResponse.json({
    token: nuovo,
    rotated: true,
    manubotConfigured: Boolean(property.manubot_email),
  })
}
