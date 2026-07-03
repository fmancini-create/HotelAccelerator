import "server-only"

/**
 * GUARD PROD/DEV per l'integrazione ManuBot (Step B1 — hardening).
 *
 * SCOPO: impedire che HotelAccelerator in Production parli con il progetto
 * Supabase ManuBot di DEV. In Production è ammesso SOLO l'host ManuBot PROD;
 * in Preview/Development/Test sono ammessi sia PROD sia DEV.
 *
 * PERCHÉ: un mismatch (Production → DEV) leggerebbe/scriverebbe dati su un
 * ambiente sbagliato. La guard fallisce PRIMA di qualunque chiamata esterna.
 *
 * REGOLE DI SICUREZZA:
 *  - Nessun log di URL completi (possibili path/parametri), token o secret.
 *  - Nei messaggi d'errore si espone al massimo l'HOST, mai la URL intera.
 *  - `import "server-only"`: non utilizzabile da componenti client.
 *
 * QUESTO STEP NON: tocca il DB, non crea migration, non genera token, non
 * modifica il webhook receiver né il fallback legacy.
 */

/** Host del progetto Supabase ManuBot di PRODUZIONE (unico ammesso in prod). */
export const MANUBOT_PROD_SUPABASE_HOST = "bblgrdukgxkszuayzqjt.supabase.co"

/** Host del progetto Supabase ManuBot di SVILUPPO (ammesso solo fuori prod). */
export const MANUBOT_DEV_SUPABASE_HOST = "qqcxeksvegvmgajmyqcz.supabase.co"

/**
 * Endpoint pubblico CANONICO del webhook receiver ManuBot → HotelAccelerator.
 *
 * INVARIANTE (`www`): deve essere sempre la versione con `www`. Il redirect da
 * apex (`hotelaccelerator.com`) a `www` può far perdere l'header
 * `Authorization: Bearer`, provocando 401 lato ManuBot. Usare SEMPRE questa
 * costante quando si mostra/копia l'endpoint da configurare in ManuBot.
 */
export const MANUBOT_WEBHOOK_PUBLIC_URL =
  "https://www.hotelaccelerator.com/api/external/manubot"

/** Errore controllato della guard ambiente ManuBot (nessun dato sensibile). */
export class ManubotEnvironmentError extends Error {
  readonly code:
    | "MANUBOT_URL_MISSING"
    | "MANUBOT_URL_INVALID"
    | "MANUBOT_PROD_DEV_MISMATCH"
    | "MANUBOT_HOST_NOT_ALLOWED"

  constructor(code: ManubotEnvironmentError["code"], message: string) {
    super(message)
    this.name = "ManubotEnvironmentError"
    this.code = code
  }
}

/**
 * True se il runtime corrente è la Production di Vercel.
 * Fuori da Vercel (`VERCEL_ENV` assente) => NON production (dev locale/test).
 */
export function isProductionRuntime(): boolean {
  return process.env.VERCEL_ENV === "production"
}

/**
 * Estrae l'host (hostname) da una URL, in minuscolo. Ritorna null se la URL è
 * assente o non parsabile. Non espone mai la URL completa.
 */
function extractHost(url: string | null | undefined): string | null {
  if (typeof url !== "string" || url.trim() === "") return null
  try {
    return new URL(url.trim()).hostname.toLowerCase()
  } catch {
    return null
  }
}

/**
 * Host ManuBot ATTESO per l'ambiente corrente.
 *  - Production => host PROD (unico ammesso).
 *  - Altrove    => host PROD come default canonico (DEV è comunque ammesso,
 *                  vedi `isAllowedManubotSupabaseUrl`).
 */
export function getExpectedManubotSupabaseHost(): string {
  return MANUBOT_PROD_SUPABASE_HOST
}

/**
 * Verifica NON lanciante: true se la URL ManuBot è ammessa nell'ambiente
 * corrente. URL assente/invalida => false.
 *
 * REGOLA:
 *  - Production      => ammesso SOLO l'host PROD.
 *  - Fuori Production => ammesso qualunque host valido (Preview/Dev possono
 *    usare DEV o altri progetti di test). Nessun restringimento a allow-list
 *    fuori prod: il pericolo reale è solo Production → DEV.
 */
export function isAllowedManubotSupabaseUrl(url: string | null | undefined): boolean {
  const host = extractHost(url)
  if (!host) return false
  if (isProductionRuntime()) return host === MANUBOT_PROD_SUPABASE_HOST
  return true
}

/**
 * Validazione LANCIANTE della URL Supabase ManuBot per l'ambiente corrente.
 * Da chiamare PRIMA di ogni login/chiamata esterna e prima di persistere la URL.
 *
 * Lancia `ManubotEnvironmentError` con codice specifico:
 *  - MANUBOT_URL_MISSING        : URL assente/vuota.
 *  - MANUBOT_URL_INVALID        : URL non parsabile.
 *  - MANUBOT_PROD_DEV_MISMATCH  : in Production ma host = DEV.
 *  - MANUBOT_HOST_NOT_ALLOWED   : host sconosciuto/non in allow-list.
 *
 * Ritorna l'host validato (utile al chiamante), mai la URL completa.
 */
export function validateManubotSupabaseUrlForEnvironment(
  url: string | null | undefined,
): string {
  if (typeof url !== "string" || url.trim() === "") {
    throw new ManubotEnvironmentError(
      "MANUBOT_URL_MISSING",
      "URL Supabase ManuBot mancante: configurazione non valida.",
    )
  }

  const host = extractHost(url)
  if (!host) {
    throw new ManubotEnvironmentError(
      "MANUBOT_URL_INVALID",
      "URL Supabase ManuBot non valida: impossibile determinarne l'host.",
    )
  }

  // Fuori Production: qualunque host valido è ammesso (Preview/Dev/Test).
  if (!isProductionRuntime()) {
    return host
  }

  // Production: ammesso SOLO l'host PROD.
  if (host === MANUBOT_PROD_SUPABASE_HOST) {
    return host
  }

  // In Production, l'host DEV è il caso di mismatch più pericoloso: messaggio
  // esplicito e distinto (solo host, mai la URL intera).
  if (host === MANUBOT_DEV_SUPABASE_HOST) {
    throw new ManubotEnvironmentError(
      "MANUBOT_PROD_DEV_MISMATCH",
      `Configurazione ManuBot non ammessa in Production: l'host punta a DEV (${host}). ` +
        `In Production è consentito solo ${MANUBOT_PROD_SUPABASE_HOST}.`,
    )
  }

  // Qualunque altro host in Production non è in allow-list.
  throw new ManubotEnvironmentError(
    "MANUBOT_HOST_NOT_ALLOWED",
    `Host Supabase ManuBot non ammesso in Production: ${host}. ` +
      `Consentito solo ${MANUBOT_PROD_SUPABASE_HOST}.`,
  )
}

/**
 * Endpoint pubblico canonico del webhook (sempre `www`). Helper di sola
 * lettura per UI/route che mostrano l'endpoint da configurare in ManuBot.
 */
export function getManubotWebhookPublicUrl(): string {
  return MANUBOT_WEBHOOK_PUBLIC_URL
}
