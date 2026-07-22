import { NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { getAuthUserOrDev } from "@/lib/auth/getAuthUserOrDev"
import { sendEmail } from "@/lib/email"
import { buildSellerReplyTo, buildSellerFrom, getArchiveBccAddress, getSalesInboxConfig } from "@/lib/sales/inbox-config"
import { recordOutboundMessage } from "@/lib/sales/lead-messages"
import { prepareLeadCall, type LeadCallOption } from "@/lib/sales/lead-call"
import { renderSantaddeoEmail } from "@/lib/sales/email-layout"
import { sanitizeEmailHtml, emailHtmlToText } from "@/lib/sales/email-sanitize"
import { applyPlaceholders, buildLeadPlaceholders } from "@/lib/sales/lead-email-renderer"
import { parseRecipientList } from "@/lib/sales/email-recipients"

export const dynamic = "force-dynamic"

/**
 * Ritorna la CONVERSAZIONE (thread) di un lead: email inviate dal venditore
 * (outbound) + risposte del cliente (inbound, catturate via IMAP), ordinate
 * cronologicamente.
 *
 * Ownership: il venditore vede solo i propri lead; il super admin tutti.
 * Effetto collaterale: azzera il contatore unread_replies del lead (il
 * venditore/super admin ha "letto" la conversazione aprendola).
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { user, supabase: authSupa } = await getAuthUserOrDev()
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  const { data: profile } = await authSupa
    .from("profiles")
    .select("id, role")
    .eq("id", user.id)
    .single()
  if (!profile || (profile.role !== "sales_agent" && profile.role !== "super_admin")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }

  const svc = await createServiceRoleClient()

  // Verifica esistenza + ownership del lead.
  const { data: lead, error: leadErr } = await svc
    .from("sales_leads")
    .select("id, first_name, last_name, hotel_name, email, sales_agents!inner(user_id)")
    .eq("id", id)
    .maybeSingle()
  if (leadErr) {
    console.error("[sales/leads/messages] lead lookup error:", leadErr)
    return NextResponse.json({ error: "db_error" }, { status: 500 })
  }
  if (!lead) return NextResponse.json({ error: "not_found" }, { status: 404 })

  const agent = (lead as any).sales_agents
  if (profile.role !== "super_admin" && agent?.user_id !== user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }

  const { data: messages, error: msgErr } = await svc
    .from("sales_lead_messages")
    .select("id, direction, from_email, to_email, subject, body_text, body_html, received_at")
    .eq("lead_id", id)
    .order("received_at", { ascending: true })
  if (msgErr) {
    console.error("[sales/leads/messages] messages error:", msgErr)
    return NextResponse.json({ error: "db_error" }, { status: 500 })
  }

  // Apertura del thread = lette le risposte: azzera il badge.
  await svc.from("sales_leads").update({ unread_replies: 0 }).eq("id", id)

  return NextResponse.json({
    lead: {
      id: lead.id,
      first_name: lead.first_name,
      last_name: lead.last_name,
      hotel_name: lead.hotel_name,
      email: lead.email,
    },
    messages: messages ?? [],
  })
}

/**
 * Invia una RISPOSTA del venditore al lead direttamente dalla conversazione.
 *
 * Body: { body: string }  (testo della risposta)
 *
 * - Ownership come la GET (venditore solo sui propri lead, super admin tutti).
 * - Reply-To ibrido (venditore + clienti@4bid.it) per continuare a catturare le
 *   risposte successive via IMAP.
 * - Header In-Reply-To/References agganciati all'ultimo messaggio del thread,
 *   cosi' il client email del lead la mostra nello stesso filo.
 * - Registra il messaggio in uscita nel thread.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { user, supabase: authSupa } = await getAuthUserOrDev()
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  const { data: profile } = await authSupa
    .from("profiles")
    .select("id, role")
    .eq("id", user.id)
    .single()
  if (!profile || (profile.role !== "sales_agent" && profile.role !== "super_admin")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }

  const json = await request.json().catch(() => ({}))
  // Supporta sia il testo semplice ({ body }) sia l'HTML formattato dall'editor
  // ({ html }). Se arriva html, lo sanitizziamo e ne deriviamo il testo.
  const rawHtml = (json?.html ?? "").toString().trim()
  const cleanHtml = rawHtml ? sanitizeEmailHtml(rawHtml) : ""
  const text = cleanHtml ? emailHtmlToText(cleanHtml) : (json?.body ?? "").toString().trim()
  // La call e' opzionale: il messaggio puo' contenere solo il link Meet/booking
  // senza testo, quindi non blocchiamo se il corpo e' vuoto ma c'e' una call.
  const callOption = parseCallOption(json?.call_option)
  if (!text && !cleanHtml && callOption.type === "none") {
    return NextResponse.json({ error: "empty_body" }, { status: 400 })
  }
  // Destinatari aggiuntivi opzionali: Cc (copia visibile) e Ccn (copia nascosta).
  const ccList = parseRecipientList(json?.cc)
  const bccUser = parseRecipientList(json?.bcc)

  // Allegati: array di { url, filename, contentType } gia' caricati su Blob.
  const attachments = Array.isArray(json?.attachments)
    ? json.attachments
        .filter((a: any) => a && typeof a.url === "string" && /^https?:\/\//i.test(a.url))
        .slice(0, 10)
        .map((a: any) => ({
          filename: String(a.filename || "allegato").slice(0, 120),
          href: String(a.url),
          contentType: a.contentType ? String(a.contentType) : undefined,
        }))
    : []

  const svc = await createServiceRoleClient()

  // Lead + agente proprietario (serve email/nome agente come mittente logico).
  const { data: lead, error: leadErr } = await svc
    .from("sales_leads")
    .select("id, first_name, last_name, hotel_name, email, last_email_subject, tracking_token, sales_agents!inner(id, user_id, display_name, email, phone, sender_email, sender_name)")
    .eq("id", id)
    .maybeSingle()
  if (leadErr) {
    console.error("[sales/leads/messages POST] lead lookup error:", leadErr)
    return NextResponse.json({ error: "db_error" }, { status: 500 })
  }
  if (!lead) return NextResponse.json({ error: "not_found" }, { status: 404 })
  if (!lead.email) return NextResponse.json({ error: "lead_no_email" }, { status: 422 })

  const agent = (lead as any).sales_agents
  if (profile.role !== "super_admin" && agent?.user_id !== user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }

  // Identita' di invio: di default il VENDITORE proprietario del lead. Il super
  // admin puo' scegliere ("sendAs":"superadmin") di rispondere con la PROPRIA
  // identita' (nome super admin + SANTADDEO), utile per intervenire in prima
  // persona senza impersonare il venditore.
  const sendAsSuperadmin = profile.role === "super_admin" && json?.sendAs === "superadmin"

  let agentName: string
  let agentEmail: string
  let sellerFrom: string | null
  let fromEmailForRecord: string
  let replyToValue: string
  // Alias santaddeo.com da mostrare in firma (solo quando si invia come venditore).
  let signatureAlias: string | null = null

  if (sendAsSuperadmin) {
    const { data: me } = await svc
      .from("profiles")
      .select("first_name, last_name")
      .eq("id", user.id)
      .maybeSingle()
    const adminName = [me?.first_name, me?.last_name].filter(Boolean).join(" ").trim() || "SANTADDEO"
    const inbox = getSalesInboxConfig().address // clienti@4bid.it
    const smtpUser = process.env.SMTP_USER || "noreply@santaddeo.com"
    agentName = adminName
    agentEmail = inbox
    // From deliverable sul dominio santaddeo.com (alias clienti@4bid.it non
    // inviabile da questo SMTP), col nome del super admin + brand.
    sellerFrom = `${adminName} - SANTADDEO <${smtpUser}>`
    fromEmailForRecord = smtpUser
    // Le risposte tornano alla casella piattaforma (catturate via IMAP).
    replyToValue = inbox
  } else {
    agentName = agent?.display_name || "Il tuo consulente SANTADDEO"
    agentEmail = agent?.email || "info@santaddeo.com"
    // Identita' mittente venditore (alias @santaddeo.com verificato) o fallback.
    sellerFrom = buildSellerFrom(agent?.sender_email, agent?.sender_name || agentName)
    fromEmailForRecord =
      agent?.sender_email && sellerFrom
        ? String(agent.sender_email).trim().toLowerCase()
        : process.env.SMTP_USER || "noreply@santaddeo.com"
    replyToValue = buildSellerReplyTo(agent?.sender_email, agentEmail)
    signatureAlias = agent?.sender_email ?? null
  }

  // Oggetto: "Re: <ultimo oggetto>" se disponibile.
  const lastSubject = (lead.last_email_subject || "").toString().trim()
  const subject = lastSubject
    ? lastSubject.toLowerCase().startsWith("re:")
      ? lastSubject
      : `Re: ${lastSubject}`
    : "Risposta da SANTADDEO"

  // Threading: aggancia all'ultimo messaggio del thread (preferendo l'ultima
  // risposta inbound del cliente) tramite In-Reply-To/References.
  const { data: lastMsg } = await svc
    .from("sales_lead_messages")
    .select("message_id, in_reply_to, email_references")
    .eq("lead_id", id)
    .not("message_id", "is", null)
    .order("received_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  const headers: Record<string, string> = {}
  if (lastMsg?.message_id) {
    headers["In-Reply-To"] = lastMsg.message_id
    headers["References"] = [lastMsg.email_references, lastMsg.message_id].filter(Boolean).join(" ")
  }

  // Risolve i placeholder ({{nome_venditore}}, {{link_signup}}, ...) lasciati
  // dal composer (es. risposte predefinite) PRIMA di costruire/inviare la mail.
  const placeholders = buildLeadPlaceholders({
    leadFirstName: lead.first_name,
    leadLastName: lead.last_name,
    leadHotelName: lead.hotel_name,
    agentName,
    agentEmail,
    trackingToken: (lead as any).tracking_token ?? null,
  })
  const resolvedHtml = cleanHtml ? applyPlaceholders(cleanHtml, placeholders) : ""
  const resolvedText = text ? applyPlaceholders(text, placeholders) : ""

  // Corpo "interno" del messaggio (bubble di conversazione pulita): se l'editor
  // ha inviato HTML formattato lo usiamo sanitizzato, altrimenti convertiamo il
  // testo semplice in HTML con escape + <br/>.
  let innerHtml: string
  if (resolvedHtml) {
    innerHtml = resolvedHtml
  } else {
    const safe = resolvedText
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\n/g, "<br/>")
    innerHtml = `<p>${safe}</p>`
  }
  // Sezione allegati nel corpo (link cliccabili), oltre all'allegato reale.
  if (attachments.length > 0) {
    const items = attachments
      .map(
        (a: { href: string; filename: string }) =>
          `<li><a href="${a.href.replace(/"/g, "&quot;")}">${a.filename
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")}</a></li>`,
      )
      .join("")
    innerHtml += `<p style="margin-top:12px"><strong>Allegati:</strong></p><ul>${items}</ul>`
  }

  // Allega la "call" scelta (link Meet diretto o form di prenotazione): crea la
  // richiesta demo / il token di prenotazione e accoda il bottone HTML al corpo.
  if (callOption.type !== "none") {
    try {
      const call = await prepareLeadCall({
        option: callOption,
        lead: {
          id: lead.id,
          first_name: lead.first_name,
          last_name: lead.last_name,
          hotel_name: lead.hotel_name,
          email: lead.email,
        },
        agent: { id: agent?.id, userId: user.id, name: agentName, email: agentEmail },
      })
      if (call.html) {
        // Se il corpo contiene il segnaposto (es. template "Fissa una demo"),
        // sostituiscilo; altrimenti accoda il blocco call in fondo.
        if (innerHtml.includes("{{link_call}}") || innerHtml.includes("{{link_prenota_call}}")) {
          innerHtml = innerHtml
            .replace(/\{\{link_call\}\}/g, call.html)
            .replace(/\{\{link_prenota_call\}\}/g, call.html)
        } else {
          innerHtml += call.html
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "call_failed"
      console.error("[sales/leads/messages POST] call option error:", msg)
      const friendly =
        msg === "slot_unavailable"
          ? "L'orario selezionato per la call non è disponibile. Scegli un altro orario."
          : "Impossibile preparare la call. Riprova o invia senza call."
      return NextResponse.json({ error: "call_failed", message: friendly }, { status: 409 })
    }
  }

  // Rimuovi eventuali segnaposto call residui (es. template "Fissa una demo"
  // scelto senza selezionare gli orari): evita di mostrarli grezzi al lead.
  innerHtml = innerHtml.replace(/\{\{link_call\}\}/g, "").replace(/\{\{link_prenota_call\}\}/g, "")

  // Email brandizzata effettivamente inviata: logo + firma venditore + footer.
  const html = renderSantaddeoEmail({
    preheader: resolvedText.slice(0, 120),
    signature: { name: agentName, email: agentEmail, aliasEmail: signatureAlias, phone: agent?.phone ?? null },
    bodyHtml: innerHtml,
  })

  const result = await sendEmail({
    to: lead.email,
    subject,
    html,
    type: "sales_lead_reply",
    from: sellerFrom ?? undefined,
    ...(ccList.length > 0 ? { cc: ccList } : {}),
    bcc: [getArchiveBccAddress(), ...bccUser].filter(Boolean) as string[],
    replyTo: replyToValue,
    headers,
    ...(attachments.length > 0 ? { attachments } : {}),
    metadata: { source: "/api/sales/leads/[id]/messages", lead_id: lead.id, sales_agent_id: agent?.id, from: fromEmailForRecord, sent_as: sendAsSuperadmin ? "superadmin" : "agent" },
  })
  if (!result.success) {
    return NextResponse.json({ error: "send_failed", message: result.error ?? "send_failed" }, { status: 502 })
  }

  await recordOutboundMessage({
    leadId: lead.id,
    salesAgentId: agent?.id ?? null,
    fromEmail: fromEmailForRecord,
    toEmail: lead.email,
    subject,
    bodyHtml: innerHtml,
    bodyText: resolvedText,
    messageId: result.messageId ?? null,
  })

  return NextResponse.json({ ok: true })
}

/** Normalizza il payload call_option ricevuto dal client. */
function parseCallOption(raw: any): LeadCallOption {
  if (!raw || typeof raw !== "object") return { type: "none" }
  if (raw.type === "meet" && raw.startIso && raw.endIso) {
    return { type: "meet", startIso: String(raw.startIso), endIso: String(raw.endIso) }
  }
  if (raw.type === "booking") {
    const d = Number(raw.durationMinutes)
    return { type: "booking", durationMinutes: Number.isFinite(d) && d > 0 ? d : 30 }
  }
  if (raw.type === "propose" && Array.isArray(raw.slots)) {
    const d = Number(raw.durationMinutes)
    const slots = raw.slots
      .filter((s: any) => s && s.startIso && s.endIso)
      .map((s: any) => ({ startIso: String(s.startIso), endIso: String(s.endIso) }))
      .slice(0, 3)
    if (slots.length > 0) {
      return { type: "propose", slots, durationMinutes: Number.isFinite(d) && d > 0 ? d : 30 }
    }
  }
  return { type: "none" }
}
