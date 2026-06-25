/**
 * BACKFILL ONE-OFF (CLI) — cifra SOLO i 3 segreti legacy dentro
 * `messaging_channels.credentials` per i canali WhatsApp.
 * ---------------------------------------------------------------------------
 * Wrapper sottile del modulo condiviso `lib/whatsapp/backfill-credentials.ts`,
 * così CLI ed endpoint admin usano la STESSA identica logica.
 *
 * Campi interessati (e SOLO questi), annidati in `credentials`:
 *   access_token, app_secret, verify_token
 *
 * VINCOLI (garantiti dal modulo condiviso):
 *  - DRY-RUN di default; scrittura reale SOLO con
 *    CONFIRM_BACKFILL_WHATSAPP_CREDENTIALS="true".
 *  - Idempotente; NON tocca `config`; NON cifra l'intero JSONB; NON tocca
 *    schema/RLS/altri canali. NON logga MAI token/ciphertext/ENCRYPTION_KEY.
 *  - Round-trip validato prima di ogni scrittura.
 *
 * ESECUZIONE (richiede ENCRYPTION_KEY valida, es. Production).
 * NB: `--conditions=react-server` perché si importa codice con `server-only`.
 *   DRY-RUN:
 *     node --conditions=react-server --import tsx scripts/backfill-whatsapp-credentials.ts
 *   SCRITTURA REALE:
 *     CONFIRM_BACKFILL_WHATSAPP_CREDENTIALS=true node --conditions=react-server --import tsx scripts/backfill-whatsapp-credentials.ts
 */

import { createServiceClient } from "@/lib/supabase/server"
import { runWhatsAppCredentialsBackfill } from "@/lib/whatsapp/backfill-credentials"

const CONFIRM_ENV = "CONFIRM_BACKFILL_WHATSAPP_CREDENTIALS"

async function main(): Promise<void> {
  const confirm = process.env[CONFIRM_ENV] === "true"

  console.log("=== Backfill messaging_channels.credentials (WhatsApp) ===")
  console.log(`[wa-backfill] Modalità: ${confirm ? "SCRITTURA REALE" : "DRY-RUN"}`)

  const result = await runWhatsAppCredentialsBackfill(createServiceClient(), { confirm })

  console.log("[wa-backfill] --- RIEPILOGO ---")
  console.log(JSON.stringify(result, null, 2))

  if (!confirm) {
    console.log(
      `[wa-backfill] DRY-RUN: nessuna scrittura eseguita. Per eseguire davvero: ` +
        `${CONFIRM_ENV}=true node --conditions=react-server --import tsx scripts/backfill-whatsapp-credentials.ts`,
    )
  }
}

main().catch((err) => {
  console.error(`[wa-backfill] ABORT: ${(err as Error).message}`)
  process.exit(1)
})
