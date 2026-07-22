import "server-only"
import { google } from "googleapis"

/**
 * Integrazione Google Search Console via Service Account.
 *
 * Riusa lo stesso service account del Calendar
 * (GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY), ma serve
 * uno scope diverso (webmasters.readonly) e DUE passi di setup una tantum:
 *
 *   1. Abilitare la "Google Search Console API" nel progetto Google Cloud del
 *      service account (Console > API e servizi > Abilita API).
 *   2. In Search Console > Impostazioni > Utenti e autorizzazioni, aggiungere
 *      l'email del service account come utente (anche "Con restrizioni") della
 *      property `sc-domain:santaddeo.com`.
 *
 * Finche' uno dei due manca, l'API risponde 403/"API disabled": lo intercettiamo
 * e mostriamo istruzioni in UI invece di un errore generico.
 */

const SCOPES = ["https://www.googleapis.com/auth/webmasters.readonly"]

// Property GSC. E' di tipo "dominio", quindi il prefisso `sc-domain:`.
export const GSC_SITE_URL = process.env.GSC_SITE_URL || "sc-domain:santaddeo.com"

export function isSearchConsoleConfigured(): boolean {
  return Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY)
}

function getClient() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
  const key = (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || "").replace(/\\n/g, "\n")
  if (!email || !key) throw new Error("google_not_configured")
  const auth = new google.auth.JWT({ email, key, scopes: SCOPES })
  return google.webmasters({ version: "v3", auth })
}

export class SearchConsoleSetupError extends Error {
  constructor(
    public readonly reason: "api_disabled" | "no_access" | "not_configured",
    message: string,
  ) {
    super(message)
    this.name = "SearchConsoleSetupError"
  }
}

function mapError(err: unknown): never {
  const e = err as { code?: number; message?: string }
  const msg = e?.message || String(err)
  if (/has not been used in project|is disabled|accessNotConfigured/i.test(msg)) {
    throw new SearchConsoleSetupError("api_disabled", msg)
  }
  if (e?.code === 403 || /permission|forbidden|insufficient/i.test(msg)) {
    throw new SearchConsoleSetupError("no_access", msg)
  }
  throw err
}

export type GscRow = {
  keys: string[]
  clicks: number
  impressions: number
  ctr: number
  position: number
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function rangeDates(days: number): { startDate: string; endDate: string } {
  // GSC ha ~2-3 giorni di latenza: chiudiamo la finestra a 2 giorni fa.
  const end = new Date(Date.now() - 2 * 86_400_000)
  const start = new Date(end.getTime() - (days - 1) * 86_400_000)
  return { startDate: ymd(start), endDate: ymd(end) }
}

/** Top query aggregate sul periodo. */
export async function getTopQueries(days: number, rowLimit = 100): Promise<GscRow[]> {
  if (!isSearchConsoleConfigured()) throw new SearchConsoleSetupError("not_configured", "service account mancante")
  try {
    const wm = getClient()
    const { startDate, endDate } = rangeDates(days)
    const res = await wm.searchanalytics.query({
      siteUrl: GSC_SITE_URL,
      requestBody: { startDate, endDate, dimensions: ["query"], rowLimit },
    })
    return (res.data.rows || []) as GscRow[]
  } catch (err) {
    mapError(err)
  }
}

/** Andamento giornaliero (posizione/clic/impressioni) per una singola query. */
export async function getQueryTrend(query: string, days: number): Promise<GscRow[]> {
  if (!isSearchConsoleConfigured()) throw new SearchConsoleSetupError("not_configured", "service account mancante")
  try {
    const wm = getClient()
    const { startDate, endDate } = rangeDates(days)
    const res = await wm.searchanalytics.query({
      siteUrl: GSC_SITE_URL,
      requestBody: {
        startDate,
        endDate,
        dimensions: ["date"],
        rowLimit: 500,
        dimensionFilterGroups: [
          { filters: [{ dimension: "query", operator: "equals", expression: query }] },
        ],
      },
    })
    return (res.data.rows || []) as GscRow[]
  } catch (err) {
    mapError(err)
  }
}
