import "server-only"
import { createServiceRoleClient } from "@/lib/supabase/server"
import {
  createEvent,
  getCalendarId,
  getOverlappingEvents,
  isGoogleCalendarConfigured,
  listEvents,
} from "@/lib/google/calendar"
import { sendEmail } from "@/lib/email"
import { getSuperAdminEmails } from "@/lib/email/get-superadmin-recipients"
import { buildSellerReplyTo, buildSellerFrom } from "@/lib/sales/inbox-config"
import { recordOutboundMessage } from "@/lib/sales/lead-messages"
import { renderSantaddeoEmail } from "@/lib/sales/email-layout"

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || "https://www.santaddeo.com"

/** Opzione "call" scelta dal venditore in fase di invio email. */
export type LeadCallOption =
  | { type: "none" }
  | { type: "meet"; startIso: string; endIso: string }
  | { type: "booking"; durationMinutes?: number }
  // Il venditore propone fino a 3 orari liberi: il lead riceve N pulsanti e ne
  // sceglie uno (pagina pubblica con slot preselezionato).
  | { type: "propose"; slots: { startIso: string; endIso: string }[]; durationMinutes?: number }

const CTA_STYLE =
  "background:#0d9488;color:#ffffff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:bold;display:inline-block"

/** Bottone HTML per il link della call (Meet diretto o link generico). */
export function renderCallButton(href: string, label: string): string {
  return (
    `<div style="margin:24px 0;text-align:center">` +
    `<a href="${href}" style="${CTA_STYLE}">${label}</a>` +
    `</div>`
  )
}

/**
 * Riquadro "call in attesa di conferma" da mostrare al LEAD quando il venditore
 * propone una data/ora precisa: il link alla videochiamata NON viene incluso
 * finche' il super admin non approva (poi parte l'email di conferma con il link).
 */
export function renderPendingCallNotice(start: Date, end: Date): string {
  const when = formatRange(start, end)
  return (
    `<div style="margin:24px 0;padding:16px 20px;border-radius:8px;background:#f0fdfa;border:1px solid #99f6e4">` +
    `<p style="margin:0 0 6px;font-weight:bold;color:#0f766e">Stiamo organizzando la tua demo</p>` +
    `<p style="margin:0;color:#134e4a;line-height:1.5">` +
    `Stiamo organizzando una call per la demo del nostro software per ${when}. ` +
    `Appena confermata, riceverai la conferma via email con il link per la videochiamata.` +
    `</p>` +
    `</div>`
  )
}

function capitalize(s: string): string {
  return s.length > 0 ? s.charAt(0).toUpperCase() + s.slice(1) : s
}

function formatRange(start: Date, end: Date): string {
  const day = start.toLocaleDateString("it-IT", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Europe/Rome",
  })
  const t = (d: Date) =>
    d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" })
  return `${day}, ${t(start)}–${t(end)}`
}

type DraftResult = {
  /** HTML da iniettare nel corpo email (bottone Meet o di prenotazione). */
  html: string | null
  /** Link Meet generato (se type=meet). */
  meetLink: string | null
  /** URL pubblico di prenotazione (se type=booking). */
  bookingUrl: string | null
  /** Eventuale messaggio non bloccante (es. Meet non generato). */
  warning: string | null
}

/**
 * Prepara la "call" associata all'email di un lead.
 *
 * - type=meet: crea una bozza evento `tentative` con Google Meet su
 *   clienti@4bid.it + riga demo_requests pending (da confermare dal super
 *   admin). Ritorna il bottone col link Meet.
 * - type=booking: crea un token di prenotazione (call_booking_links) e ritorna
 *   il bottone verso la pagina pubblica /prenota-call/<token>.
 */
export async function prepareLeadCall(args: {
  option: LeadCallOption
  lead: { id: string; first_name: string; last_name: string; hotel_name: string; email: string }
  agent: { id: string | null; userId: string; name: string; email: string | null }
}): Promise<DraftResult> {
  const { option, lead, agent } = args
  if (option.type === "none") {
    return { html: null, meetLink: null, bookingUrl: null, warning: null }
  }

  const svc = await createServiceRoleClient()
  const leadFullName = `${lead.first_name} ${lead.last_name}`.trim()
  const title = `Demo SANTADDEO - ${lead.hotel_name || leadFullName}`

  if (option.type === "meet") {
    const start = new Date(option.startIso)
    const end = new Date(option.endIso)
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) {
      throw new Error("invalid_call_range")
    }

    let meetLink: string | null = null
    let eventId: string | null = null
    let eventLink: string | null = null
    let warning: string | null = null

    if (isGoogleCalendarConfigured()) {
      // Blocca se lo slot e' occupato (ignorando gli eventi "tutto il giorno",
      // che sono promemoria/note e non chiusure reali).
      const overlaps = (await getOverlappingEvents(start.toISOString(), end.toISOString())).filter(
        (e) => !e.allDay,
      )
      if (overlaps.length > 0) {
        throw new Error("slot_unavailable")
      }
      const created = await createEvent({
        summary: `[DA CONFERMARE] ${title}`,
        description:
          `Richiesta di demo da confermare.\n` +
          `Lead: ${leadFullName} (${lead.email})\n` +
          `Struttura: ${lead.hotel_name || "n/d"}\n` +
          `Venditore: ${agent.name}\n\n` +
          `Approva o rifiuta dalla sezione "Richieste demo" della piattaforma.`,
        startIso: start.toISOString(),
        endIso: end.toISOString(),
        attendeeEmail: lead.email,
        status: "tentative",
        withMeet: true,
      })
      eventId = created.id || null
      eventLink = created.htmlLink
      meetLink = created.meetLink
      if (!meetLink) {
        warning =
          "Evento creato, ma il link Google Meet non e' stato generato automaticamente. Verra' aggiunto manualmente o all'approvazione."
      }
    }

    // Riga demo_requests pending (riusa il flusso di approvazione super admin).
    await svc.from("demo_requests").insert({
      agent_id: agent.id,
      requested_by: agent.userId,
      lead_id: lead.id,
      title,
      notes: `Call diretta proposta dal venditore al lead ${leadFullName}.`,
      requested_start: start.toISOString(),
      requested_end: end.toISOString(),
      attendee_email: lead.email,
      google_event_id: eventId,
      google_event_link: eventLink,
      meet_link: meetLink,
      status: "pending",
    })

    await notifySuperAdmin({
      title,
      agentName: agent.name,
      start,
      end,
      eventLink,
      extra: meetLink ? `Link Meet: ${meetLink}` : null,
    })

    // Il LEAD NON deve ricevere il link alla call finche' il super admin non
    // approva: mostriamo solo un avviso "stiamo organizzando la demo". Il link
    // Meet partira' con l'email di conferma all'approvazione.
    const html = renderPendingCallNotice(start, end)
    return { html, meetLink, bookingUrl: null, warning }
  }

  if (option.type === "propose") {
    // Normalizza/valida gli slot proposti (1-3, futuri, ordinati).
    const duration = option.durationMinutes && option.durationMinutes > 0 ? option.durationMinutes : 30
    const slots = (option.slots || [])
      .map((s) => ({ start: new Date(s.startIso), end: new Date(s.endIso) }))
      .filter((s) => !isNaN(s.start.getTime()) && !isNaN(s.end.getTime()) && s.end > s.start && s.start.getTime() > Date.now())
      .sort((a, b) => a.start.getTime() - b.start.getTime())
      .slice(0, 3)
    if (slots.length === 0) throw new Error("no_valid_slots")

    // Token di prenotazione che "ricorda" gli orari proposti: la pagina pubblica
    // mostrerà solo questi e preselezionerà quello cliccato (?slot=).
    const { data, error } = await svc
      .from("call_booking_links")
      .insert({
        lead_id: lead.id,
        agent_id: agent.id,
        requested_by: agent.userId,
        duration_minutes: duration,
        proposed_slots: slots.map((s) => ({ startIso: s.start.toISOString(), endIso: s.end.toISOString() })),
        expires_at: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString(),
      })
      .select("token")
      .single()
    if (error || !data) throw new Error(error?.message || "booking_link_failed")

    const baseUrl = `${SITE_URL}/prenota-call/${data.token}`
    // Layout email-safe: una tabella con un bottone per RIGA (no flex/gap, che
    // Gmail/Outlook rimuovono facendo collassare i bottoni in fila).
    const rows = slots
      .map((s) => {
        const href = `${baseUrl}?slot=${encodeURIComponent(s.start.toISOString())}`
        return (
          `<tr><td style="padding:6px 0;text-align:center">` +
          `<a href="${href}" style="${CTA_STYLE};display:block;min-width:260px;text-align:center">` +
          `${capitalize(formatRange(s.start, s.end))}` +
          `</a>` +
          `</td></tr>`
        )
      })
      .join("")
    const html =
      `<div style="margin:24px 0">` +
      `<p style="margin:0 0 12px;font-weight:bold;color:#0f172a">Scegli l'orario che preferisci per la demo:</p>` +
      `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto"><tbody>${rows}</tbody></table>` +
      `<p style="margin:12px 0 0;font-size:13px;color:#64748b">Clicca un orario per confermare; riceverai poi l'invito con il link alla videochiamata.</p>` +
      `</div>`
    return { html, meetLink: null, bookingUrl: baseUrl, warning: null }
  }

  // option.type === "booking"
  const duration = option.durationMinutes && option.durationMinutes > 0 ? option.durationMinutes : 30
  const { data, error } = await svc
    .from("call_booking_links")
    .insert({
      lead_id: lead.id,
      agent_id: agent.id,
      requested_by: agent.userId,
      duration_minutes: duration,
      expires_at: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString(), // 30 giorni
    })
    .select("token")
    .single()

  if (error || !data) {
    throw new Error(error?.message || "booking_link_failed")
  }

  const bookingUrl = `${SITE_URL}/prenota-call/${data.token}`
  const html = renderCallButton(bookingUrl, "Prenota la tua call")
  return { html, meetLink: null, bookingUrl, warning: null }
}

/**
 * Conferma uno slot scelto dal lead dalla pagina pubblica di prenotazione.
 * Crea una bozza evento "tentative" con Meet + demo_request pending (da
 * confermare dal super admin) e marca il link come usato.
 */
export async function confirmLeadBooking(args: {
  token: string
  startIso: string
}): Promise<{ when: string }> {
  const svc = await createServiceRoleClient()

  const { data: link } = await svc
    .from("call_booking_links")
    .select("id, lead_id, agent_id, requested_by, duration_minutes, expires_at, used_at")
    .eq("token", args.token)
    .maybeSingle()

  if (!link) throw new Error("not_found")
  if (link.used_at) throw new Error("used")
  if (link.expires_at && new Date(link.expires_at).getTime() < Date.now()) throw new Error("expired")

  const start = new Date(args.startIso)
  if (isNaN(start.getTime()) || start.getTime() <= Date.now()) throw new Error("slot_unavailable")
  const end = new Date(start.getTime() + (link.duration_minutes || 30) * 60 * 1000)

  // Dati lead + venditore per popolare evento e notifica.
  let leadName = "Lead"
  let leadEmail: string | null = null
  let hotelName: string | null = null
  if (link.lead_id) {
    const { data: lead } = await svc
      .from("sales_leads")
      .select("first_name, last_name, hotel_name, email")
      .eq("id", link.lead_id)
      .maybeSingle()
    if (lead) {
      leadName = `${lead.first_name} ${lead.last_name}`.trim()
      leadEmail = lead.email
      hotelName = lead.hotel_name
    }
  }
  let agentName = "il team SANTADDEO"
  let agentEmail: string | null = null
  if (link.agent_id) {
    const { data: agent } = await svc
      .from("sales_agents")
      .select("display_name, email")
      .eq("id", link.agent_id)
      .maybeSingle()
    if (agent?.display_name) agentName = agent.display_name
    if (agent?.email) agentEmail = agent.email
  }

  const title = `Demo SANTADDEO - ${hotelName || leadName}`

  let eventId: string | null = null
  let eventLink: string | null = null
  let meetLink: string | null = null

  if (isGoogleCalendarConfigured()) {
    // Ricontrolla la disponibilità: lo slot potrebbe essersi occupato (gli
    // eventi "tutto il giorno" non contano come occupato).
    const overlaps = (await getOverlappingEvents(start.toISOString(), end.toISOString())).filter((e) => !e.allDay)
    if (overlaps.length > 0) throw new Error("slot_unavailable")

    const created = await createEvent({
      summary: `[DA CONFERMARE] ${title}`,
      description:
        `Prenotazione effettuata dal lead dalla pagina pubblica.\n` +
        `Lead: ${leadName}${leadEmail ? ` (${leadEmail})` : ""}\n` +
        `Struttura: ${hotelName || "n/d"}\n` +
        `Venditore: ${agentName}\n\n` +
        `Approva o rifiuta dalla sezione "Richieste demo" della piattaforma.`,
      startIso: start.toISOString(),
      endIso: end.toISOString(),
      attendeeEmail: leadEmail,
      status: "tentative",
      withMeet: true,
    })
    eventId = created.id || null
    eventLink = created.htmlLink
    meetLink = created.meetLink
  }

  const { data: demo } = await svc
    .from("demo_requests")
    .insert({
      agent_id: link.agent_id,
      requested_by: link.requested_by,
      lead_id: link.lead_id,
      title,
      notes: `Prenotazione dal lead ${leadName} (pagina pubblica).`,
      requested_start: start.toISOString(),
      requested_end: end.toISOString(),
      attendee_email: leadEmail,
      google_event_id: eventId,
      google_event_link: eventLink,
      meet_link: meetLink,
      status: "pending",
    })
    .select("id")
    .single()

  // Marca il link come usato (one-shot).
  await svc
    .from("call_booking_links")
    .update({ used_at: new Date().toISOString(), demo_request_id: demo?.id ?? null })
    .eq("id", link.id)

  await notifySuperAdmin({
    title,
    agentName,
    start,
    end,
    eventLink,
    extra: `Prenotata dal lead${meetLink ? ` — Link Meet: ${meetLink}` : ""}`,
  })

  // Avvisa anche il VENDITORE proprietario del lead: e' lui che deve presentarsi
  // alla call. Best-effort, non blocca la conferma.
  await notifyAgentBooking({
    agentEmail,
    agentName,
    leadName,
    hotelName,
    start,
    end,
    meetLink,
    eventLink,
  })

  return { when: formatRange(start, end) }
}

/**
 * Genera gli slot liberi prenotabili in una finestra di giorni, escludendo
 * gli orari occupati sul calendario clienti@4bid.it.
 *
 * Regole: lun-ven, fascia 9:00-18:00 (Europe/Rome), slot della durata indicata.
 */
const ROME_TZ = "Europe/Rome"

/** Offset (ms) del fuso Europe/Rome rispetto a UTC per un dato istante. */
function romeOffsetMs(date: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: ROME_TZ,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
  const p = Object.fromEntries(dtf.formatToParts(date).map((x) => [x.type, x.value])) as Record<string, string>
  const asLocal = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour === 24 ? 0 : +p.hour, +p.minute, +p.second)
  return asLocal - date.getTime()
}

/** Converte un orario "da parete" italiano (Y/M/D hh:mm) nell'istante UTC. */
function romeWallToUtc(y: number, m: number, d: number, hh: number, mm: number): Date {
  const asUtc = Date.UTC(y, m, d, hh, mm, 0)
  const offset = romeOffsetMs(new Date(asUtc))
  return new Date(asUtc - offset)
}

/** Componenti calendario (anno/mese/giorno) di una data nel fuso italiano. */
function romeDateParts(date: Date): { y: number; m: number; d: number } {
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone: ROME_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
  const p = Object.fromEntries(dtf.formatToParts(date).map((x) => [x.type, x.value])) as Record<string, string>
  return { y: +p.year, m: +p.month - 1, d: +p.day }
}

export async function getFreeSlots(args: {
  fromDate: Date
  days: number
  durationMinutes: number
}): Promise<{ startIso: string; endIso: string }[]> {
  const { fromDate, days, durationMinutes } = args
  const slots: { startIso: string; endIso: string }[] = []

  if (!isGoogleCalendarConfigured()) return slots

  // Finestra di ricerca: da oggi a +days (con margine per coprire l'ultimo giorno).
  const windowStart = new Date(fromDate)
  const windowEnd = new Date(fromDate.getTime() + (days + 1) * 24 * 60 * 60 * 1000)

  const busy = await listEvents(windowStart.toISOString(), windowEnd.toISOString())
  // Gli eventi "tutto il giorno" (promemoria/note informative sul calendario
  // condiviso) NON bloccano una call a orario fisso: consideriamo occupati solo
  // gli eventi con orario di inizio/fine.
  const busyRanges = busy
    .filter((e) => e.start && e.end && !e.allDay)
    .map((e) => ({ start: new Date(e.start as string).getTime(), end: new Date(e.end as string).getTime() }))

  const now = Date.now()
  const WORK_START_HOUR = 9
  const WORK_END_HOUR = 18

  // Itera sui giorni di calendario italiani a partire da oggi.
  const start = romeDateParts(fromDate)
  for (let i = 0; i < days; i++) {
    const cal = new Date(Date.UTC(start.y, start.m, start.d))
    cal.setUTCDate(cal.getUTCDate() + i)
    const y = cal.getUTCFullYear()
    const m = cal.getUTCMonth()
    const d = cal.getUTCDate()
    const dow = cal.getUTCDay() // 0 dom, 6 sab (data-only -> weekday corretto)
    if (dow === 0 || dow === 6) continue

    // Limite di fine giornata (18:00 ora italiana) come istante UTC.
    const dayEnd = romeWallToUtc(y, m, d, WORK_END_HOUR, 0).getTime()

    for (let h = WORK_START_HOUR; h < WORK_END_HOUR; h++) {
      for (let min = 0; min < 60; min += durationMinutes) {
        const slotStart = romeWallToUtc(y, m, d, h, min)
        const s = slotStart.getTime()
        const e = s + durationMinutes * 60 * 1000
        if (e > dayEnd) continue // lo slot uscirebbe dall'orario di lavoro
        if (s <= now) continue // niente slot nel passato

        const overlaps = busyRanges.some((b) => s < b.end && e > b.start)
        if (overlaps) continue

        slots.push({ startIso: slotStart.toISOString(), endIso: new Date(e).toISOString() })
      }
    }
  }
  return slots
}

/** Notifica il super admin di una nuova richiesta demo (best-effort). */
async function notifySuperAdmin(args: {
  title: string
  agentName: string
  start: Date
  end: Date
  eventLink: string | null
  extra: string | null
}) {
  try {
    const recipients = await getSuperAdminEmails()
    if (recipients.length === 0) return
    const when = formatRange(args.start, args.end)
    const html =
      `<div style="font-family:system-ui,sans-serif;line-height:1.5;color:#111">` +
      `<h2 style="margin:0 0 12px">Nuova richiesta di demo</h2>` +
      `<p><strong>${args.agentName}</strong> ha proposto una call a un lead.</p>` +
      `<p><strong>Quando:</strong> ${when}<br/><strong>Titolo:</strong> ${args.title}</p>` +
      (args.extra ? `<p>${args.extra}</p>` : "") +
      (args.eventLink ? `<p>Bozza "da confermare": <a href="${args.eventLink}">apri evento</a>.</p>` : "") +
      `<p>Approva o rifiuta dalla sezione <em>Richieste demo</em> della piattaforma.</p>` +
      `</div>`
    await sendEmail({
      to: recipients,
      subject: `Nuova richiesta demo — ${args.title} (${when})`,
      html,
      type: "demo_request",
      metadata: { calendarId: getCalendarId() || undefined },
    })
  } catch (err) {
    console.error("[lead-call] notify failed:", err instanceof Error ? err.message : err)
  }
}

export { formatRange as formatCallRange, notifySuperAdmin as notifyCallSuperAdmin }

/**
 * Email di CONFERMA inviate quando il super admin APPROVA una richiesta demo.
 * Vanno sia al LEAD (con il link alla videochiamata) sia al VENDITORE.
 * Best-effort: gli errori vengono loggati ma non propagati.
 *
 * Il link alla call e' il Google Meet se disponibile, altrimenti il link
 * all'evento di Google Calendar.
 */
export async function sendDemoConfirmationEmails(args: {
  leadEmail: string | null
  leadName: string | null
  agentEmail: string | null
  agentName: string | null
  hotelName: string | null
  title: string
  start: Date
  end: Date
  meetLink: string | null
  eventLink: string | null
  /** Cellulare del venditore per la firma in calce (se impostato). */
  agentPhone?: string | null
  /** Alias santaddeo.com del venditore, mostrato in firma oltre all'email personale. */
  agentAliasEmail?: string | null
  /** Se presente, l'email al lead viene registrata come messaggio outbound
   *  cosi' la risposta del cliente si aggancia al thread (match per header). */
  leadId?: string | null
  salesAgentId?: string | null
}): Promise<void> {
  // Firma del venditore mostrata in calce alle email indirizzate al LEAD.
  const sellerSignature = {
    name: args.agentName,
    email: args.agentEmail,
    aliasEmail: args.agentAliasEmail ?? null,
    phone: args.agentPhone ?? null,
  }
  // Identita' venditore: From dall'alias @santaddeo.com (se verificato),
  // altrimenti default noreply. Reply-To all'alias (fallback ibrido).
  const sellerFrom = buildSellerFrom(args.agentAliasEmail, args.agentName) ?? undefined
  const sellerReplyTo = buildSellerReplyTo(args.agentAliasEmail, args.agentEmail)
  const sellerFromForRecord =
    args.agentAliasEmail && sellerFrom
      ? String(args.agentAliasEmail).trim().toLowerCase()
      : process.env.SMTP_USER || "noreply@santaddeo.com"
  const when = formatRange(args.start, args.end)
  // Per il VENDITORE va bene anche il link interno all'evento Google.
  const agentCallHref = args.meetLink || args.eventLink
  const agentCallBlock = agentCallHref
    ? renderCallButton(agentCallHref, args.meetLink ? "Partecipa alla videochiamata" : "Apri l'evento")
    : ""
  const meetLine = args.meetLink
    ? `<p style="text-align:center;color:#555;font-size:13px;margin:-8px 0 0">${args.meetLink}</p>`
    : ""

  // 1) Email al LEAD con il link alla call.
  if (args.leadEmail) {
    try {
      const greeting = args.leadName ? `Ciao ${args.leadName},` : "Ciao,"
      // IMPORTANTE: al LEAD mostriamo SOLO un vero link alla videochiamata
      // (Google Meet). Il link "evento" di Google Calendar e' interno al
      // calendario di clienti@4bid.it e il lead NON puo' aprirlo: in sua
      // assenza diamo istruzioni chiare invece di un bottone inutilizzabile.
      const leadCallBlock = args.meetLink
        ? renderCallButton(args.meetLink, "Partecipa alla videochiamata") + meetLine
        : `<p style="margin:16px 0;padding:12px 16px;background:#f0fdfa;border:1px solid #99f6e4;border-radius:8px;color:#0f766e">` +
          `Riceverai a breve il link per collegarti alla videochiamata. ` +
          `Se non lo ricevi, rispondi pure a questa email e te lo inviamo subito.` +
          `</p>`
      const html = renderSantaddeoEmail({
        preheader: `La tua demo SANTADDEO è confermata per ${when}`,
        signature: sellerSignature,
        bodyHtml:
          `<h1 style="margin:0 0 12px;font-size:20px;color:#0f172a">La tua demo è confermata</h1>` +
          `<p>${greeting}</p>` +
          `<p>La call per la demo di SANTADDEO è stata confermata per:</p>` +
          `<p style="font-size:16px;font-weight:bold;color:#0f766e">${when}</p>` +
          leadCallBlock +
          `<p style="margin-top:16px;color:#64748b">Ti aspettiamo! In caso di imprevisti rispondi pure a questa email.</p>`,
      })
      const sendRes = await sendEmail({
        to: args.leadEmail,
        subject: `Demo SANTADDEO confermata — ${when}`,
        html,
        type: "demo_request",
        // From dall'alias venditore (se verificato), altrimenti default noreply.
        from: sellerFrom,
        // Reply-To all'alias venditore (fallback ibrido se manca l'alias).
        replyTo: sellerReplyTo,
        metadata: { calendarId: getCalendarId() || undefined },
      })
      // Registra l'email come messaggio outbound: salva il Message-ID sul lead
      // cosi' la risposta del cliente si aggancia al thread via In-Reply-To.
      if (args.leadId && sendRes.success) {
        await recordOutboundMessage({
          leadId: args.leadId,
          salesAgentId: args.salesAgentId ?? null,
          fromEmail: sellerFromForRecord,
          toEmail: args.leadEmail,
          subject: `Demo SANTADDEO confermata — ${when}`,
          bodyHtml: html,
          messageId: sendRes.messageId ?? null,
        })
      }
    } catch (err) {
      console.error("[lead-call] confirmation email to lead failed:", err instanceof Error ? err.message : err)
    }
  }

  // 2) Email al VENDITORE che deve presentarsi alla call.
  if (args.agentEmail) {
    try {
      const html = renderSantaddeoEmail({
        preheader: `Demo confermata — ${when}`,
        bodyHtml:
          `<h1 style="margin:0 0 12px;font-size:20px;color:#0f172a">Demo confermata</h1>` +
          `<p>La demo${args.hotelName ? ` per <strong>${args.hotelName}</strong>` : ""}` +
          `${args.leadName ? ` (${args.leadName})` : ""} è stata confermata.</p>` +
          `<p><strong>Quando:</strong> ${when}</p>` +
          agentCallBlock +
          meetLine +
          (!args.meetLink
            ? `<p style="margin-top:8px;color:#b45309;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:10px 14px">` +
              `Attenzione: non è stato generato un link Google Meet automatico, quindi al lead non è stato inviato alcun link alla call. ` +
              `Invia tu manualmente al cliente il link della videochiamata (Meet/Zoom/Teams).` +
              `</p>`
            : "") +
          `<p style="margin-top:16px"><a href="${SITE_URL}/sales/calendar" style="color:#0d9488">Apri il tuo calendario</a></p>`,
      })
      await sendEmail({
        to: args.agentEmail,
        subject: `Demo confermata — ${args.title} (${when})`,
        html,
        type: "demo_request",
      })
    } catch (err) {
      console.error("[lead-call] confirmation email to agent failed:", err instanceof Error ? err.message : err)
    }
  }
}

/**
 * Avvisa il VENDITORE via email che un suo lead ha prenotato una call.
 * Best-effort: gli errori vengono loggati ma non propagati.
 */
async function notifyAgentBooking(args: {
  agentEmail: string | null
  agentName: string
  leadName: string
  hotelName: string | null
  start: Date
  end: Date
  meetLink: string | null
  eventLink: string | null
}) {
  if (!args.agentEmail) return
  try {
    const when = formatRange(args.start, args.end)
    const html =
      `<div style="font-family:system-ui,sans-serif;line-height:1.5;color:#111">` +
      `<h2 style="margin:0 0 12px">Un tuo lead ha prenotato una call</h2>` +
      `<p><strong>${args.leadName}</strong>${args.hotelName ? ` (${args.hotelName})` : ""} ` +
      `ha scelto uno slot per una demo.</p>` +
      `<p><strong>Quando:</strong> ${when}</p>` +
      (args.meetLink ? `<p><strong>Google Meet:</strong> <a href="${args.meetLink}">${args.meetLink}</a></p>` : "") +
      (args.eventLink ? `<p>Evento sul calendario: <a href="${args.eventLink}">apri</a>.</p>` : "") +
      `<p style="color:#555">La call è <em>da confermare</em>: riceverai conferma quando verrà approvata.</p>` +
      `<p><a href="${SITE_URL}/sales/calendar">Apri il tuo calendario</a></p>` +
      `</div>`
    await sendEmail({
      to: args.agentEmail,
      subject: `Nuova call prenotata da ${args.leadName} (${when})`,
      html,
      type: "demo_request",
    })
  } catch (err) {
    console.error("[lead-call] notifyAgentBooking failed:", err instanceof Error ? err.message : err)
  }
}
