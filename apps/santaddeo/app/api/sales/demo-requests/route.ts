import { type NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { getAuthUserOrDev } from "@/lib/auth/getAuthUserOrDev"
import {
  createEvent,
  getCalendarId,
  getOverlappingEvents,
  isGoogleCalendarConfigured,
} from "@/lib/google/calendar"
import { sendEmail } from "@/lib/email"
import { getSuperAdminEmails } from "@/lib/email/get-superadmin-recipients"
import { renderPendingCallNotice } from "@/lib/sales/lead-call"
import { renderSantaddeoEmail } from "@/lib/sales/email-layout"
import { buildSellerFrom, buildSellerReplyTo } from "@/lib/sales/inbox-config"

export const dynamic = "force-dynamic"

/** Risolve l'agente (sales_agents) collegato all'utente loggato. */
async function resolveAgent(svc: Awaited<ReturnType<typeof createServiceRoleClient>>, userId: string) {
  const { data } = await svc
    .from("sales_agents")
    .select("id, display_name, email, phone, sender_email")
    .eq("user_id", userId)
    .eq("is_active", true)
    .maybeSingle()
  return data
}

/**
 * GET /api/sales/demo-requests
 * Ritorna le richieste di demo create dal venditore loggato.
 */
export async function GET() {
  const { user } = await getAuthUserOrDev()
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  const svc = await createServiceRoleClient()
  const agent = await resolveAgent(svc, user.id)
  if (!agent) return NextResponse.json({ requests: [] })

  const { data, error } = await svc
    .from("demo_requests")
    .select(
      "id, prospect_id, title, notes, requested_start, requested_end, status, google_event_link, decision_notes, decided_at, created_at, prospects:prospect_id(id, name, city)",
    )
    .eq("agent_id", agent.id)
    .order("requested_start", { ascending: false })
    .limit(200)

  if (error) {
    console.error("[sales/demo-requests/GET]", error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ requests: data ?? [] })
}

/**
 * POST /api/sales/demo-requests
 * Crea una richiesta di demo (status=pending). Non tocca Google: l'evento
 * viene creato solo all'accettazione da parte del super admin (clienti@4bid.it).
 *
 * Body: { prospect_id?, title?, notes?, requested_start (ISO), requested_end (ISO) }
 */
export async function POST(request: NextRequest) {
  const { user } = await getAuthUserOrDev()
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  const svc = await createServiceRoleClient()
  const agent = await resolveAgent(svc, user.id)
  if (!agent) {
    return NextResponse.json({ error: "not_an_agent" }, { status: 403 })
  }

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 })
  }

  const startIso = body?.requested_start
  const endIso = body?.requested_end
  if (!startIso || !endIso) {
    return NextResponse.json({ error: "start_end_required" }, { status: 400 })
  }
  const start = new Date(startIso)
  const end = new Date(endIso)
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) {
    return NextResponse.json({ error: "invalid_range" }, { status: 400 })
  }

  // Titolo: usa quello passato, altrimenti deriva dal prospect.
  let title = (body?.title || "").toString().trim()
  let prospectId: string | null = body?.prospect_id || null
  let prospectEmail: string | null = null
  let prospectName: string | null = null
  if (prospectId) {
    const { data: p } = await svc
      .from("prospects")
      .select("id, name, email")
      .eq("id", prospectId)
      .maybeSingle()
    if (!p) prospectId = null
    else {
      prospectName = p.name || null
      prospectEmail = (p.email || "").trim() || null
      if (!title) title = `Demo Santaddeo - ${p.name}`
    }
  }
  if (!title) title = "Demo Santaddeo"

  // ── 1. Controllo disponibilita': blocca se l'orario si sovrappone a un
  //    evento gia' presente sul calendario clienti@4bid.it (incluse le
  //    giornate "tutto il giorno" tipo ferie/chiusure). Se Google non e'
  //    configurato non blocchiamo (fail-open) ma lo segnaliamo nel log.
  const googleReady = isGoogleCalendarConfigured()
  if (googleReady) {
    try {
      const overlaps = await getOverlappingEvents(start.toISOString(), end.toISOString())
      if (overlaps.length > 0) {
        const first = overlaps[0]
        return NextResponse.json(
          {
            error: "slot_unavailable",
            message:
              "L'orario selezionato non e' disponibile: si sovrappone a un impegno gia' presente sul calendario. Scegli un altro orario.",
            conflict: { title: first.title, start: first.start, end: first.end, allDay: first.allDay },
          },
          { status: 409 },
        )
      }
    } catch (err) {
      console.error("[sales/demo-requests/POST] availability check failed:", err instanceof Error ? err.message : err)
      // Errore tecnico nel controllo: non possiamo garantire la disponibilita'
      // -> blocchiamo in modo conservativo per non creare doppie prenotazioni.
      return NextResponse.json(
        { error: "availability_check_failed", message: "Impossibile verificare la disponibilita' del calendario. Riprova." },
        { status: 503 },
      )
    }
  }

  // ── 2. Crea una BOZZA evento (status=tentative, "da confermare") sul
  //    calendario clienti@4bid.it: cosi l'impegno e' subito visibile e lo slot
  //    risulta occupato per le richieste successive. Verra' promosso a
  //    "confirmed" all'accettazione o cancellato al rifiuto.
  let draftEventId: string | null = null
  let draftEventLink: string | null = null
  if (googleReady) {
    try {
      const created = await createEvent({
        summary: `[DA CONFERMARE] ${title}`,
        description:
          `Richiesta di demo da confermare.\n` +
          (prospectName ? `Struttura: ${prospectName}\n` : "") +
          (prospectEmail ? `Email lead: ${prospectEmail}\n` : "") +
          `Venditore: ${agent.display_name || agent.email || "n/d"}\n` +
          (body?.notes ? `\nNote: ${(body.notes || "").toString().trim()}\n` : "") +
          `\nApprova o rifiuta dalla sezione "Richieste demo" della piattaforma.`,
        startIso: start.toISOString(),
        endIso: end.toISOString(),
        attendeeEmail: prospectEmail,
        status: "tentative",
      })
      draftEventId = created.id || null
      draftEventLink = created.htmlLink
    } catch (err) {
      console.error("[sales/demo-requests/POST] draft event failed:", err instanceof Error ? err.message : err)
      // La bozza e' best-effort: se fallisce, proseguiamo comunque con la riga
      // pending (il super admin creera' l'evento all'accettazione).
    }
  }

  const { data, error } = await svc
    .from("demo_requests")
    .insert({
      agent_id: agent.id,
      requested_by: user.id,
      prospect_id: prospectId,
      title,
      notes: (body?.notes || "").toString().trim() || null,
      requested_start: start.toISOString(),
      requested_end: end.toISOString(),
      // Destinatario della futura conferma: il LEAD/prospect, NON il venditore.
      attendee_email: prospectEmail,
      google_event_id: draftEventId,
      google_event_link: draftEventLink,
      status: "pending",
    })
    .select("id")
    .single()

  if (error) {
    console.error("[sales/demo-requests/POST]", error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // ── 3. Avvisa il super admin via email (il badge "Richieste demo" copre
  //    gia' la notifica in-app). Best-effort: non fa fallire la richiesta.
  await notifyDemoRequest({
    title,
    agentName: agent.display_name || agent.email || "Un venditore",
    start,
    end,
    notes: (body?.notes || "").toString().trim() || null,
    eventLink: draftEventLink,
  })

  // ── 4. Preavviso al LEAD/prospect: "stiamo organizzando la demo", senza
  //    link Meet (il link partira' con la conferma all'approvazione). Stesso
  //    riquadro usato dal percorso email-lead. Best-effort.
  if (prospectEmail) {
    try {
      const greeting = prospectName ? `Ciao ${prospectName},` : "Buongiorno,"
      const html = renderSantaddeoEmail({
        preheader: `Stiamo organizzando la tua demo SANTADDEO`,
        signature: { name: agent.display_name, email: agent.email, aliasEmail: agent.sender_email ?? null, phone: agent.phone },
        bodyHtml:
          `<p>${greeting}</p>` +
          `<p>grazie per l'interesse verso SANTADDEO. Stiamo organizzando la demo del nostro software.</p>` +
          renderPendingCallNotice(start, end),
      })
      await sendEmail({
        to: prospectEmail,
        subject: `Demo SANTADDEO in programmazione — ${formatRange(start, end)}`,
        html,
        type: "demo_request",
        // From dall'alias venditore (se verificato), Reply-To all'alias.
        from: buildSellerFrom(agent.sender_email, agent.display_name) ?? undefined,
        replyTo: buildSellerReplyTo(agent.sender_email, agent.email),
        metadata: { calendarId: getCalendarId() || undefined },
      })
    } catch (err) {
      console.error(
        "[sales/demo-requests/POST] lead pre-notice email failed:",
        err instanceof Error ? err.message : err,
      )
    }
  }

  return NextResponse.json({ ok: true, id: data.id, google_event_link: draftEventLink })
}

/** Formatta un intervallo in italiano per notifica/email. */
function formatRange(start: Date, end: Date): string {
  const day = start.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Rome" })
  const t = (d: Date) => d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" })
  return `${day}, ${t(start)}–${t(end)}`
}

/**
 * Notifica la nuova richiesta di demo al super admin via EMAIL
 * (clienti@4bid.it incluso se e' super_admin).
 *
 * La notifica IN PIATTAFORMA e' gia' coperta dal badge "Richieste demo"
 * (components/superadmin/demo-requests-link.tsx), che fa polling sul numero di
 * richieste pending: non usiamo platform_notifications perche' e' un canale
 * broadcast a TUTTI gli utenti (non mirato al super admin) e accetta solo i
 * type 'release'/'announcement'.
 *
 * Best-effort: gli errori vengono loggati ma non propagati.
 */
async function notifyDemoRequest(
  args: { title: string; agentName: string; start: Date; end: Date; notes: string | null; eventLink: string | null },
) {
  const when = formatRange(args.start, args.end)

  // Email ai super admin
  try {
    const recipients = await getSuperAdminEmails()
    if (recipients.length > 0) {
      const html = renderSantaddeoEmail({
        preheader: `Nuova richiesta demo — ${args.title}`,
        bodyHtml:
          `<h1 style="margin:0 0 12px;font-size:20px;color:#0f172a">Nuova richiesta di demo</h1>` +
          `<p><strong>${args.agentName}</strong> ha richiesto una demo.</p>` +
          `<p><strong>Quando:</strong> ${when}<br/>` +
          `<strong>Titolo:</strong> ${args.title}` +
          (args.notes ? `<br/><strong>Note:</strong> ${args.notes}` : "") +
          `</p>` +
          (args.eventLink
            ? `<p>È stata creata una bozza "da confermare" sul calendario: ` +
              `<a href="${args.eventLink}" style="color:#0d9488">apri evento</a>.</p>`
            : "") +
          `<p>Approva o rifiuta dalla sezione <em>Richieste demo</em> della piattaforma.</p>`,
      })
      await sendEmail({
        to: recipients,
        subject: `Nuova richiesta demo — ${args.title} (${when})`,
        html,
        type: "demo_request",
        metadata: { calendarId: getCalendarId() || undefined },
      })
    }
  } catch (err) {
    console.error("[sales/demo-requests/POST] notification email failed:", err instanceof Error ? err.message : err)
  }
}
