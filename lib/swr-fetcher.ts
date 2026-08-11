/**
 * Fetcher condiviso per SWR.
 *
 * Perche' esiste: `fetch(url).then((r) => r.json())` NON fallisce quando il
 * server risponde 4xx/5xx. Le rotte di questo progetto restituiscono un corpo
 * JSON valido anche in errore (`{"error":"Non autenticato"}`), quindi SWR lo
 * accoglie come dato buono: `data` risulta popolato, `error` resta vuoto, il
 * ramo d'errore della pagina non scatta mai e il primo accesso a un campo
 * atteso (`data.subscriptions.find(...)`) manda la pagina in errore.
 *
 * Convenzione gia' presente in app/admin/crm/settings/page.tsx, qui estratta
 * perche' usata da piu' pagine.
 */

/** Errore che conserva lo stato HTTP e il messaggio del server. */
export class HttpError extends Error {
  constructor(
    public readonly status: number,
    /** Testo di `{"error": ...}`, presente solo se pensato per l'utente. */
    public readonly serverMessage?: string,
  ) {
    super(serverMessage || `HTTP ${status}`)
    this.name = "HttpError"
  }
}

/** Solo 401: sessione scaduta o assente, l'utente deve riautenticarsi.
 *
 *  Il 403 e' ESCLUSO di proposito: misurato dal vivo, la rotta billing
 *  risponde 403 con "Super admin: nessun tenant selezionato" a un utente
 *  perfettamente autenticato. Trattarlo come sessione scaduta lo manderebbe
 *  a rifare l'accesso senza motivo, e il vero rimedio (scegliere il tenant)
 *  resterebbe nascosto. */
export function isSessionExpired(error: unknown): boolean {
  return error instanceof HttpError && error.status === 401
}

/** Messaggio da mostrare: quello del server se e' pensato per l'utente,
 *  altrimenti il testo generico della pagina. */
export function errorMessage(error: unknown, fallback: string): string {
  return error instanceof HttpError && error.serverMessage ? error.serverMessage : fallback
}

export async function jsonFetcher<T = unknown>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: "include" })
  if (!res.ok) {
    // I 5xx sono esclusi: `handleServiceError` vi mette `error.message`, che
    // puo' contenere dettagli interni. I 4xx di questo progetto sono invece
    // messaggi scritti per l'utente ("Nessun tenant selezionato").
    let serverMessage: string | undefined
    if (res.status < 500) {
      try {
        const body = await res.json()
        if (typeof body?.error === "string" && body.error.trim()) serverMessage = body.error
      } catch {
        // corpo non JSON: resta il messaggio generico della pagina
      }
    }
    throw new HttpError(res.status, serverMessage)
  }
  return res.json() as Promise<T>
}
