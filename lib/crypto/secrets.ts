import "server-only"
import crypto from "node:crypto"

/**
 * Utility server-side per la cifratura/decrittazione at-rest dei segreti
 * (token OAuth, password SMTP, credenziali PMS/Manubot, ecc.).
 *
 * SCOPO: fornire un'unica primitiva riutilizzabile per una migrazione GRADUALE
 * verso la cifratura at-rest. In questo step la utility NON viene applicata ad
 * alcun dato reale: serve solo come fondamenta.
 *
 * GARANZIE DI SICUREZZA:
 *  - AES-256-GCM (cifratura autenticata) con IV casuale per ogni operazione.
 *  - Cifratura NON deterministica: due cifrature dello stesso valore producono
 *    output diversi (IV random).
 *  - Auth tag verificato in decifratura (rileva manomissioni).
 *  - Nessun log di valori in chiaro, ciphertext o chiave.
 *  - `import "server-only"`: impedisce l'uso da componenti client.
 *
 * NB: per i campi che richiedono lookup per uguaglianza (es. token cercati con
 * `eq(...)`) questa cifratura NON è adatta da sola, perché non è deterministica.
 * In quei casi servirà affiancare un hash deterministico separato.
 */

const VERSION_PREFIX = "enc:v1:"
const ALGORITHM = "aes-256-gcm"
const IV_BYTES = 12 // 96 bit: dimensione raccomandata per GCM
const KEY_BYTES = 32 // 256 bit
const AUTH_TAG_BYTES = 16

/**
 * Risolve e valida la chiave da `process.env.ENCRYPTION_KEY`.
 *
 * Formati accettati (devono decodificare a esattamente 32 byte):
 *  - base64 / base64url (consigliato: `openssl rand -base64 32`)
 *  - hex (64 caratteri)
 *
 * La chiave NON viene mai generata automaticamente né loggata.
 */
function resolveKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY
  if (!raw || raw.trim() === "") {
    throw new Error(
      "ENCRYPTION_KEY non impostata: la cifratura dei segreti richiede una chiave a 32 byte (es. `openssl rand -base64 32`).",
    )
  }

  const candidate = raw.trim()
  let key: Buffer | null = null

  // hex: 64 caratteri esadecimali => 32 byte
  if (/^[0-9a-fA-F]{64}$/.test(candidate)) {
    key = Buffer.from(candidate, "hex")
  } else {
    // base64 / base64url
    try {
      const buf = Buffer.from(candidate, "base64")
      if (buf.length === KEY_BYTES) {
        key = buf
      }
    } catch {
      // ignorato: gestito sotto
    }
  }

  if (!key || key.length !== KEY_BYTES) {
    throw new Error(
      "ENCRYPTION_KEY non valida: deve decodificare a esattamente 32 byte (base64 da 32 byte oppure hex da 64 caratteri).",
    )
  }

  return key
}

/**
 * Ritorna true se il valore ha il formato di un segreto cifrato da questa
 * utility (`enc:v1:...`). Non verifica l'integrità crittografica.
 */
export function isEncryptedSecret(value: unknown): boolean {
  return typeof value === "string" && value.startsWith(VERSION_PREFIX)
}

/**
 * Cifra un valore in chiaro.
 *
 * Regole sui valori "vuoti":
 *  - `null`      => `null`
 *  - `undefined` => `null`
 *  - `""`        => `null`  (stringa vuota trattata come "nessun segreto")
 *
 * Output: `enc:v1:<base64url(iv)>:<base64url(authTag)>:<base64url(ciphertext)>`.
 * Idempotenza: se il valore è già cifrato (`enc:v1:`) viene restituito invariato,
 * così il backfill può essere eseguito più volte senza doppia cifratura.
 */
export function encryptSecret(value: string | null | undefined): string | null {
  if (value == null || value === "") return null
  if (isEncryptedSecret(value)) return value

  const key = resolveKey()
  const iv = crypto.randomBytes(IV_BYTES)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)

  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()])
  const authTag = cipher.getAuthTag()

  return [
    VERSION_PREFIX.slice(0, -1), // "enc:v1" (il ":" finale è aggiunto dal join)
    iv.toString("base64url"),
    authTag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(":")
}

/**
 * Decifra un valore prodotto da `encryptSecret`.
 *
 * Regole:
 *  - `null` / `undefined` / `""` => `null` (gestiti senza crash)
 *  - valore NON cifrato (senza prefisso `enc:v1:`) => LANCIA errore. Per la
 *    lettura tollerante di dati legacy in chiaro usare `decryptSecretIfNeeded`.
 */
export function decryptSecret(value: string | null | undefined): string | null {
  if (value == null || value === "") return null

  if (!isEncryptedSecret(value)) {
    throw new Error(
      "decryptSecret: valore non cifrato (manca il prefisso enc:v1:). Per i dati legacy in chiaro usare decryptSecretIfNeeded().",
    )
  }

  const parts = value.split(":")
  // formato atteso: ["enc", "v1", iv, authTag, ciphertext]
  if (parts.length !== 5) {
    throw new Error("decryptSecret: formato del segreto cifrato non valido.")
  }

  const [, , ivB64, tagB64, dataB64] = parts
  const iv = Buffer.from(ivB64, "base64url")
  const authTag = Buffer.from(tagB64, "base64url")
  const ciphertext = Buffer.from(dataB64, "base64url")

  if (iv.length !== IV_BYTES || authTag.length !== AUTH_TAG_BYTES) {
    throw new Error("decryptSecret: IV o auth tag con lunghezza non valida.")
  }

  const key = resolveKey()
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)

  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()])
  return plaintext.toString("utf8")
}

/**
 * Lettura tollerante per la migrazione graduale:
 *  - se il valore è cifrato (`enc:v1:`) lo decifra;
 *  - se è un valore legacy in chiaro lo restituisce invariato;
 *  - `null` / `undefined` / `""` => `null`.
 *
 * Da usare nei reader durante la fase di transizione (dual-read).
 */
export function decryptSecretIfNeeded(value: string | null | undefined): string | null {
  if (value == null || value === "") return null
  if (!isEncryptedSecret(value)) return value
  return decryptSecret(value)
}
