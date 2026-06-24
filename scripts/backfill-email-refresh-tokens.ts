/**
 * BACKFILL ONE-OFF — cifra SOLO `email_channels.oauth_refresh_token` legacy.
 * ---------------------------------------------------------------------------
 * Thin CLI wrapper attorno a `lib/email/backfill-refresh-tokens.ts` (stessa
 * logica usata anche dall'endpoint admin), così le due strade non divergono.
 *
 * Obiettivo: portare i refresh token ancora in chiaro al formato cifrato
 * `enc:v1:` usando `encryptSecret`, SENZA toccare gli access token (già
 * cifrati), `smtp_password`, lo schema, le RLS o qualunque altro canale/feature.
 *
 * SICUREZZA:
 *  - DRY-RUN di default: nessuna scrittura.
 *  - La scrittura reale richiede CONFIRM_BACKFILL_EMAIL_REFRESH_TOKENS="true".
 *  - Idempotente: i valori già `enc:v1:` sono esclusi dalla selezione.
 *  - Non logga MAI token in chiaro, ciphertext completo o ENCRYPTION_KEY.
 *
 * ESECUZIONE (richiede un ambiente con ENCRYPTION_KEY valida, es. Production).
 * NB: serve `--conditions=react-server` perché il modulo importa `server-only`,
 * che fuori da Next altrimenti lancia.
 *   DRY-RUN:
 *     node --conditions=react-server --import tsx scripts/backfill-email-refresh-tokens.ts
 *   SCRITTURA REALE:
 *     CONFIRM_BACKFILL_EMAIL_REFRESH_TOKENS=true node --conditions=react-server --import tsx scripts/backfill-email-refresh-tokens.ts
 */

import { createServiceClient } from "@/lib/supabase/server"
import { runRefreshTokenBackfill, type SecretCounts } from "@/lib/email/backfill-refresh-tokens"

const CONFIRM_ENV = "CONFIRM_BACKFILL_EMAIL_REFRESH_TOKENS"

function printCounts(label: string, c: SecretCounts): void {
  console.log(`[backfill] Conteggi (${label}) su ${c.rows} righe:`)
  console.log(`  refresh_token : enc=${c.refresh.enc} legacy=${c.refresh.legacy} empty=${c.refresh.empty}`)
  console.log(`  access_token  : enc=${c.access.enc} legacy=${c.access.legacy}`)
  console.log(`  smtp_password : enc=${c.smtp.enc} legacy=${c.smtp.legacy} empty=${c.smtp.empty}`)
}

async function main(): Promise<void> {
  const confirm = process.env[CONFIRM_ENV] === "true"

  console.log("=== Backfill email_channels.oauth_refresh_token ===")
  console.log(`[backfill] Modalità: ${confirm ? "SCRITTURA REALE" : "DRY-RUN"}`)

  const supabase = createServiceClient()
  const result = await runRefreshTokenBackfill(supabase, { confirm })

  console.log(`[backfill] Ambiente: VERCEL_ENV=${result.environment.vercelEnv} NODE_ENV=${result.environment.nodeEnv}`)
  printCounts("PRIMA", result.before)

  for (const w of result.warnings) console.warn(`[backfill] WARNING: ${w}`)

  console.log(`[backfill] Righe candidate (refresh_token legacy da cifrare): ${result.candidateCount}`)
  for (const c of result.candidates) {
    console.log(
      `[backfill] Canale ${c.idMasked} ${c.emailMasked}: refresh_token -> enc:v1: (len ${c.cipherLength}) round-trip ${c.roundTripOk ? "OK" : "KO"}`,
    )
  }

  if (confirm) {
    console.log(`[backfill] Righe aggiornate: ${result.updatedCount}`)
  } else {
    console.log(`[backfill] DRY-RUN: nessuna scrittura eseguita. Righe che verrebbero aggiornate: ${result.wouldUpdateCount}`)
    console.log(
      `[backfill] Per eseguire davvero: ${CONFIRM_ENV}=true node --conditions=react-server --import tsx scripts/backfill-email-refresh-tokens.ts`,
    )
  }

  printCounts(confirm ? "DOPO" : "DOPO (dry-run, invariato)", result.after)
}

main().catch((err) => {
  console.error(`[backfill] ABORT: ${(err as Error).message}`)
  process.exit(1)
})
