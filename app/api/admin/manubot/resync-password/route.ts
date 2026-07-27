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
 * GARANZIE (verificabili leggendo il codice qui sotto):
 *  - UPDATE su UNA SOLA colonna: `manubot_password`. Nessun'altra colonna è
 *    presente nell'oggetto passato a `.update()`.
 *  - `api_token` / `api_token_hash` NON sono toccati né rigenerati.
 *  - `manubot_email`, `manubot_company_id`, `manubot_supabase_url` invariati.
 *  - Nessuna chiamata di rete: nessun login a ManuBot, nessun Telegram/
 *    WhatsApp, nessuno Stripe, nessun cron.
 *  - Nessuno schema DB modificato.
 *  - La risposta NON contiene password, token, api_token o valori di env.
 *  - Nessun log di plaintext, ciphertext o chiave.
 *
 * È POST (non GET) proprio perché ha un side effect: non può essere innescata
 * da un semplice prefetch o dall'apertura di un URL.
 *
 * Idempotente: rieseguirla con la stessa env riscrive lo stesso valore logico
 * (il ciphertext cambia perché `enc:v1` non è deterministico, ma la password
 * decifrata resta la medesima).
 */

import { type NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { requireTenantAdmin, accessErrorStatus, isAccessError } from "@/lib/auth/admin-access"
import { encryptManubotPasswordForWrite } from "@/lib/manubot/credential-secrets"

export async function POST(req: NextRequest) {
  try {
    // Stesso guard delle altre route admin ManuBot: richiede una sessione con
    // privilegi di tenant admin o super admin e un tenant selezionato.
    // Lancia AccessError (401/403/400) se non autorizzato.
    const { propertyId } = await requireTenantAdmin(req)

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

    // La property è quella del tenant della sessione: nessun ID hardcoded e
    // nessun modo di scrivere sul tenant di qualcun altro.
    // UPDATE su UNA SOLA COLONNA: qualsiasi aggiunta qui va considerata una
    // modifica di sicurezza. In particolare NON aggiungere api_token.
    const { error: updateError } = await supabase
      .from("properties")
      .update({ manubot_password: encrypted })
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
      password_format: "enc:v1",
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
