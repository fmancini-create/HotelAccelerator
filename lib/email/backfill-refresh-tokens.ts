import "server-only"
import { encryptSecret, isEncryptedSecret, decryptSecretIfNeeded } from "@/lib/crypto/secrets"

/**
 * Logica condivisa per il backfill di `email_channels.oauth_refresh_token`.
 *
 * Cifra SOLO i refresh token legacy (in chiaro) al formato `enc:v1:`, senza
 * toccare access token, smtp_password, schema, RLS o altri campi/feature.
 *
 * - DRY-RUN di default (`confirm: false`): nessuna scrittura.
 * - Scrittura reale solo con `confirm: true`.
 * - Idempotente: i valori già `enc:v1:` vengono esclusi dalla selezione.
 * - Non restituisce MAI: token in chiaro, ciphertext completo, ENCRYPTION_KEY.
 *   Solo conteggi, ID parziale, email mascherata, lunghezza ciphertext.
 * - Aggiorna SOLO la colonna `oauth_refresh_token`.
 *
 * Questo modulo NON usa console/process.exit: ritorna un risultato strutturato,
 * così può essere riusato sia da uno script CLI sia da una route admin.
 */

const TABLE = "email_channels"
/** Numero massimo di righe candidate atteso: oltre questo, warning (non blocca). */
const EXPECTED_MAX_CANDIDATES = 2

type ChannelRow = {
  id: string
  email_address: string | null
  oauth_refresh_token: string | null
  oauth_access_token: string | null
  smtp_password: string | null
}

export interface SecretCounts {
  rows: number
  refresh: { enc: number; legacy: number; empty: number }
  access: { enc: number; legacy: number }
  smtp: { enc: number; legacy: number; empty: number }
}

export interface CandidateInfo {
  idMasked: string
  emailMasked: string
  cipherLength: number
  roundTripOk: boolean
}

export interface BackfillResult {
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

export class BackfillError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "BackfillError"
  }
}

/** Supabase service-role client (tipizzato in modo minimale, evita dipendenze). */
type ServiceClient = {
  from: (table: string) => any
}

/** ID parziale per output sicuri (mai l'ID completo, non necessario). */
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

/**
 * Verifica che ENCRYPTION_KEY sia presente e valida SENZA esporla:
 * cifratura "probe" su un valore fittizio (non un segreto reale) + round-trip.
 */
export function assertEncryptionKey(): void {
  try {
    const probe = encryptSecret("__backfill_probe__")
    if (!probe || !isEncryptedSecret(probe)) {
      throw new BackfillError("ENCRYPTION_KEY non utilizzabile: la cifratura di prova non ha prodotto un valore enc:v1:.")
    }
    if (decryptSecretIfNeeded(probe) !== "__backfill_probe__") {
      throw new BackfillError("ENCRYPTION_KEY non utilizzabile: round-trip della cifratura di prova fallito.")
    }
  } catch (err) {
    if (err instanceof BackfillError) throw err
    throw new BackfillError(`ENCRYPTION_KEY mancante o non valida (${(err as Error).message}).`)
  }
}

const isEnc = (v: string | null) => typeof v === "string" && v.startsWith("enc:v1:")
const isLegacy = (v: string | null) => typeof v === "string" && v !== "" && !v.startsWith("enc:v1:")
const isEmpty = (v: string | null) => v == null || v === ""

async function readCounts(supabase: ServiceClient): Promise<SecretCounts> {
  const { data, error } = await supabase
    .from(TABLE)
    .select("oauth_refresh_token, oauth_access_token, smtp_password")
  if (error) throw new BackfillError(`Lettura conteggi fallita: ${error.message}`)
  const rows = (data ?? []) as Pick<ChannelRow, "oauth_refresh_token" | "oauth_access_token" | "smtp_password">[]
  return {
    rows: rows.length,
    refresh: {
      enc: rows.filter((r) => isEnc(r.oauth_refresh_token)).length,
      legacy: rows.filter((r) => isLegacy(r.oauth_refresh_token)).length,
      empty: rows.filter((r) => isEmpty(r.oauth_refresh_token)).length,
    },
    access: {
      enc: rows.filter((r) => isEnc(r.oauth_access_token)).length,
      legacy: rows.filter((r) => isLegacy(r.oauth_access_token)).length,
    },
    smtp: {
      enc: rows.filter((r) => isEnc(r.smtp_password)).length,
      legacy: rows.filter((r) => isLegacy(r.smtp_password)).length,
      empty: rows.filter((r) => isEmpty(r.smtp_password)).length,
    },
  }
}

/**
 * Esegue il backfill (dry-run o reale) e ritorna un risultato strutturato.
 * Lancia `BackfillError` su precondizioni mancanti o verifiche fallite,
 * SENZA aver eseguito alcuna scrittura parziale prima del fallimento di un round-trip.
 */
export async function runRefreshTokenBackfill(
  supabase: ServiceClient,
  options: { confirm: boolean },
): Promise<BackfillResult> {
  const confirm = options.confirm === true
  const warnings: string[] = []

  // 1) Precondizione: chiave valida.
  assertEncryptionKey()

  // 2) Stato iniziale.
  const before = await readCounts(supabase)

  // 3) Selezione candidati: refresh token presente, non vuoto, non già cifrato.
  const { data, error } = await supabase
    .from(TABLE)
    .select("id, email_address, oauth_refresh_token, oauth_access_token, smtp_password")
    .not("oauth_refresh_token", "is", null)
    .neq("oauth_refresh_token", "")
    .not("oauth_refresh_token", "like", "enc:v1:%")
  if (error) throw new BackfillError(`Selezione candidati fallita: ${error.message}`)

  // Filtro difensivo lato JS oltre al filtro PostgREST.
  const candidates = ((data ?? []) as ChannelRow[]).filter(
    (r) =>
      typeof r.oauth_refresh_token === "string" &&
      r.oauth_refresh_token !== "" &&
      !isEncryptedSecret(r.oauth_refresh_token),
  )

  const overExpected = candidates.length > EXPECTED_MAX_CANDIDATES
  if (overExpected) {
    warnings.push(
      `Trovate ${candidates.length} righe candidate, più delle ${EXPECTED_MAX_CANDIDATES} attese: verifica che sia atteso prima di confermare.`,
    )
  }

  const candidateInfos: CandidateInfo[] = []
  let updated = 0
  let wouldUpdate = 0

  // 4) Per ogni candidato: cifra + round-trip; aggiorna solo se confermato.
  //    PRIMA si validano TUTTI i round-trip, poi (se confermato) si scrive,
  //    così un round-trip fallito non lascia scritture parziali.
  const prepared: { row: ChannelRow; encrypted: string }[] = []
  for (const row of candidates) {
    const plaintext = row.oauth_refresh_token as string
    const encrypted = encryptSecret(plaintext)
    if (!encrypted || !isEncryptedSecret(encrypted)) {
      throw new BackfillError(`Cifratura non valida per canale ${maskId(row.id)} (${maskEmail(row.email_address)}).`)
    }
    if (decryptSecretIfNeeded(encrypted) !== plaintext) {
      throw new BackfillError(
        `Round-trip fallito per canale ${maskId(row.id)} (${maskEmail(row.email_address)}). Nessuna scrittura eseguita.`,
      )
    }
    prepared.push({ row, encrypted })
    candidateInfos.push({
      idMasked: maskId(row.id),
      emailMasked: maskEmail(row.email_address),
      cipherLength: encrypted.length,
      roundTripOk: true,
    })
  }

  if (confirm) {
    for (const { row, encrypted } of prepared) {
      // AGGIORNA SOLO oauth_refresh_token. Nessun altro campo toccato.
      const { error: updErr } = await supabase
        .from(TABLE)
        .update({ oauth_refresh_token: encrypted })
        .eq("id", row.id)
      if (updErr) throw new BackfillError(`Update fallito per canale ${maskId(row.id)}: ${updErr.message}`)
      updated++
    }
  } else {
    wouldUpdate = prepared.length
  }

  // 5) Stato finale.
  const after = await readCounts(supabase)

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
