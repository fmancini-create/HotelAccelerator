/**
 * POST /api/admin/manubot/resync-password
 *
 * Risincronizza SOLO `properties.manubot_password` (cifrata `enc:v1:`) partendo
 * dal valore di `MANUBOT_DEFAULT_PASSWORD` presente nelle env del server.
 *
 * PERCHÉ ESISTE (e perché NON usare /api/admin/manubot/setup):
 * quando la password ManuBot viene cambiata su ManuBot, l'hub continua a usare
 * quella vecchia perché in `lib/manubot.ts` il DB VINCE sull'env:
 *     const password = decryptedPassword || requireEnv("MANUBOT_DEFAULT_PASSWORD")
 * L'env è solo fallback per quando la colonna è vuota. Serve quindi riscrivere
 * la colonna. La route `setup` lo farebbe, ma è una GET con side effect che
 * RIGENERA `api_token`/`api_token_hash` e restituisce il token in chiaro:
 * usarla per un semplice cambio password invaliderebbe il Bearer Token del
 * webhook ManuBot -> hub, interrompendo l'arrivo dei task. Questa route fa
 * l'unica cosa necessaria e nulla di più.
 *
 * VALIDAZIONE PRIMA DELLA SCRITTURA (hardening):
 * la password viene prima PROVATA contro l'auth di ManuBot (login read-only con
 * l'email della property). Se il login non riesce, il DB NON viene toccato.
 * Senza questo controllo `success: true` significava solo "colonna riscritta",
 * non "credenziale valida": era possibile persistere una password sbagliata,
 * ed è realmente accaduto una volta.
 *
 * GARANZIE (verificabili leggendo il codice qui sotto):
 *  - UPDATE su DUE sole colonne: `manubot_password` e `updated_at`. Nessun'altra
 *    colonna è presente nell'oggetto passato a `.update()`.
 *  - `api_token` / `api_token_hash` NON sono toccati né rigenerati.
 *  - `manubot_email`, `manubot_company_id`, `manubot_supabase_url` invariati.
 *  - L'unica chiamata di rete è il login di verifica all'auth di ManuBot:
 *    nessuna creazione/modifica/cancellazione di task, nessun webhook, nessun
 *    Telegram/WhatsApp, nessuno Stripe, nessun cron.
 *  - Nessuno schema DB modificato (`updated_at` è una colonna già esistente).
 *  - La risposta NON contiene password, token, api_token o valori di env: solo
 *    categorie d'errore generiche.
 *  - Nessun log di plaintext, ciphertext o chiave.
 *
 * È POST (non GET) proprio perché ha un side effect: non può essere innescata
 * da un semplice prefetch o dall'apertura di un URL.
 *
 * QUALE PROPERTY VIENE AGGIORNATA:
 *  - tenant admin: la propria, presa dalla sessione. Se passa un `property_id`
 *    diverso dal proprio riceve 403 (tenant isolation).
 *  - super admin: può indicare `{ "property_id": "..." }` nel body, perché il
 *    tenant attivo dipende dall'impersonificazione UI non ancora disponibile.
 *    Senza body e senza tenant attivo la risposta è `property_required`.
 *  - in entrambi i casi la property deve esistere, altrimenti 404.
 *
 * Idempotente: rieseguirla con la stessa env riscrive lo stesso valore logico
 * (il ciphertext cambia perché `enc:v1` non è deterministico, ma la password
 * decifrata resta la medesima).
 */

import { type NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { getCallerIdentity, accessErrorStatus, isAccessError } from "@/lib/auth/admin-access"
import { encryptManubotPasswordForWrite } from "@/lib/manubot/credential-secrets"
import { ManubotClient } from "@/lib/manubot"
import { validateManubotSupabaseUrlForEnvironment } from "@/lib/manubot/environment-guard"
import { categorizeManubotError, logManubotError } from "@/lib/manubot/route-errors"

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(req: NextRequest) {
  try {
    // Guard: sessione valida + privilegi di amministratore.
    // NB: si usa getCallerIdentity invece di requireTenantAdmin perché
    // quest'ultimo esige un tenant *già selezionato*, e per un super admin il
    // tenant attivo arriva dall'impersonificazione UI, non ancora disponibile.
    // I controlli di ruolo replicati qui sotto sono gli stessi.
    const identity = await getCallerIdentity(req)
    if (!identity) {
      return NextResponse.json({ success: false, error: "unauthorized" }, { status: 401 })
    }
    if (!identity.isSuperAdmin && !identity.isTenantAdmin) {
      return NextResponse.json({ success: false, error: "forbidden" }, { status: 403 })
    }

    // Body opzionale: { "property_id": "..." }. Assente/non-JSON => null.
    let requestedPropertyId: string | null = null
    try {
      const body = await req.json()
      if (body && typeof body.property_id === "string" && body.property_id.trim()) {
        requestedPropertyId = body.property_id.trim()
      }
    } catch {
      // Nessun body: si userà il tenant della sessione.
    }

    if (requestedPropertyId && !UUID_RE.test(requestedPropertyId)) {
      return NextResponse.json({ success: false, error: "invalid_property_id" }, { status: 400 })
    }

    // TENANT ISOLATION: solo un super admin può indicare una property diversa
    // dalla propria. Un tenant admin che prova a passare l'ID di un altro
    // tenant riceve 403, esattamente come prima.
    let propertyId: string
    if (requestedPropertyId) {
      if (!identity.isSuperAdmin && requestedPropertyId !== identity.propertyId) {
        return NextResponse.json({ success: false, error: "forbidden" }, { status: 403 })
      }
      propertyId = requestedPropertyId
    } else {
      if (!identity.propertyId) {
        // Caso tipico del super admin senza impersonificazione attiva:
        // errore esplicito e azionabile, non un "forbidden" fuorviante.
        return NextResponse.json(
          {
            success: false,
            error: "property_required",
            message: "Nessun tenant attivo: indica property_id nel body della richiesta.",
          },
          { status: 400 },
        )
      }
      propertyId = identity.propertyId
    }

    // Letta server-side. Il valore non viene mai loggato né restituito.
    const envPassword = process.env.MANUBOT_DEFAULT_PASSWORD
    if (!envPassword) {
      return NextResponse.json(
        {
          success: false,
          error: "not_configured",
          message:
            "MANUBOT_DEFAULT_PASSWORD non è impostata sul server. Aggiornala nelle variabili d'ambiente del progetto e fai un nuovo deploy, poi riprova.",
        },
        { status: 400 },
      )
    }

    // Cifratura at-rest con l'helper già esistente (richiede ENCRYPTION_KEY).
    // Se la chiave manca o non è valida, encryptSecret lancia: gestito sotto.
    const encrypted = encryptManubotPasswordForWrite(envPassword)
    if (!encrypted) {
      return NextResponse.json({ success: false, error: "not_configured" }, { status: 400 })
    }

    const supabase = createServiceClient()

    // La property deve esistere: evita UPDATE silenziosi a zero righe su un ID
    // inesistente (che risponderebbero success senza aver aggiornato nulla).
    // Si leggono solo `manubot_email` e `manubot_supabase_url`, necessari per il
    // login di verifica. `manubot_password` NON viene letta: la si riscrive.
    const { data: property, error: lookupError } = await supabase
      .from("properties")
      .select("id, manubot_email, manubot_supabase_url")
      .eq("id", propertyId)
      .maybeSingle()

    if (lookupError) {
      console.error("[v0] resync-password: lookup failed:", lookupError.message)
      return NextResponse.json({ success: false, error: "lookup_failed" }, { status: 500 })
    }
    if (!property) {
      return NextResponse.json({ success: false, error: "property_not_found" }, { status: 404 })
    }

    // ------------------------------------------------------------------
    // VALIDAZIONE: la password deve funzionare DAVVERO prima di scriverla.
    // Solo un login (lettura) all'auth di ManuBot: nessun task creato o
    // modificato, nessun webhook, nessuna notifica.
    // Se qualcosa non torna si esce QUI, senza toccare il DB.
    // ------------------------------------------------------------------
    const email = property.manubot_email || process.env.MANUBOT_DEFAULT_EMAIL
    if (!email) {
      return NextResponse.json({ success: false, error: "tenant_not_configured" }, { status: 400 })
    }

    try {
      // Guard prod/dev sulla URL Supabase risolta, prima di qualunque rete.
      const resolvedSupabaseUrl = property.manubot_supabase_url || process.env.MANUBOT_SUPABASE_URL
      validateManubotSupabaseUrlForEnvironment(resolvedSupabaseUrl)

      const client = new ManubotClient(property.manubot_supabase_url || undefined)
      // Il token ottenuto viene scartato: serviva solo a provare la credenziale.
      await client.login(email, envPassword)
    } catch (validationError) {
      const category = categorizeManubotError(validationError)
      logManubotError("resync-password: validation failed (DB non aggiornato)", validationError, category)
      return NextResponse.json(
        {
          success: false,
          error: category,
          updated: false,
          message:
            "La password non è stata accettata da ManuBot: il database NON è stato modificato. Verifica MANUBOT_DEFAULT_PASSWORD e ricorda di fare un nuovo deploy dopo averla cambiata.",
        },
        { status: 400 },
      )
    }

    // UPDATE su DUE SOLE COLONNE: qualsiasi aggiunta qui va considerata una
    // modifica di sicurezza. In particolare NON aggiungere api_token.
    // `updated_at` è aggiornato esplicitamente perché la tabella `properties`
    // NON ha trigger che lo facciano: senza questa riga il timestamp resterebbe
    // fermo anche a resync riuscito, rendendo la rotazione non verificabile.
    const { error: updateError } = await supabase
      .from("properties")
      .update({ manubot_password: encrypted, updated_at: new Date().toISOString() })
      .eq("id", propertyId)

    if (updateError) {
      // Messaggio DB nei log del server, non in risposta al client.
      console.error("[v0] resync-password: update failed:", updateError.message)
      return NextResponse.json({ success: false, error: "update_failed" }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      property_id: propertyId,
      updated: true,
      validated: true,
      password_format: "enc:v1",
      updated_at_refreshed: true,
    })
  } catch (error) {
    if (isAccessError(error)) {
      return NextResponse.json({ success: false, error: "forbidden" }, { status: accessErrorStatus(error) })
    }
    // Può arrivare qui anche per ENCRYPTION_KEY mancante/non valida.
    // Solo il messaggio, mai il valore del segreto.
    console.error("[v0] resync-password error:", error instanceof Error ? error.message : "unknown")
    return NextResponse.json({ success: false, error: "internal_error" }, { status: 500 })
  }
}
