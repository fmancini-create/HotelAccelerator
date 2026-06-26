import "server-only"
import crypto from "node:crypto"

/**
 * Utility server-side per calcolare hash DETERMINISTICI di token API.
 *
 * SCOPO: i token come `properties.api_token` vengono cercati con lookup per
 * uguaglianza (`.eq("api_token", token)`). La cifratura AES-256-GCM di
 * `lib/crypto/secrets.ts` è NON deterministica (IV random) e quindi inadatta a
 * questo uso. Qui forniamo invece un hash deterministico ricercabile da
 * affiancare in una colonna `api_token_hash` (step futuro).
 *
 * GARANZIE DI SICUREZZA:
 *  - HMAC-SHA256 con secret server-side dedicato (`API_TOKEN_HASH_SECRET`).
 *  - Deterministico: stesso token + stesso secret => stesso hash (consente eq()).
 *  - Confronto in tempo costante (`crypto.timingSafeEqual`) per evitare timing
 *    attack sul confronto degli hash.
 *  - Nessun log di token, hash o secret.
 *  - `import "server-only"`: non utilizzabile da componenti client.
 *
 * NB: in questo step la utility NON è collegata a setup, webhook o DB. È solo
 * il mattone base. NON riusa `ENCRYPTION_KEY`: i domini di chiave (cifratura vs
 * hashing) restano separati.
 */

const TOKEN_HASH_PREFIX = "hmac:v1:"

// Lunghezza minima del secret grezzo (caratteri) per essere considerato robusto.
// 32 byte casuali in base64 producono ~44 caratteri; accettiamo qualunque
// stringa che, una volta valutata, fornisca >= 32 byte di entropia di chiave.
const MIN_SECRET_BYTES = 32

/**
 * Risolve e valida il secret da `process.env.API_TOKEN_HASH_SECRET`.
 *
 * Criterio di robustezza (semplice e stabile):
 *  - se decodifica come base64 a >= 32 byte, usa quei byte;
 *  - altrimenti, se la stringa UTF-8 è >= 32 byte, usa i byte UTF-8;
 *  - altrimenti errore.
 *
 * Il secret NON viene mai generato automaticamente né loggato.
 */
function resolveHashSecret(): Buffer {
  const raw = process.env.API_TOKEN_HASH_SECRET
  if (!raw || raw.trim() === "") {
    throw new Error(
      "API_TOKEN_HASH_SECRET non impostata: l'hashing dei token API richiede un secret dedicato di almeno 32 byte (es. `openssl rand -base64 32`).",
    )
  }

  const candidate = raw.trim()

  // Preferisci l'interpretazione base64 se fornisce abbastanza byte.
  let key: Buffer | null = null
  try {
    const decoded = Buffer.from(candidate, "base64")
    if (decoded.length >= MIN_SECRET_BYTES) {
      key = decoded
    }
  } catch {
    // ignorato: gestito sotto col fallback UTF-8
  }

  // Fallback: stringa robusta interpretata come byte UTF-8.
  if (!key) {
    const utf8 = Buffer.from(candidate, "utf8")
    if (utf8.length >= MIN_SECRET_BYTES) {
      key = utf8
    }
  }

  if (!key || key.length < MIN_SECRET_BYTES) {
    throw new Error(
      "API_TOKEN_HASH_SECRET non valido: deve fornire almeno 32 byte (base64 da >=32 byte oppure stringa lunga >=32 caratteri).",
    )
  }

  return key
}

/**
 * Ritorna true se il valore ha il formato di un hash prodotto da questa utility
 * (`hmac:v1:...`). Non verifica la correttezza crittografica.
 */
export function isHashedApiToken(value: unknown): boolean {
  return typeof value === "string" && value.startsWith(TOKEN_HASH_PREFIX)
}

/**
 * Calcola l'hash deterministico di un token API.
 *
 * - Richiede una stringa non vuota (altrimenti errore controllato).
 * - Output: `hmac:v1:<hex>` (HMAC-SHA256, 64 caratteri hex).
 * - Non logga nulla (né token, né hash, né secret).
 */
export function hashApiToken(token: string): string {
  if (typeof token !== "string" || token === "") {
    throw new Error("hashApiToken: il token deve essere una stringa non vuota.")
  }

  const secret = resolveHashSecret()
  const mac = crypto.createHmac("sha256", secret).update(token, "utf8").digest("hex")
  return TOKEN_HASH_PREFIX + mac
}

/**
 * Confronta un token in chiaro con un hash memorizzato, in tempo costante.
 *
 * - Ritorna false se l'hash è mancante o non ha formato `hmac:v1:`.
 * - Ritorna false se il token è vuoto/non valido (senza lanciare).
 * - Usa `crypto.timingSafeEqual` per evitare timing attack.
 * - Non logga token né hash.
 */
export function tokenMatchesHash(token: string, storedHash: string | null | undefined): boolean {
  if (!isHashedApiToken(storedHash)) return false
  if (typeof token !== "string" || token === "") return false

  let computed: string
  try {
    computed = hashApiToken(token)
  } catch {
    return false
  }

  const a = Buffer.from(computed, "utf8")
  const b = Buffer.from(storedHash as string, "utf8")
  // timingSafeEqual richiede buffer di pari lunghezza.
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}
