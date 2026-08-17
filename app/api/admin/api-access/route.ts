/**
 * Gestione del token di accesso API della struttura.
 *
 * A COSA SERVE
 * `properties.api_token` autentica DUE flussi opposti, e questo è il fatto che
 * governa tutta la pagina:
 *   1. IN ENTRATA  — il webhook ManuBot -> hub (`/api/external/manubot`) accetta
 *      `Authorization: Bearer <api_token>`;
 *   2. IN USCITA   — Santaddeo (o qualunque altro consumatore) legge la domanda
 *      da `/api/external/demand` con lo stesso Bearer.
 * Conseguenza misurata sul dato reale (Villa I Barronci ha `manubot_email`
 * valorizzato): RIGENERARE il token INTERROMPE l'arrivo dei task da ManuBot
 * finché il nuovo valore non viene riconfigurato là. Per questo la rotazione è
 * un'azione separata, esplicita e avvisata, mentre il caso d'uso normale
 * ("devo dare il token a Santaddeo") è `reveal`, che non cambia nulla.
 *
 * PERCHÉ `reveal` PUÒ MOSTRARE IL TOKEN IN CHIARO
 * perché in chiaro è già: `api_token` è salvato non cifrato in colonna (il
 * webhook lo usa ancora in `.eq("api_token", ...)` come ripiego), e
 * `api_token_hash` è l'impronta affiancata. Nascondere il valore a un
 * amministratore che può comunque leggerlo sarebbe teatro, non sicurezza: la
 * scelta onesta è mostrarlo su richiesta esplicita e non stamparlo MAI nei log.
 *
 * COSA QUESTA ROTTA NON FA
 *  - non inventa una data di rotazione: nel DB NON esiste una colonna per essa
 *    (`updated_at` cambia per qualunque modifica, quindi mostrarla come "ultima
 *    rotazione" sarebbe una bugia);
 *  - non tocca `manubot_email`, `manubot_password`, webhook o altre colonne;
 *  - non restituisce mai `api_token_hash` (non serve a nessun integratore).
 *
 * È POST anche per `reveal` proprio perché non deve poter essere innescata da un
 * prefetch o dall'apertura di un URL.
 *
 * AMBITO: `requireTenantAdmin` risolve la struttura come le altre rotte admin
 * (cookie del selettore per il super_admin, `admin_users.property_id` per il
 * tenant_admin) e nega a chi non è amministratore. L'area "settings" è baseline,
 * cioè concessa a tutti: il presidio vero è QUESTO, non l'area.
 */

import crypto from "node:crypto"
import { type NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { requireTenantAdmin, accessErrorStatus } from "@/lib/auth/admin-access"
import { hashApiToken } from "@/lib/security/token-hash"

/** Anteprima non sufficiente a ricostruire il token: primi 6 e ultimi 4. */
function maskToken(token: string): string {
  if (token.length <= 12) return "•".repeat(token.length)
  return `${token.slice(0, 6)}${"•".repeat(10)}${token.slice(-4)}`
}

/**
 * Indirizzo pubblico da mostrare e copiare.
 *
 * NON è derivato da `NEXT_PUBLIC_APP_URL`, per due ragioni entrambe misurate:
 *  1. in produzione quella variabile vale `https://hotelaccelerator.com`, cioè
 *     l'APEX, e l'apex risponde `307` verso `www` (verificato). Un redirect può
 *     far PERDERE l'header `Authorization: Bearer`, quindi l'integratore
 *     riceverebbe 401 seguendo alla lettera le istruzioni che gli diamo. È lo
 *     stesso motivo per cui `MANUBOT_WEBHOOK_PUBLIC_URL` è fissata con `www`;
 *  2. in sviluppo e in preview vale `http://localhost:3000`: copiare quello
 *     significa consegnare a Santaddeo un indirizzo che non esiste per lui.
 * Fuori da localhost si usa quindi l'host canonico con `www`, e in sviluppo
 * l'origine reale della richiesta, così la pagina resta provabile in locale.
 */
const CANONICAL_PUBLIC_ORIGIN = "https://www.hotelaccelerator.com"

function publicBase(request: NextRequest): string {
  const origin = new URL(request.url).origin
  const host = new URL(request.url).hostname
  const isLocal = host === "localhost" || host === "127.0.0.1"
  return isLocal ? origin : CANONICAL_PUBLIC_ORIGIN
}

type PropertyRow = {
  id: string
  name: string | null
  api_token: string | null
  api_token_hash: string | null
  manubot_email: string | null
}

async function loadProperty(propertyId: string): Promise<PropertyRow | null> {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from("properties")
    .select("id, name, api_token, api_token_hash, manubot_email")
    .eq("id", propertyId)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return (data as PropertyRow | null) ?? null
}

export async function GET(request: NextRequest) {
  try {
    const { propertyId } = await requireTenantAdmin(request)
    const property = await loadProperty(propertyId)
    if (!property) {
      return NextResponse.json({ error: "Struttura non trovata" }, { status: 404 })
    }

    const token = property.api_token ?? ""
    return NextResponse.json({
      property: { id: property.id, name: property.name },
      hasToken: token.length > 0,
      masked: token ? maskToken(token) : null,
      tokenLength: token.length || null,
      hashPresent: Boolean(property.api_token_hash),
      // Serve a decidere se mostrare l'avviso sulla rotazione: senza ManuBot
      // configurato, rigenerare non interrompe alcun flusso in entrata.
      manubotConfigured: Boolean(property.manubot_email),
      endpoint: `${publicBase(request)}/api/external/demand`,
    })
  } catch (error) {
    const status = accessErrorStatus(error)
    if (status !== 500) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Accesso negato" }, { status })
    }
    console.error("[v0] api-access GET: errore interno")
    return NextResponse.json({ error: "Errore interno" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { propertyId, email } = await requireTenantAdmin(request)

    let action = ""
    try {
      const body = (await request.json()) as { action?: unknown }
      action = typeof body.action === "string" ? body.action : ""
    } catch {
      return NextResponse.json({ error: "Corpo della richiesta non valido" }, { status: 400 })
    }

    if (action !== "reveal" && action !== "rotate") {
      return NextResponse.json({ error: 'Azione non valida: attese "reveal" o "rotate"' }, { status: 400 })
    }

    const property = await loadProperty(propertyId)
    if (!property) {
      return NextResponse.json({ error: "Struttura non trovata" }, { status: 404 })
    }

    if (action === "reveal") {
      if (!property.api_token) {
        return NextResponse.json(
          { error: "Nessun token presente per questa struttura: usa Rigenera per crearne uno." },
          { status: 409 },
        )
      }
      // Tracciabilità senza segreti: chi e quando, non il valore.
      console.log(`[v0] api-access reveal property=${propertyId} by=${email ?? "?"}`)
      return NextResponse.json({ token: property.api_token, rotated: false })
    }

    // --- rotate -------------------------------------------------------------
    // Esadecimale come in `manubot/setup`: ASCII per costruzione, quindi sempre
    // valido dentro un'intestazione HTTP.
    const nuovo = crypto.randomBytes(32).toString("hex")

    // L'impronta si calcola PRIMA di scrivere. `hashApiToken` lancia se
    // `API_TOKEN_HASH_SECRET` non è impostata (è accaduto in sviluppo, dove la
    // variabile non c'è pur essendo presente in produzione): senza questo
    // blocco l'eccezione diventava un 500 opaco, e soprattutto la scrittura
    // sarebbe potuta partire con una sola delle due colonne aggiornata,
    // lasciando token e impronta discordi e il webhook muto.
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
    const { error } = await supabase
      .from("properties")
      // Scrittura doppia deliberata: `api_token` in chiaro perché il webhook lo
      // usa ancora come ripiego, `api_token_hash` perché è la via primaria.
      // Scriverne una sola lascerebbe i due valori discordi e il webhook muto.
      .update({ api_token: nuovo, api_token_hash: nuovoHash, updated_at: new Date().toISOString() })
      .eq("id", propertyId)

    if (error) {
      console.error("[v0] api-access rotate: scrittura fallita")
      return NextResponse.json({ error: "Rigenerazione non riuscita" }, { status: 500 })
    }

    console.log(`[v0] api-access rotate property=${propertyId} by=${email ?? "?"}`)
    return NextResponse.json({
      token: nuovo,
      rotated: true,
      manubotConfigured: Boolean(property.manubot_email),
    })
  } catch (error) {
    const status = accessErrorStatus(error)
    if (status !== 500) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Accesso negato" }, { status })
    }
    console.error("[v0] api-access POST: errore interno")
    return NextResponse.json({ error: "Errore interno" }, { status: 500 })
  }
}
