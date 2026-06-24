/**
 * BACKFILL ONE-OFF — cifra SOLO `email_channels.oauth_refresh_token` legacy.
 * ---------------------------------------------------------------------------
 * Obiettivo: portare i refresh token ancora in chiaro al formato cifrato
 * `enc:v1:` usando `encryptSecret`, SENZA toccare gli access token (già
 * cifrati), `smtp_password`, lo schema, le RLS o qualunque altro canale/feature.
 *
 * SICUREZZA:
 *  - DRY-RUN di default: nessuna scrittura.
 *  - La scrittura reale richiede la variabile di conferma esplicita
 *    CONFIRM_BACKFILL_EMAIL_REFRESH_TOKENS="true".
 *  - Idempotente: i valori già `enc:v1:` vengono esclusi dalla selezione, quindi
 *    una seconda esecuzione trova 0 righe.
 *  - Non logga MAI: token in chiaro, ciphertext completo, ENCRYPTION_KEY.
 *    Logga solo conteggi, ID parziale ed email mascherata.
 *  - Aggiorna SOLO la colonna `oauth_refresh_token`.
 *
 * ESECUZIONE (richiede un ambiente con ENCRYPTION_KEY valida, es. Production).
 * NB: serve `--conditions=react-server` perché `lib/crypto/secrets.ts` importa
 * `server-only`, che fuori da Next altrimenti lancia.
 *   DRY-RUN:
 *     node --conditions=react-server --import tsx scripts/backfill-email-refresh-tokens.ts
 *   SCRITTURA REALE:
 *     CONFIRM_BACKFILL_EMAIL_REFRESH_TOKENS=true node --conditions=react-server --import tsx scripts/backfill-email-refresh-tokens.ts
 */

import { createServiceClient } from "@/lib/supabase/server"
import { encryptSecret, isEncryptedSecret, decryptSecretIfNeeded } from "@/lib/crypto/secrets"

const CONFIRM_ENV = "CONFIRM_BACKFILL_EMAIL_REFRESH_TOKENS"
const TABLE = "email_channels"
/** Numero massimo di righe candidate atteso: oltre questo, warning (no abort automatico). */
const EXPECTED_MAX_CANDIDATES = 2

type ChannelRow = {
  id: string
  email_address: string | null
  oauth_refresh_token: string | null
  oauth_access_token: string | null
  smtp_password: string | null
}

/** ID parziale per log sicuri (no ID completo non necessario). */
function maskId(id: string): string {
  return id.length <= 8 ? id : `${id.slice(0, 8)}…`
}

/** Email mascherata: prima lettera + ***@dominio. */
function maskEmail(email: string | null): string {
  if (!email) return "(nessuna)"
  const [local, domain] = email.split("@")
  const head = local ? local.slice(0, 1) : "?"
  return `${head}***@${domain ?? "?"}`
}

function abort(message: string): never {
  console.error(`[backfill] ABORT: ${message}`)
  process.exit(1)
}

/**
 * Verifica che ENCRYPTION_KEY sia presente e valida SENZA stamparla:
 * usa una cifratura "probe" su un valore fittizio (non un segreto reale).
 * Se la chiave manca o non è valida, `encryptSecret` lancia -> abort.
 */
function assertEncryptionKey(): void {
  try {
    const probe = encryptSecret("__backfill_probe__")
    if (!probe || !isEncryptedSecret(probe)) {
      abort("ENCRYPTION_KEY non utilizzabile: la cifratura di prova non ha prodotto un valore enc:v1:.")
    }
    // Round-trip della prova per certificare anche la decifratura.
    if (decryptSecretIfNeeded(probe) !== "__backfill_probe__") {
      abort("ENCRYPTION_KEY non utilizzabile: round-trip della cifratura di prova fallito.")
    }
  } catch (err) {
    abort(`ENCRYPTION_KEY mancante o non valida (${(err as Error).message}).`)
  }
}

function assertServiceRole(): void {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url) abort("URL Supabase non impostato (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_URL).")
  if (!serviceKey) abort("SUPABASE_SERVICE_ROLE_KEY non impostato: il backfill richiede il service role.")
}

/** Conteggi read-only sullo stato dei segreti (nessun valore mostrato). */
async function printSecretCounts(supabase: ReturnType<typeof createServiceClient>, label: string): Promise<void> {
  const { data, error } = await supabase
    .from(TABLE)
    .select("oauth_refresh_token, oauth_access_token, smtp_password")
  if (error) {
    console.error(`[backfill] Impossibile leggere i conteggi (${label}): ${error.message}`)
    return
  }
  const rows = (data ?? []) as Pick<ChannelRow, "oauth_refresh_token" | "oauth_access_token" | "smtp_password">[]
  const isEnc = (v: string | null) => typeof v === "string" && v.startsWith("enc:v1:")
  const isLegacy = (v: string | null) => typeof v === "string" && v !== "" && !v.startsWith("enc:v1:")
  const isEmpty = (v: string | null) => v == null || v === ""

  const refreshEnc = rows.filter((r) => isEnc(r.oauth_refresh_token)).length
  const refreshLegacy = rows.filter((r) => isLegacy(r.oauth_refresh_token)).length
  const refreshEmpty = rows.filter((r) => isEmpty(r.oauth_refresh_token)).length
  const accessEnc = rows.filter((r) => isEnc(r.oauth_access_token)).length
  const accessLegacy = rows.filter((r) => isLegacy(r.oauth_access_token)).length
  const smtpEnc = rows.filter((r) => isEnc(r.smtp_password)).length
  const smtpLegacy = rows.filter((r) => isLegacy(r.smtp_password)).length
  const smtpEmpty = rows.filter((r) => isEmpty(r.smtp_password)).length

  console.log(`[backfill] Conteggi (${label}) su ${rows.length} righe:`)
  console.log(`  refresh_token : enc=${refreshEnc} legacy=${refreshLegacy} empty=${refreshEmpty}`)
  console.log(`  access_token  : enc=${accessEnc} legacy=${accessLegacy}`)
  console.log(`  smtp_password : enc=${smtpEnc} legacy=${smtpLegacy} empty=${smtpEmpty}`)
}

async function main(): Promise<void> {
  const confirmed = process.env[CONFIRM_ENV] === "true"
  const mode = confirmed ? "SCRITTURA REALE" : "DRY-RUN"

  console.log("=== Backfill email_channels.oauth_refresh_token ===")
  console.log(`[backfill] Modalità: ${mode}`)
  console.log(`[backfill] Ambiente: VERCEL_ENV=${process.env.VERCEL_ENV ?? "<n/d>"} NODE_ENV=${process.env.NODE_ENV ?? "<n/d>"}`)

  // 1) Precondizioni (fail-safe).
  assertEncryptionKey()
  assertServiceRole()

  const supabase = createServiceClient()

  // Stato iniziale (read-only).
  await printSecretCounts(supabase, "PRIMA")

  // 2) Selezione righe candidate: refresh token presente, non vuoto, non già cifrato.
  const { data, error } = await supabase
    .from(TABLE)
    .select("id, email_address, oauth_refresh_token, oauth_access_token, smtp_password")
    .not("oauth_refresh_token", "is", null)
    .neq("oauth_refresh_token", "")
    .not("oauth_refresh_token", "like", "enc:v1:%")

  if (error) abort(`Selezione candidati fallita: ${error.message}`)

  // Filtro difensivo lato JS (oltre al filtro PostgREST).
  const candidates = ((data ?? []) as ChannelRow[]).filter(
    (r) => typeof r.oauth_refresh_token === "string" && r.oauth_refresh_token !== "" && !isEncryptedSecret(r.oauth_refresh_token),
  )

  console.log(`[backfill] Righe candidate (refresh_token legacy da cifrare): ${candidates.length}`)

  if (candidates.length === 0) {
    console.log("[backfill] Nessuna riga da aggiornare: già idempotente.")
    await printSecretCounts(supabase, "DOPO (nessuna modifica)")
    return
  }

  if (candidates.length > EXPECTED_MAX_CANDIDATES) {
    console.warn(
      `[backfill] WARNING: trovate ${candidates.length} righe candidate, più delle ${EXPECTED_MAX_CANDIDATES} attese. ` +
        `Procedo solo se la conferma esplicita (${CONFIRM_ENV}=true) è impostata; verifica che sia atteso.`,
    )
  }

  let updated = 0
  let wouldUpdate = 0

  // 3) Per ogni candidato: cifra + verifica round-trip; aggiorna solo se confermato.
  for (const row of candidates) {
    const plaintext = row.oauth_refresh_token as string
    const encrypted = encryptSecret(plaintext)

    if (!encrypted || !isEncryptedSecret(encrypted)) {
      abort(`Cifratura non valida per canale ${maskId(row.id)} (${maskEmail(row.email_address)}).`)
    }
    // Verifica round-trip: la decifratura deve restituire ESATTAMENTE l'originale.
    if (decryptSecretIfNeeded(encrypted) !== plaintext) {
      abort(`Round-trip fallito per canale ${maskId(row.id)} (${maskEmail(row.email_address)}). Nessuna scrittura eseguita.`)
    }

    // Log sicuro: solo metadati, mai i valori.
    console.log(
      `[backfill] Canale ${maskId(row.id)} ${maskEmail(row.email_address)}: ` +
        `refresh_token -> enc:v1: (len ${encrypted.length}) round-trip OK`,
    )

    if (confirmed) {
      // AGGIORNA SOLO oauth_refresh_token. Nessun altro campo toccato.
      const { error: updErr } = await supabase
        .from(TABLE)
        .update({ oauth_refresh_token: encrypted })
        .eq("id", row.id)
      if (updErr) abort(`Update fallito per canale ${maskId(row.id)}: ${updErr.message}`)
      updated++
    } else {
      wouldUpdate++
    }
  }

  if (confirmed) {
    console.log(`[backfill] Righe aggiornate: ${updated}`)
  } else {
    console.log(`[backfill] DRY-RUN: nessuna scrittura eseguita. Righe che verrebbero aggiornate: ${wouldUpdate}`)
    console.log(
      `[backfill] Per eseguire davvero: ${CONFIRM_ENV}=true node --conditions=react-server --import tsx scripts/backfill-email-refresh-tokens.ts`,
    )
  }

  // 4) Verifica finale (read-only).
  await printSecretCounts(supabase, confirmed ? "DOPO" : "DOPO (dry-run, invariato)")
}

main().catch((err) => {
  console.error(`[backfill] Errore non gestito: ${(err as Error).message}`)
  process.exit(1)
})
