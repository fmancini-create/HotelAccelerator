import "server-only"
import { google } from "googleapis"

/**
 * Integrazione Google Calendar via Service Account (clienti@4bid.it).
 *
 * Il calendario di clienti@4bid.it e' condiviso con l'email del service
 * account con permesso "Apportare modifiche agli eventi". Il service account
 * legge la disponibilita' (sola lettura per i venditori) e crea eventi quando
 * il super admin accetta una richiesta di demo.
 *
 * Env richieste:
 *  - GOOGLE_SERVICE_ACCOUNT_EMAIL
 *  - GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY  (con \n letterali o reali)
 *  - GOOGLE_CLIENTI_CALENDAR_ID          (di norma clienti@4bid.it)
 */

const SCOPES = ["https://www.googleapis.com/auth/calendar"]

export function isGoogleCalendarConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
      process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY &&
      process.env.GOOGLE_CLIENTI_CALENDAR_ID,
  )
}

export function getCalendarId(): string {
  return process.env.GOOGLE_CLIENTI_CALENDAR_ID || ""
}

/**
 * Utente Google Workspace da impersonare via Domain-Wide Delegation.
 *
 * IMPORTANTE per il Google Meet: un Service Account puo' generare un link Meet
 * (e invitare attendees) SOLO se impersona un utente reale del workspace
 * tramite il campo `subject` del JWT. Senza `subject`, anche con la DWD
 * abilitata in Google Admin, l'API rifiuta la creazione del Meet.
 *
 * Procedura per attivarlo (in quest'ordine, per non rompere la lettura del
 * calendario che oggi funziona):
 *   1. In Google Admin > Sicurezza > Controllo API > Delega a livello di
 *      dominio, autorizza il Client ID del Service Account con lo scope
 *      https://www.googleapis.com/auth/calendar
 *   2. SOLO DOPO, imposta l'env GOOGLE_IMPERSONATE_EMAIL=clienti@4bid.it
 *
 * E' volutamente OPT-IN tramite env esplicita: se la impostassimo prima di
 * autorizzare la DWD, il JWT verrebbe rifiutato (unauthorized_client) e si
 * romperebbe anche l'overlay disponibilita' gia' funzionante.
 */
function getImpersonateSubject(): string | undefined {
  return process.env.GOOGLE_IMPERSONATE_EMAIL?.trim() || undefined
}

function getAuth() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
  // La private key, passata come env, ha spesso i newline come sequenze "\n"
  // letterali: vanno riportati a newline reali per la firma JWT.
  const key = (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || "").replace(/\\n/g, "\n")
  if (!email || !key) throw new Error("google_not_configured")
  // `subject` abilita l'impersonazione DWD: necessario per Meet + attendees.
  const subject = getImpersonateSubject()
  return new google.auth.JWT({ email, key, scopes: SCOPES, subject })
}

function getClient() {
  return google.calendar({ version: "v3", auth: getAuth() })
}

export type GoogleEvent = {
  id: string
  title: string
  start: string | null
  end: string | null
  allDay: boolean
  /** Link Google Meet (hangoutLink/conferenceData), se l'evento ha una call. */
  meetLink: string | null
  /** Link all'evento su Google Calendar (sempre presente). */
  htmlLink: string | null
  /**
   * Email dei partecipanti (organizer + creator + attendees), lowercase.
   * USO SOLO SERVER-SIDE: serve ad attribuire una demo creata a mano su Google
   * al venditore invitato (match con sales_agents.email/sender_email). NON va
   * mai rigirato al client per i venditori non autorizzati (privacy).
   */
  participantEmails: string[]
}

/** Eventi del calendario condiviso tra due istanti (per overlay disponibilita'). */
export async function listEvents(timeMinIso: string, timeMaxIso: string): Promise<GoogleEvent[]> {
  const calendar = getClient()
  const res = await calendar.events.list({
    calendarId: getCalendarId(),
    timeMin: timeMinIso,
    timeMax: timeMaxIso,
    singleEvents: true,
    orderBy: "startTime",
    maxResults: 2500,
  })
  const items = res.data.items ?? []
  return items.map((ev) => {
    const allDay = Boolean(ev.start?.date && !ev.start?.dateTime)
    // Privacy: per eventi marcati privati mostriamo solo "Occupato" e non
    // esponiamo ne' il link Meet ne' il link all'evento (potrebbero rivelare
    // dettagli riservati di un impegno altrui sul calendario condiviso).
    const isPrivate = ev.visibility === "private"
    // Email dei partecipanti (lowercase, deduplicate): per attribuire una demo
    // creata a mano al venditore invitato. Raccolte sempre (anche se private):
    // restano server-side, non vengono mai esposte al client.
    const emails = new Set<string>()
    const add = (e?: string | null) => {
      const v = (e || "").trim().toLowerCase()
      if (v) emails.add(v)
    }
    add(ev.organizer?.email)
    add(ev.creator?.email)
    for (const a of ev.attendees ?? []) add(a.email)
    return {
      id: ev.id || "",
      title: isPrivate ? "Occupato" : ev.summary || "Occupato",
      start: ev.start?.dateTime || ev.start?.date || null,
      end: ev.end?.dateTime || ev.end?.date || null,
      allDay,
      meetLink: isPrivate ? null : extractMeetLink(ev),
      htmlLink: isPrivate ? null : ev.htmlLink || null,
      participantEmails: Array.from(emails),
    }
  })
}

/**
 * Ritorna gli eventi del calendario condiviso che si SOVRAPPONGONO
 * all'intervallo [startIso, endIso). events.list con timeMin/timeMax ritorna
 * gia' solo gli eventi che intersecano la finestra (terminano dopo timeMin e
 * iniziano prima di timeMax), inclusi gli eventi "tutto il giorno" (ferie/
 * chiusure) che coprono l'intera giornata: quindi se l'array non e' vuoto c'e'
 * un conflitto. Usato per impedire al venditore di prenotare su slot occupati.
 */
export async function getOverlappingEvents(startIso: string, endIso: string): Promise<GoogleEvent[]> {
  return listEvents(startIso, endIso)
}

/** Crea un evento sul calendario condiviso. Ritorna id + link. */
export async function createEvent(input: {
  summary: string
  description?: string
  startIso: string
  endIso: string
  attendeeEmail?: string | null
  timeZone?: string
  /** "tentative" per le bozze "da confermare", "confirmed" per gli eventi finali. */
  status?: "tentative" | "confirmed"
  /** Se true, genera un link Google Meet collegato all'evento (best-effort). */
  withMeet?: boolean
}): Promise<{ id: string; htmlLink: string | null; meetLink: string | null }> {
  const calendar = getClient()
  const timeZone = input.timeZone || "Europe/Rome"
  const requestBody: Record<string, unknown> = {
    summary: input.summary,
    description: input.description,
    start: { dateTime: input.startIso, timeZone },
    end: { dateTime: input.endIso, timeZone },
  }
  if (input.status) requestBody.status = input.status
  if (input.attendeeEmail) {
    requestBody.attendees = [{ email: input.attendeeEmail }]
  }
  if (input.withMeet) {
    // La generazione del Meet via Service Account puo' richiedere Domain-Wide
    // Delegation: la richiediamo, ma il fallimento e' gestito in modo soft
    // (vedi catch sotto) cosi' l'evento viene comunque creato.
    requestBody.conferenceData = {
      createRequest: {
        requestId: `santaddeo-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    }
  }

  try {
    const res = await calendar.events.insert({
      calendarId: getCalendarId(),
      requestBody,
      conferenceDataVersion: input.withMeet ? 1 : 0,
      sendUpdates: input.attendeeEmail ? "all" : "none",
    })
    return {
      id: res.data.id || "",
      htmlLink: res.data.htmlLink || null,
      meetLink: extractMeetLink(res.data),
    }
  } catch (err: any) {
    // Due limiti noti del Service Account senza Domain-Wide Delegation:
    //  1) non puo' generare un Google Meet;
    //  2) non puo' invitare attendees ("Service accounts cannot invite
    //     attendees without Domain-Wide Delegation of Authority").
    // In entrambi i casi l'evento "da confermare" deve comunque essere creato:
    // ritentiamo senza Meet e senza attendees (il lead resta in descrizione).
    const msg = String(err?.errors?.[0]?.message || err?.message || "")
    const needsFallback =
      input.withMeet ||
      Boolean(input.attendeeEmail) ||
      /attendee|domain-wide delegation/i.test(msg)
    if (needsFallback) {
      // Stadio 1: togli gli attendees ma prova a tenere il Meet.
      delete requestBody.attendees
      if (input.withMeet) {
        try {
          const res = await calendar.events.insert({
            calendarId: getCalendarId(),
            requestBody,
            conferenceDataVersion: 1,
            sendUpdates: "none",
          })
          return {
            id: res.data.id || "",
            htmlLink: res.data.htmlLink || null,
            meetLink: extractMeetLink(res.data),
          }
        } catch {
          // Stadio 2: anche il Meet non e' generabile -> evento semplice.
          delete requestBody.conferenceData
        }
      }
      const res = await calendar.events.insert({
        calendarId: getCalendarId(),
        requestBody,
        sendUpdates: "none",
      })
      return { id: res.data.id || "", htmlLink: res.data.htmlLink || null, meetLink: null }
    }
    throw err
  }
}

/** Estrae il link Google Meet da un evento (hangoutLink o conferenceData). */
function extractMeetLink(ev: any): string | null {
  if (ev?.hangoutLink) return ev.hangoutLink as string
  const entry = ev?.conferenceData?.entryPoints?.find((e: any) => e.entryPointType === "video")
  return entry?.uri || null
}

/** Allegato del riepilogo call (note Gemini o registrazione) di un evento. */
export type EventRecapAttachment = {
  fileId: string | null
  title: string | null
  fileUrl: string | null
  mimeType: string | null
}

export type EventRecap = {
  /** Documenti Google (le "Appunti di Gemini" sono Google Docs). */
  notesDocs: EventRecapAttachment[]
  /** Registrazioni video (file MP4 su Drive). */
  recordings: EventRecapAttachment[]
}

const GOOGLE_DOC_MIME = "application/vnd.google-apps.document"

/**
 * Legge gli allegati di un evento e ne estrae il riepilogo della call:
 * - le note di Gemini ("Appunti di Gemini") sono allegate all'evento come
 *   Google Doc (mimeType application/vnd.google-apps.document);
 * - l'eventuale registrazione e' un file video/* su Drive.
 *
 * Fonte CERTA e verificata: Google Meet, quando Gemini prende appunti, allega
 * automaticamente il Doc (e la registrazione, se attiva) all'evento di
 * Calendar dell'organizzatore (clienti@4bid.it). Nessun parsing di email.
 *
 * Ritorna liste vuote se l'evento non esiste o non ha ancora allegati.
 */
export async function getEventRecap(eventId: string): Promise<EventRecap> {
  const calendar = getClient()
  try {
    const res = await calendar.events.get({ calendarId: getCalendarId(), eventId })
    const attachments = (res.data.attachments || []) as Array<{
      fileId?: string
      title?: string
      fileUrl?: string
      mimeType?: string
    }>
    const notesDocs: EventRecapAttachment[] = []
    const recordings: EventRecapAttachment[] = []
    for (const a of attachments) {
      const item: EventRecapAttachment = {
        fileId: a.fileId || null,
        title: a.title || null,
        fileUrl: a.fileUrl || null,
        mimeType: a.mimeType || null,
      }
      if (a.mimeType === GOOGLE_DOC_MIME) notesDocs.push(item)
      else if ((a.mimeType || "").startsWith("video/")) recordings.push(item)
    }
    return { notesDocs, recordings }
  } catch (e) {
    // 404 (evento cancellato) o altri errori: nessun recap.
    console.warn("[calendar] getEventRecap failed:", e instanceof Error ? e.message : e)
    return { notesDocs: [], recordings: [] }
  }
}

/**
 * Tenta di leggere il TESTO di un Google Doc (le note Gemini) esportandolo in
 * text/plain via Drive API. Richiede che la Domain-Wide Delegation del service
 * account autorizzi anche lo scope drive.readonly: finche' non e' abilitato,
 * l'API risponde unauthorized_client e qui ritorniamo null (fallback morbido,
 * si mostra comunque il link al Doc). NON inventiamo mai il contenuto.
 */
export async function getDriveDocText(fileId: string): Promise<string | null> {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL
  const key = (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || "").replace(/\\n/g, "\n")
  if (!email || !key) return null
  try {
    const auth = new google.auth.JWT({
      email,
      key,
      scopes: ["https://www.googleapis.com/auth/drive.readonly"],
      subject: getImpersonateSubject(),
    })
    const drive = google.drive({ version: "v3", auth })
    const res = await drive.files.export({ fileId, mimeType: "text/plain" }, { responseType: "text" })
    const txt = typeof res.data === "string" ? res.data : ""
    return txt.trim() || null
  } catch (e) {
    console.warn("[calendar] getDriveDocText non disponibile (scope Drive?):", e instanceof Error ? e.message : e)
    return null
  }
}

/**
 * Aggiorna un evento esistente (usato per promuovere una bozza "tentative" a
 * "confirmed" quando il super admin accetta la demo). Ritorna id + link.
 */
export async function updateEvent(input: {
  eventId: string
  summary?: string
  description?: string
  status?: "tentative" | "confirmed"
  /** Nuovo orario di inizio (ISO). Usato per lo spostamento (reschedule). */
  startIso?: string
  /** Nuovo orario di fine (ISO). Usato per lo spostamento (reschedule). */
  endIso?: string
  timeZone?: string
  /**
   * Se true, prova ad agganciare un Google Meet all'evento in fase di patch
   * (usato quando si promuove una bozza "tentative" a "confirmed"). Richiede
   * Domain-Wide Delegation attiva + GOOGLE_IMPERSONATE_EMAIL: il fallimento e'
   * gestito in modo soft (l'evento resta aggiornato, senza Meet).
   */
  withMeet?: boolean
}): Promise<{ id: string; htmlLink: string | null; meetLink: string | null }> {
  const calendar = getClient()
  const timeZone = input.timeZone || "Europe/Rome"
  const requestBody: Record<string, unknown> = {}
  if (input.summary !== undefined) requestBody.summary = input.summary
  if (input.description !== undefined) requestBody.description = input.description
  if (input.status !== undefined) requestBody.status = input.status
  if (input.startIso !== undefined) requestBody.start = { dateTime: input.startIso, timeZone }
  if (input.endIso !== undefined) requestBody.end = { dateTime: input.endIso, timeZone }
  if (input.withMeet) {
    requestBody.conferenceData = {
      createRequest: {
        requestId: `santaddeo-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        conferenceSolutionKey: { type: "hangoutsMeet" },
      },
    }
  }
  try {
    const res = await calendar.events.patch({
      calendarId: getCalendarId(),
      eventId: input.eventId,
      requestBody,
      conferenceDataVersion: input.withMeet ? 1 : 0,
      sendUpdates: "all",
    })
    return { id: res.data.id || "", htmlLink: res.data.htmlLink || null, meetLink: extractMeetLink(res.data) }
  } catch (err) {
    // Se il Meet non e' generabile (DWD non ancora attiva), ripeti la patch
    // senza conferenceData cosi' la conferma dell'evento va comunque a buon fine.
    if (input.withMeet) {
      delete requestBody.conferenceData
      const res = await calendar.events.patch({
        calendarId: getCalendarId(),
        eventId: input.eventId,
        requestBody,
        sendUpdates: "all",
      })
      return { id: res.data.id || "", htmlLink: res.data.htmlLink || null, meetLink: extractMeetLink(res.data) }
    }
    throw err
  }
}

/** Cancella un evento (usato per rimuovere la bozza quando la demo e' rifiutata). */
export async function deleteEvent(eventId: string): Promise<void> {
  const calendar = getClient()
  try {
    await calendar.events.delete({ calendarId: getCalendarId(), eventId, sendUpdates: "all" })
  } catch (err: any) {
    // 404/410 = gia' cancellato: non e' un errore per il nostro flusso.
    const code = err?.code || err?.response?.status
    if (code !== 404 && code !== 410) throw err
  }
}
