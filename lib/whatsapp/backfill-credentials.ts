import "server-only"
import { encryptSecret, isEncryptedSecret, decryptSecretIfNeeded } from "@/lib/crypto/secrets"
import {
  WHATSAPP_CREDENTIAL_SECRET_FIELDS,
  encryptWhatsAppCredentialsForWrite,
  decryptWhatsAppCredentials,
} from "@/lib/whatsapp/channel-secrets"

/**
 * Logica condivisa per il backfill di `messaging_channels.credentials` (WhatsApp).
 *
 * Cifra SOLO i 3 segreti legacy (in chiaro) annidati in `credentials`
 * (access_token, app_secret, verify_token) al formato `enc:v1:`, senza toccare
 * `config` (phone_number_id, waba_id, ...), schema, RLS, altri canali o feature.
 *
 * - DRY-RUN di default (`confirm: false`): nessuna scrittura.
 * - Scrittura reale solo con `confirm: true`.
 * - Idempotente: i valori già `enc:v1:` vengono esclusi dai candidati.
 * - Non restituisce MAI token in chiaro, ciphertext completo o ENCRYPTION_KEY.
 *   Solo conteggi, ID parziale, nomi-campo e booleani.
 * - Aggiorna SOLO la colonna `credentials` (config ricopiato as-is).
 * - Valida TUTTI i round-trip in memoria prima di qualsiasi scrittura: nessuna
 *   scrittura parziale se un round-trip fallisce.
 *
 * Questo modulo NON usa console/process.exit: ritorna un risultato strutturato,
 * riusabile sia da uno script CLI sia da una route admin.
 */

const TABLE = "messaging_channels"
/** Numero massimo di righe candidate atteso: oltre questo, warning (non blocca). */
const EXPECTED_MAX_CANDIDATES = 1

type Creds = Record<string, unknown> | null
type Row = { id: string; property_id: string | null; credentials: Creds }

export interface FieldCounts {
  enc: number
  legacy: number
  empty: number
}

export interface SecretCounts {
  rows: number
  /** Per ciascuno dei 3 campi segreti: conteggi enc/legacy/empty. */
  fields: Record<string, FieldCounts>
}

export interface CandidateInfo {
  idMasked: string
  propertyMasked: string
  fields: string[]
  roundTripOk: boolean
}

export interface WhatsAppBackfillResult {
  mode: "DRY-RUN" | "SCRITTURA REALE"
  environment: { vercelEnv: string; nodeEnv: string }
  before: SecretCounts
  after: SecretCounts
  candidateCount: number
  updatedCount: number
  wouldUpdateCount: number
  overExpected: boolean
  candidates: CandidateInfo[]
  warnings: string[]
}

export class WhatsAppBackfillError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "WhatsAppBackfillError"
  }
}

/** Supabase service-role client (tipizzato in modo minimale). */
type ServiceClient = {
  from: (table: string) => any
}

const isEnc = (v: unknown) => typeof v === "string" && v.startsWith("enc:v1:")
const isLegacy = (v: unknown) => typeof v === "string" && v !== "" && !v.startsWith("enc:v1:")
const isEmpty = (v: unknown) => v == null || v === ""

function maskId(id: string | null): string {
  if (!id) return "n/d"
  return id.length <= 8 ? id : `${id.slice(0, 8)}…`
}

/**
 * Verifica che ENCRYPTION_KEY sia presente e valida SENZA esporla:
 * cifratura "probe" su valore fittizio (non un segreto reale) + round-trip.
 */
export function assertEncryptionKey(): void {
  try {
    const probe = encryptSecret("__wa_backfill_probe__")
    if (!probe || !isEncryptedSecret(probe)) {
      throw new WhatsAppBackfillError(
        "ENCRYPTION_KEY non utilizzabile: la cifratura di prova non ha prodotto un valore enc:v1:.",
      )
    }
    if (decryptSecretIfNeeded(probe) !== "__wa_backfill_probe__") {
      throw new WhatsAppBackfillError("ENCRYPTION_KEY non utilizzabile: round-trip della cifratura di prova fallito.")
    }
  } catch (err) {
    if (err instanceof WhatsAppBackfillError) throw err
    throw new WhatsAppBackfillError(`ENCRYPTION_KEY mancante o non valida (${(err as Error).message}).`)
  }
}

function countSecrets(rows: Row[]): SecretCounts {
  const fields: Record<string, FieldCounts> = {}
  for (const field of WHATSAPP_CREDENTIAL_SECRET_FIELDS) {
    const c: FieldCounts = { enc: 0, legacy: 0, empty: 0 }
    for (const r of rows) {
      const v = r.credentials ? (r.credentials as Record<string, unknown>)[field] : null
      if (isEnc(v)) c.enc++
      else if (isLegacy(v)) c.legacy++
      else if (isEmpty(v)) c.empty++
    }
    fields[field] = c
  }
  return { rows: rows.length, fields }
}

/** Campi legacy (presenti, non vuoti, non già enc) di una riga. */
function legacyFieldsOf(creds: Creds): string[] {
  if (!creds) return []
  return WHATSAPP_CREDENTIAL_SECRET_FIELDS.filter((f) => {
    const v = (creds as Record<string, unknown>)[f]
    return typeof v === "string" && v !== "" && !isEncryptedSecret(v)
  })
}

async function readWhatsAppRows(supabase: ServiceClient): Promise<Row[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select("id, property_id, credentials")
    .eq("channel_type", "whatsapp")
  if (error) throw new WhatsAppBackfillError(`Lettura righe WhatsApp fallita: ${error.message}`)
  return (data ?? []) as Row[]
}

/**
 * Esegue il backfill (dry-run o reale) e ritorna un risultato strutturato.
 * Lancia `WhatsAppBackfillError` su precondizioni mancanti o round-trip falliti,
 * SENZA aver eseguito scritture parziali prima del fallimento.
 */
export async function runWhatsAppCredentialsBackfill(
  supabase: ServiceClient,
  options: { confirm: boolean },
): Promise<WhatsAppBackfillResult> {
  const confirm = options.confirm === true
  const warnings: string[] = []

  // 1) Precondizione: chiave valida.
  assertEncryptionKey()

  // 2) Stato iniziale.
  const beforeRows = await readWhatsAppRows(supabase)
  const before = countSecrets(beforeRows)

  // 3) Candidati: almeno un campo segreto legacy.
  const candidates = beforeRows.filter((r) => legacyFieldsOf(r.credentials).length > 0)

  const overExpected = candidates.length > EXPECTED_MAX_CANDIDATES
  if (overExpected) {
    warnings.push(
      `Trovate ${candidates.length} righe candidate, più delle ${EXPECTED_MAX_CANDIDATES} attese: verifica prima di confermare.`,
    )
  }

  // 4) Per ogni candidato: cifra SOLO i 3 campi + round-trip in memoria.
  //    Si validano TUTTI i round-trip prima di qualsiasi scrittura.
  const prepared: { row: Row; encrypted: Record<string, unknown> }[] = []
  const candidateInfos: CandidateInfo[] = []

  for (const row of candidates) {
    const fields = legacyFieldsOf(row.credentials)
    const original = row.credentials as Record<string, unknown>

    const encrypted = encryptWhatsAppCredentialsForWrite({ ...original }) as Record<string, unknown>
    const decrypted = decryptWhatsAppCredentials({ ...encrypted }) as Record<string, unknown>

    let rowOk = true
    // Ogni campo legacy: deve risultare enc e decifrare all'originale.
    for (const f of fields) {
      if (!isEnc(encrypted[f])) rowOk = false
      if (decrypted[f] !== original[f]) rowOk = false
    }
    // Campi non-segreti (incl. annidati di config se presenti): invariati.
    for (const k of Object.keys(original)) {
      if ((WHATSAPP_CREDENTIAL_SECRET_FIELDS as readonly string[]).includes(k)) continue
      if (encrypted[k] !== original[k]) rowOk = false
    }

    if (!rowOk) {
      throw new WhatsAppBackfillError(
        `Round-trip fallito per canale ${maskId(row.id)}. Nessuna scrittura eseguita.`,
      )
    }

    prepared.push({ row, encrypted })
    candidateInfos.push({
      idMasked: maskId(row.id),
      propertyMasked: maskId(row.property_id),
      fields,
      roundTripOk: true,
    })
  }

  // 5) Scrittura SOLO se confermato (tutti i round-trip già validati sopra).
  let updated = 0
  let wouldUpdate = 0
  if (confirm) {
    for (const { row, encrypted } of prepared) {
      // AGGIORNA SOLO `credentials` (config invariato perché ricopiato as-is).
      const { error: updErr } = await supabase.from(TABLE).update({ credentials: encrypted }).eq("id", row.id)
      if (updErr) throw new WhatsAppBackfillError(`Update fallito per canale ${maskId(row.id)}: ${updErr.message}`)
      updated++
    }
  } else {
    wouldUpdate = prepared.length
  }

  // 6) Stato finale (riletto dal DB).
  const afterRows = await readWhatsAppRows(supabase)
  const after = countSecrets(afterRows)

  return {
    mode: confirm ? "SCRITTURA REALE" : "DRY-RUN",
    environment: { vercelEnv: process.env.VERCEL_ENV ?? "<n/d>", nodeEnv: process.env.NODE_ENV ?? "<n/d>" },
    before,
    after,
    candidateCount: candidates.length,
    updatedCount: updated,
    wouldUpdateCount: wouldUpdate,
    overExpected,
    candidates: candidateInfos,
    warnings,
  }
}
