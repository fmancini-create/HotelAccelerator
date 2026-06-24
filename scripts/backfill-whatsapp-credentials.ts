/**
 * BACKFILL ONE-OFF — cifra SOLO i 3 segreti legacy dentro
 * `messaging_channels.credentials` per i canali WhatsApp.
 * ---------------------------------------------------------------------------
 * Campi interessati (e SOLO questi), annidati in `credentials`:
 *   - access_token
 *   - app_secret
 *   - verify_token
 *
 * Riusa gli helper già attivi in produzione:
 *   - encryptWhatsAppCredentialsForWrite  (cifra solo i 3 campi)
 *   - decryptWhatsAppCredentials          (dual-read, per il round-trip)
 *
 * VINCOLI:
 *  - DRY-RUN di default: NESSUNA scrittura.
 *  - Scrittura reale SOLO con CONFIRM_BACKFILL_WHATSAPP_CREDENTIALS="true".
 *  - Idempotente: i valori già `enc:v1:` sono esclusi dai candidati.
 *  - NON tocca `config` (phone_number_id, waba_id, ...): resta in chiaro/queryabile.
 *  - NON cifra l'intero JSONB, NON tocca schema/RLS/altri canali/feature.
 *  - NON logga MAI token in chiaro, ciphertext completo o ENCRYPTION_KEY.
 *  - Prima valida TUTTI i round-trip, poi (se confermato) scrive: nessuna
 *    scrittura parziale se un round-trip fallisce.
 *
 * ESECUZIONE (richiede ENCRYPTION_KEY valida, es. Production).
 * NB: `--conditions=react-server` perché si importa codice con `server-only`.
 *   DRY-RUN:
 *     node --conditions=react-server --import tsx scripts/backfill-whatsapp-credentials.ts
 *   SCRITTURA REALE:
 *     CONFIRM_BACKFILL_WHATSAPP_CREDENTIALS=true node --conditions=react-server --import tsx scripts/backfill-whatsapp-credentials.ts
 */

import { createServiceClient } from "@/lib/supabase/server"
import {
  WHATSAPP_CREDENTIAL_SECRET_FIELDS,
  encryptWhatsAppCredentialsForWrite,
  decryptWhatsAppCredentials,
} from "@/lib/whatsapp/channel-secrets"
import { encryptSecret, isEncryptedSecret, decryptSecretIfNeeded } from "@/lib/crypto/secrets"

const CONFIRM_ENV = "CONFIRM_BACKFILL_WHATSAPP_CREDENTIALS"
const TABLE = "messaging_channels"
const EXPECTED_MAX_CANDIDATES = 1

type Creds = Record<string, unknown> | null
type Row = { id: string; property_id: string | null; credentials: Creds }

const isEnc = (v: unknown) => typeof v === "string" && v.startsWith("enc:v1:")
const isLegacy = (v: unknown) => typeof v === "string" && v !== "" && !v.startsWith("enc:v1:")
const isEmpty = (v: unknown) => v == null || v === ""

function maskId(id: string): string {
  return id.length <= 8 ? id : `${id.slice(0, 8)}…`
}

/** Conteggi per i 3 campi segreti sull'insieme di righe WhatsApp. */
function countSecrets(rows: Row[]) {
  const acc: Record<string, { enc: number; legacy: number; empty: number }> = {}
  for (const field of WHATSAPP_CREDENTIAL_SECRET_FIELDS) {
    acc[field] = { enc: 0, legacy: 0, empty: 0 }
    for (const r of rows) {
      const v = r.credentials ? (r.credentials as Record<string, unknown>)[field] : null
      if (isEnc(v)) acc[field].enc++
      else if (isLegacy(v)) acc[field].legacy++
      else if (isEmpty(v)) acc[field].empty++
    }
  }
  return acc
}

function printCounts(label: string, rows: number, c: ReturnType<typeof countSecrets>): void {
  console.log(`[wa-backfill] Conteggi (${label}) su ${rows} righe WhatsApp:`)
  for (const field of WHATSAPP_CREDENTIAL_SECRET_FIELDS) {
    console.log(`  ${field.padEnd(13)}: enc=${c[field].enc} legacy=${c[field].legacy} empty=${c[field].empty}`)
  }
}

/** Verifica ENCRYPTION_KEY senza esporla: cifra+round-trip su valore fittizio. */
function assertEncryptionKey(): void {
  const probe = encryptSecret("__wa_backfill_probe__")
  if (!probe || !isEncryptedSecret(probe)) {
    throw new Error("ENCRYPTION_KEY non utilizzabile: la cifratura di prova non ha prodotto un valore enc:v1:.")
  }
  if (decryptSecretIfNeeded(probe) !== "__wa_backfill_probe__") {
    throw new Error("ENCRYPTION_KEY non utilizzabile: round-trip della cifratura di prova fallito.")
  }
}

/** Campi legacy (presenti, non vuoti, non già enc) di una riga. */
function legacyFieldsOf(creds: Creds): string[] {
  if (!creds) return []
  return WHATSAPP_CREDENTIAL_SECRET_FIELDS.filter((f) => {
    const v = (creds as Record<string, unknown>)[f]
    return typeof v === "string" && v !== "" && !isEncryptedSecret(v)
  })
}

async function main(): Promise<void> {
  const confirm = process.env[CONFIRM_ENV] === "true"

  console.log("=== Backfill messaging_channels.credentials (WhatsApp) ===")
  console.log(`[wa-backfill] Modalità: ${confirm ? "SCRITTURA REALE" : "DRY-RUN"}`)
  console.log(
    `[wa-backfill] Ambiente: VERCEL_ENV=${process.env.VERCEL_ENV ?? "<n/d>"} NODE_ENV=${process.env.NODE_ENV ?? "<n/d>"}`,
  )

  // 1) Precondizione: chiave valida (senza esporla).
  assertEncryptionKey()

  const supabase = createServiceClient()

  // 2) Legge SOLO le righe WhatsApp.
  const { data, error } = await supabase
    .from(TABLE)
    .select("id, property_id, credentials")
    .eq("channel_type", "whatsapp")
  if (error) throw new Error(`Lettura righe WhatsApp fallita: ${error.message}`)
  const rows = ((data ?? []) as Row[])

  printCounts("PRIMA", rows.length, countSecrets(rows))

  // 3) Candidati: almeno un campo segreto legacy.
  const candidates = rows.filter((r) => legacyFieldsOf(r.credentials).length > 0)

  const overExpected = candidates.length > EXPECTED_MAX_CANDIDATES
  const warnings: string[] = []
  if (overExpected) {
    warnings.push(
      `Trovate ${candidates.length} righe candidate, più delle ${EXPECTED_MAX_CANDIDATES} attese: verifica prima di confermare.`,
    )
  }

  // 4) Per ogni candidato: cifra SOLO i 3 campi + round-trip in memoria.
  //    Si validano TUTTI i round-trip prima di qualsiasi scrittura.
  const prepared: { row: Row; encrypted: Record<string, unknown>; fields: string[] }[] = []
  let roundTripAllOk = true

  for (const row of candidates) {
    const fields = legacyFieldsOf(row.credentials)
    const original = row.credentials as Record<string, unknown>

    const encrypted = encryptWhatsAppCredentialsForWrite({ ...original }) as Record<string, unknown>
    const decrypted = decryptWhatsAppCredentials({ ...encrypted }) as Record<string, unknown>

    // Round-trip: ogni campo legacy decifrato deve combaciare con l'originale.
    let rowOk = true
    for (const f of fields) {
      if (!isEnc(encrypted[f])) rowOk = false
      if (decrypted[f] !== original[f]) rowOk = false
    }
    // Verifica che `config`/altri campi non segreti non vengano alterati: i campi
    // non-segreti devono restare identici fra original ed encrypted.
    for (const k of Object.keys(original)) {
      if ((WHATSAPP_CREDENTIAL_SECRET_FIELDS as readonly string[]).includes(k)) continue
      if (encrypted[k] !== original[k]) rowOk = false
    }

    if (!rowOk) roundTripAllOk = false
    prepared.push({ row, encrypted, fields })

    console.log(
      `[wa-backfill] Canale ${maskId(row.id)} (property ${row.property_id ? maskId(row.property_id) : "n/d"}): ` +
        `campi -> ${fields.join(", ")} | round-trip ${rowOk ? "OK" : "KO"}`,
    )
  }

  for (const w of warnings) console.warn(`[wa-backfill] WARNING: ${w}`)

  // 5) Scrittura SOLO se confermato e tutti i round-trip OK.
  let updated = 0
  if (confirm) {
    if (!roundTripAllOk) {
      throw new Error("Round-trip fallito su almeno una riga: nessuna scrittura eseguita.")
    }
    for (const { row, encrypted } of prepared) {
      // AGGIORNA SOLO `credentials` (config invariato perché ricopiato as-is).
      const { error: updErr } = await supabase.from(TABLE).update({ credentials: encrypted }).eq("id", row.id)
      if (updErr) throw new Error(`Update fallito per canale ${maskId(row.id)}: ${updErr.message}`)
      updated++
    }
  }

  // 6) Stato finale (riletto dal DB).
  const { data: afterData, error: afterErr } = await supabase
    .from(TABLE)
    .select("id, property_id, credentials")
    .eq("channel_type", "whatsapp")
  if (afterErr) throw new Error(`Rilettura conteggi fallita: ${afterErr.message}`)
  const afterRows = ((afterData ?? []) as Row[])

  // 7) Riepilogo strutturato (senza segreti).
  console.log("[wa-backfill] --- RIEPILOGO ---")
  console.log(
    JSON.stringify(
      {
        mode: confirm ? "SCRITTURA REALE" : "DRY-RUN",
        rowsAnalyzed: rows.length,
        candidateCount: candidates.length,
        wouldUpdateCount: confirm ? 0 : prepared.length,
        updatesExecuted: updated,
        candidateFields: prepared.map((p) => ({ idMasked: maskId(p.row.id), fields: p.fields })),
        roundTripOk: roundTripAllOk,
        overExpected,
        warnings,
      },
      null,
      2,
    ),
  )

  printCounts(confirm ? "DOPO" : "DOPO (dry-run, invariato)", afterRows.length, countSecrets(afterRows))

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
