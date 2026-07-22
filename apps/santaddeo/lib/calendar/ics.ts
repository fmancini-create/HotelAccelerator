// ============================================================================
// lib/calendar/ics.ts
//
// Parser/fetch minimale di feed iCalendar (.ics) per gli overlay calendario.
// SOLA LETTURA: scarica un URL ICS (Google/Outlook/Apple privato secret URL),
// estrae i VEVENT e li normalizza nello stesso shape degli eventi Google
// usati altrove: { id, title, start, end, allDay }.
//
// Nessuna dipendenza esterna: unfolding righe + parsing VEVENT + espansione
// base delle ricorrenze (RRULE DAILY/WEEKLY/MONTHLY) limitata alla finestra.
// Non copre tutti gli edge-case del formato (EXDATE complessi, VTIMEZONE con
// regole DST custom, ecc.): per un overlay di sola lettura e' un compromesso
// accettabile.
// ============================================================================

export type IcsEvent = {
  id: string
  title: string
  start: string | null // ISO
  end: string | null // ISO
  allDay: boolean
}

const MAX_BYTES = 5 * 1024 * 1024 // 5MB: feed ICS oltre questa soglia = sospetti
const FETCH_TIMEOUT_MS = 12_000
const MAX_RECURRENCE_INSTANCES = 367 // ~1 anno per evento ricorrente

// Cache in-memory per (url|from|to). TTL ~30 min: evita di rifare il fetch a
// ogni cambio mese. Vive nel processo lambda (best-effort, non persistente).
type CacheEntry = { at: number; events: IcsEvent[] }
const cache = new Map<string, CacheEntry>()
const CACHE_TTL_MS = 30 * 60 * 1000

/**
 * Scarica e parsa un feed ICS, ritornando solo gli eventi che intersecano la
 * finestra [from, to]. Lancia un errore con messaggio leggibile se il fetch o
 * il parsing falliscono (cosi' la route puo' salvare last_error).
 */
export async function fetchIcsEvents(url: string, from: Date, to: Date): Promise<IcsEvent[]> {
  const cacheKey = `${url}|${from.toISOString()}|${to.toISOString()}`
  const cached = cache.get(cacheKey)
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return cached.events
  }

  const text = await fetchIcsText(url)
  const all = parseIcs(text)
  const windowed = expandAndFilter(all, from, to)
  cache.set(cacheKey, { at: Date.now(), events: windowed })
  return windowed
}

/** Valida che un URL risponda con contenuto ICS plausibile (per il salvataggio). */
export async function validateIcsUrl(url: string): Promise<{ ok: boolean; error?: string; count?: number }> {
  try {
    const text = await fetchIcsText(url)
    if (!/BEGIN:VCALENDAR/i.test(text)) {
      return { ok: false, error: "L'URL non sembra un calendario iCal (.ics) valido." }
    }
    const events = parseIcs(text)
    return { ok: true, count: events.length }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Impossibile leggere il calendario." }
  }
}

/**
 * Riconosce gli URL che NON sono feed .ics ma pagine di visualizzazione
 * (es. il link "embed" di Google Calendar) e prova a derivarne i candidati
 * feed iCal. Ritorna sempre l'URL originale per primo, poi eventuali derivati.
 *
 * Caso tipico (errore 401): l'utente incolla
 *   https://calendar.google.com/calendar/embed?src=tizio%40gmail.com&ctz=...
 * che e' la pagina HTML protetta. Il feed pubblico equivalente e'
 *   https://calendar.google.com/calendar/ical/<src>/public/basic.ics
 * (funziona solo se il calendario e' reso pubblico; altrimenti serve
 * l'"Indirizzo segreto in formato iCal").
 */
export function deriveIcsCandidates(rawUrl: string): string[] {
  const candidates = [rawUrl]
  try {
    const u = new URL(rawUrl)
    const host = u.hostname.toLowerCase()
    if (host.endsWith("calendar.google.com")) {
      const src = u.searchParams.get("src")
      const isViewPage =
        u.pathname.includes("/embed") ||
        u.pathname.includes("/htmlembed") ||
        u.pathname.includes("/r") ||
        u.pathname === "/calendar/" ||
        u.pathname === "/calendar"
      if (src && isViewPage) {
        const enc = encodeURIComponent(src)
        candidates.push(`https://calendar.google.com/calendar/ical/${enc}/public/basic.ics`)
      }
    }
  } catch {
    // URL non valido: lo gestisce a valle fetchIcsText.
  }
  return candidates
}

/** Indica se l'URL e' un link di VISUALIZZAZIONE Google (non un feed .ics). */
export function isGoogleViewUrl(rawUrl: string): boolean {
  try {
    const u = new URL(rawUrl)
    return (
      u.hostname.toLowerCase().endsWith("calendar.google.com") &&
      (u.pathname.includes("/embed") || u.pathname.includes("/htmlembed") || u.pathname.includes("/r")) &&
      !u.pathname.endsWith(".ics")
    )
  } catch {
    return false
  }
}

/**
 * Indica se l'URL e' il feed iCal PUBBLICO di Google
 * (.../calendar/ical/<id>/public/basic.ics). Se da' 404 significa che il
 * calendario non e' pubblico e serve l'indirizzo segreto (private-token).
 */
export function isGooglePublicIcs(rawUrl: string): boolean {
  try {
    const u = new URL(rawUrl)
    return (
      u.hostname.toLowerCase().endsWith("calendar.google.com") &&
      /\/calendar\/ical\/.+\/public\/basic\.ics$/i.test(u.pathname)
    )
  } catch {
    return false
  }
}

/**
 * Valida un URL calendario provando, oltre all'URL fornito, gli eventuali
 * feed .ics derivati (es. embed Google -> public/basic.ics). Ritorna l'URL
 * effettivamente funzionante (`resolvedUrl`) cosi' la route puo' salvare quello
 * giusto invece del link di visualizzazione che da 401.
 */
export async function validateAndResolveIcsUrl(
  url: string,
): Promise<{ ok: boolean; error?: string; count?: number; resolvedUrl?: string }> {
  const candidates = deriveIcsCandidates(url)
  let lastError: string | undefined
  for (const candidate of candidates) {
    const res = await validateIcsUrl(candidate)
    if (res.ok) {
      return { ...res, resolvedUrl: candidate }
    }
    lastError = res.error
  }
  // Messaggio guida specifico per il link di visualizzazione Google.
  if (isGoogleViewUrl(url)) {
    return {
      ok: false,
      error:
        "Hai incollato il link di VISUALIZZAZIONE di Google Calendar (\"embed\"), che non è un feed iCal e richiede login (errore 401). Apri Google Calendar → passa il mouse sul calendario → ⋮ → Impostazioni e condivisione → in fondo copia l'\"Indirizzo segreto in formato iCal\" (termina con /basic.ics). Se preferisci, rendi il calendario pubblico e riprova con lo stesso link.",
    }
  }
  // Caso 404 sul feed PUBBLICO Google (.../ical/<id>/public/basic.ics): il
  // calendario NON e' pubblico, quindi quel feed non esiste. Serve l'indirizzo
  // SEGRETO (.../ical/<id>/private-<token>/basic.ics) oppure rendere pubblico
  // il calendario.
  if (isGooglePublicIcs(url)) {
    return {
      ok: false,
      error:
        "Il tuo calendario Google NON è pubblico, quindi l'indirizzo \"/public/basic.ics\" non esiste (errore 404). Hai due opzioni: 1) usa l'INDIRIZZO SEGRETO: Google Calendar → ⋮ sul calendario → Impostazioni e condivisione → sezione \"Integra calendario\" → copia l'\"Indirizzo segreto in formato iCal\" (contiene un codice lungo, es. .../ical/.../private-xxxx/basic.ics); oppure 2) rendi pubblico il calendario (stessa pagina → \"Autorizzazioni di accesso\" → \"Rendi disponibile pubblicamente\") e riprova con questo link.",
    }
  }
  return { ok: false, error: lastError || "Impossibile leggere il calendario." }
}

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------
async function fetchIcsText(url: string): Promise<string> {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error("URL non valido.")
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:" && parsed.protocol !== "webcal:") {
    throw new Error("Protocollo URL non supportato.")
  }
  // webcal:// e' un alias di https:// usato dai client calendario.
  if (parsed.protocol === "webcal:") {
    parsed.protocol = "https:"
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(parsed.toString(), {
      signal: controller.signal,
      headers: { Accept: "text/calendar, text/plain, */*" },
      // I feed ICS sono pubblici-ma-segreti: nessuna credenziale necessaria.
      cache: "no-store",
    })
    if (!res.ok) {
      throw new Error(`Il calendario ha risposto con stato ${res.status}.`)
    }
    const len = Number(res.headers.get("content-length") || "0")
    if (len && len > MAX_BYTES) {
      throw new Error("Il calendario e' troppo grande.")
    }
    const text = await res.text()
    if (text.length > MAX_BYTES) {
      throw new Error("Il calendario e' troppo grande.")
    }
    return text
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error("Timeout nel contattare il calendario.")
    }
    throw err instanceof Error ? err : new Error("Errore di rete nel contattare il calendario.")
  } finally {
    clearTimeout(timer)
  }
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------
type RawEvent = {
  uid: string
  summary: string
  start: Date | null
  end: Date | null
  allDay: boolean
  rrule: string | null
}

/** Unfolding: righe ICS continuano se la successiva inizia con spazio o tab. */
function unfold(text: string): string[] {
  const rawLines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n")
  const lines: string[] = []
  for (const line of rawLines) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && lines.length > 0) {
      lines[lines.length - 1] += line.slice(1)
    } else {
      lines.push(line)
    }
  }
  return lines
}

function parseIcs(text: string): RawEvent[] {
  const lines = unfold(text)
  const events: RawEvent[] = []
  let cur: Partial<RawEvent> | null = null

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      cur = { uid: "", summary: "", start: null, end: null, allDay: false, rrule: null }
      continue
    }
    if (line === "END:VEVENT") {
      if (cur && cur.start) {
        events.push({
          uid: cur.uid || cryptoRandom(),
          summary: cur.summary || "(senza titolo)",
          start: cur.start ?? null,
          end: cur.end ?? null,
          allDay: cur.allDay ?? false,
          rrule: cur.rrule ?? null,
        })
      }
      cur = null
      continue
    }
    if (!cur) continue

    const colon = line.indexOf(":")
    if (colon === -1) continue
    const left = line.slice(0, colon)
    const value = line.slice(colon + 1)
    const [name, ...paramParts] = left.split(";")
    const params = paramParts.join(";")
    const key = name.toUpperCase()

    if (key === "UID") {
      cur.uid = value.trim()
    } else if (key === "SUMMARY") {
      cur.summary = unescapeText(value)
    } else if (key === "DTSTART") {
      const parsed = parseIcsDate(value, params)
      cur.start = parsed.date
      cur.allDay = parsed.dateOnly
    } else if (key === "DTEND") {
      const parsed = parseIcsDate(value, params)
      cur.end = parsed.date
    } else if (key === "RRULE") {
      cur.rrule = value.trim()
    }
  }
  return events
}

function unescapeText(v: string): string {
  return v
    .replace(/\\n/gi, " ")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\")
    .trim()
}

/**
 * Parsa un valore DTSTART/DTEND ICS.
 * - "20260615T100000Z"  -> UTC
 * - "20260615T100000"   -> ora locale (trattata come UTC senza TZ DB: best-effort)
 * - "VALUE=DATE:20260615" o "20260615" -> all-day (date-only)
 */
function parseIcsDate(value: string, params: string): { date: Date | null; dateOnly: boolean } {
  const v = value.trim()
  const isDateOnly = /VALUE=DATE/i.test(params) || /^\d{8}$/.test(v)

  if (isDateOnly) {
    const m = v.match(/^(\d{4})(\d{2})(\d{2})/)
    if (!m) return { date: null, dateOnly: true }
    const [, y, mo, d] = m
    // All-day: ancoriamo a mezzogiorno UTC per evitare slittamenti di giorno
    // quando convertito in fuso locale lato client.
    const date = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), 12, 0, 0))
    return { date, dateOnly: true }
  }

  const m = v.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/)
  if (!m) {
    const fallback = new Date(v)
    return { date: isNaN(fallback.getTime()) ? null : fallback, dateOnly: false }
  }
  const [, y, mo, d, h, mi, s, z] = m
  if (z) {
    return {
      date: new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s))),
      dateOnly: false,
    }
  }
  // Niente Z e niente VTIMEZONE gestito: interpretiamo come UTC (best-effort).
  return {
    date: new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s))),
    dateOnly: false,
  }
}

// ---------------------------------------------------------------------------
// Espansione ricorrenze + filtro finestra
// ---------------------------------------------------------------------------
function expandAndFilter(events: RawEvent[], from: Date, to: Date): IcsEvent[] {
  const out: IcsEvent[] = []
  for (const ev of events) {
    if (!ev.start) continue
    const durationMs = ev.end && ev.end > ev.start ? ev.end.getTime() - ev.start.getTime() : 0

    if (!ev.rrule) {
      if (overlaps(ev.start, ev.end ?? ev.start, from, to)) {
        out.push(toIcsEvent(ev, ev.start, ev.end))
      }
      continue
    }

    // Espansione base RRULE (FREQ + INTERVAL + UNTIL/COUNT).
    const rule = parseRrule(ev.rrule)
    if (!rule) {
      if (overlaps(ev.start, ev.end ?? ev.start, from, to)) {
        out.push(toIcsEvent(ev, ev.start, ev.end))
      }
      continue
    }

    let occ = new Date(ev.start)
    let count = 0
    while (count < MAX_RECURRENCE_INSTANCES) {
      if (occ > to) break
      if (rule.until && occ > rule.until) break
      const occEnd = new Date(occ.getTime() + durationMs)
      if (overlaps(occ, occEnd, from, to)) {
        out.push(toIcsEvent(ev, occ, durationMs ? occEnd : null, count))
      }
      count++
      if (rule.count && count >= rule.count) break
      occ = advance(occ, rule.freq, rule.interval)
    }
  }
  return out
}

function overlaps(start: Date, end: Date, from: Date, to: Date): boolean {
  return end >= from && start <= to
}

function toIcsEvent(ev: RawEvent, start: Date, end: Date | null, idx = 0): IcsEvent {
  return {
    id: idx ? `${ev.uid}-${idx}` : ev.uid,
    title: ev.summary,
    start: start.toISOString(),
    end: end ? end.toISOString() : null,
    allDay: ev.allDay,
  }
}

type Rrule = { freq: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY"; interval: number; until: Date | null; count: number | null }

function parseRrule(rrule: string): Rrule | null {
  const parts = Object.fromEntries(
    rrule.split(";").map((kv) => {
      const [k, v] = kv.split("=")
      return [k.toUpperCase(), v]
    }),
  ) as Record<string, string>
  const freq = parts.FREQ as Rrule["freq"]
  if (!freq || !["DAILY", "WEEKLY", "MONTHLY", "YEARLY"].includes(freq)) return null
  const interval = parts.INTERVAL ? Math.max(1, Number.parseInt(parts.INTERVAL, 10)) : 1
  let until: Date | null = null
  if (parts.UNTIL) {
    const u = parseIcsDate(parts.UNTIL, "")
    until = u.date
  }
  const count = parts.COUNT ? Number.parseInt(parts.COUNT, 10) : null
  return { freq, interval, until, count }
}

function advance(d: Date, freq: Rrule["freq"], interval: number): Date {
  const n = new Date(d)
  if (freq === "DAILY") n.setUTCDate(n.getUTCDate() + interval)
  else if (freq === "WEEKLY") n.setUTCDate(n.getUTCDate() + 7 * interval)
  else if (freq === "MONTHLY") n.setUTCMonth(n.getUTCMonth() + interval)
  else if (freq === "YEARLY") n.setUTCFullYear(n.getUTCFullYear() + interval)
  return n
}

function cryptoRandom(): string {
  return `ics-${Math.random().toString(36).slice(2)}-${Date.now()}`
}
