import { NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { getAuthUserOrDev } from "@/lib/auth/getAuthUserOrDev"
import { sendEmail } from "@/lib/email"
import { renderLeadPresentationEmail } from "@/lib/sales/lead-email-renderer"
import { prepareLeadCall, type LeadCallOption } from "@/lib/sales/lead-call"
import { buildSellerReplyTo, buildSellerFrom, getArchiveBccAddress } from "@/lib/sales/inbox-config"
import { recordOutboundMessage } from "@/lib/sales/lead-messages"
import { parseRecipientList } from "@/lib/sales/email-recipients"

export const dynamic = "force-dynamic"

/**
 * Invia (o re-invia) la mail di presentazione SANTADDEO a un lead GIA' salvato.
 * Serve per i lead creati con "Salva senza inviare email" (stato draft): da qui
 * il venditore puo' contattarli in un secondo momento.
 *
 * Body (opzionale):
 *  - custom_subject, custom_body: testo personalizzato (da EmailTemplateSelector).
 *    Se assenti, usa il template standard.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { user, supabase: authSupa } = await getAuthUserOrDev()
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  const { data: profile } = await authSupa
    .from("profiles")
    .select("id, role, email")
    .eq("id", user.id)
    .single()
  if (!profile || (profile.role !== "sales_agent" && profile.role !== "super_admin")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const customSubject = body?.custom_subject ? String(body.custom_subject).trim() : null
  const customBody = body?.custom_body ? String(body.custom_body).trim() : null
  const callOption: LeadCallOption = parseCallOption(body?.call_option)
  // Destinatari aggiuntivi opzionali: Cc (copia visibile) e Ccn (copia nascosta).
  const ccList = parseRecipientList(body?.cc)
  const bccUser = parseRecipientList(body?.bcc)

  const svc = await createServiceRoleClient()

  // Recupera il lead e l'agente proprietario.
  const { data: lead, error: leadErr } = await svc
    .from("sales_leads")
    .select("*, sales_agents!inner(id, user_id, display_name, email, sender_email, sender_name, is_active)")
    .eq("id", id)
    .maybeSingle()

  if (leadErr) {
    console.error("[sales/leads/send-email] lead lookup error:", leadErr)
    return NextResponse.json({ error: "db_error" }, { status: 500 })
  }
  if (!lead) return NextResponse.json({ error: "not_found" }, { status: 404 })

  const agent = (lead as any).sales_agents
  // Ownership: il venditore puo' inviare solo ai propri lead; il super admin a tutti.
  if (profile.role !== "super_admin" && agent.user_id !== user.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }
  if (!agent.is_active) {
    return NextResponse.json({ error: "agent_inactive" }, { status: 403 })
  }

  const trackingToken: string = lead.tracking_token
  const agentName = agent.display_name || "Il tuo consulente SANTADDEO"
  const agentEmail = agent.email || profile.email || "info@santaddeo.com"

  // Identita' mittente (CRM): se il venditore ha un alias @santaddeo.com
  // verificato su Workspace, la mail parte dal SUO indirizzo. Altrimenti
  // fallback automatico al From di default (noreply@santaddeo.com).
  const sellerFrom = buildSellerFrom(agent.sender_email, agent.sender_name || agentName)
  const fromHeader = sellerFrom ?? undefined // undefined => sendEmail usa il default
  const fromEmailForRecord =
    agent.sender_email && sellerFrom ? String(agent.sender_email).trim().toLowerCase() : process.env.SMTP_USER || "noreply@santaddeo.com"

  let subject: string
  let html: string
  if (customSubject && customBody) {
    subject = customSubject
      .replace(/\{\{nome_venditore\}\}/g, agentName)
      .replace(/\{\{email_venditore\}\}/g, agentEmail)
    html = customBody
      .replace(/\{\{nome_venditore\}\}/g, agentName)
      .replace(/\{\{email_venditore\}\}/g, agentEmail)
      .replace(/\{\{link_signup\}\}/g, `https://www.santaddeo.com/auth/sign-up?ref=${trackingToken}`)
      .replace(/\{\{link_dashboard_demo\}\}/g, `https://www.santaddeo.com/landing/dashboard-gratuita?ref=${trackingToken}`)
  } else {
    const rendered = await renderLeadPresentationEmail({
      leadFirstName: lead.first_name,
      leadLastName: lead.last_name,
      leadHotelName: lead.hotel_name,
      agentName,
      agentEmail,
      trackingToken,
    })
    subject = rendered.subject
    html = rendered.html
  }

  // Conserva il testo "pulito" dell'email (prima di eventuali bottoni call)
  // per poterlo riaprire e rivedere al prossimo "Re-invia".
  const savedSubject = subject
  const savedBody = html

  // Allega la "call" scelta dal venditore (link Meet diretto o form di
  // prenotazione). Crea la richiesta demo / il token di prenotazione e
  // ritorna il bottone HTML da accodare al corpo email.
  let callWarning: string | null = null
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
        agent: { id: agent.id, userId: user.id, name: agentName, email: agentEmail },
      })
      if (call.html) {
        // Sostituisce il placeholder se presente, altrimenti accoda il bottone.
        if (html.includes("{{link_call}}") || html.includes("{{link_prenota_call}}")) {
          html = html.replace(/\{\{link_call\}\}/g, call.html).replace(/\{\{link_prenota_call\}\}/g, call.html)
        } else {
          html = `${html}${call.html}`
        }
      }
      callWarning = call.warning
    } catch (e) {
      const msg = e instanceof Error ? e.message : "call_failed"
      console.error("[sales/leads/send-email] call option error:", msg)
      const friendly =
        msg === "slot_unavailable"
          ? "L'orario selezionato per la call non e' disponibile. Scegli un altro orario."
          : "Impossibile preparare la call. Riprova o invia senza call."
      return NextResponse.json({ error: "call_failed", message: friendly }, { status: 409 })
    }
  }

  // Rimuovi eventuali segnaposto call residui (template "Fissa una demo" senza
  // orari selezionati): non mostrarli grezzi al lead.
  html = html.replace(/\{\{link_call\}\}/g, "").replace(/\{\{link_prenota_call\}\}/g, "")

  try {
    const result = await sendEmail({
      to: lead.email,
      subject,
      html,
      type: "sales_lead_presentation",
      from: fromHeader,
      ...(ccList.length > 0 ? { cc: ccList } : {}),
      bcc: [getArchiveBccAddress(), ...bccUser].filter(Boolean) as string[],
      replyTo: buildSellerReplyTo(agent.sender_email, agentEmail),
      metadata: {
        source: "/api/sales/leads/[id]/send-email",
        lead_id: lead.id,
        sales_agent_id: agent.id,
        tracking_token: trackingToken,
        from: fromEmailForRecord,
      },
    })
    if (!result.success) {
      return NextResponse.json({ error: "send_failed", message: result.error ?? "send_failed" }, { status: 502 })
    }
    // Registra il messaggio in uscita (per il thread + threading delle risposte).
    await recordOutboundMessage({
      leadId: lead.id,
      salesAgentId: agent.id,
      fromEmail: fromEmailForRecord,
      toEmail: lead.email,
      subject: savedSubject,
      bodyHtml: html,
      messageId: result.messageId ?? null,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : "send_exception"
    console.error("[sales/leads/send-email] email error:", msg)
    return NextResponse.json({ error: "send_failed", message: msg }, { status: 502 })
  }

  // Aggiorna stato: i lead gia' registrati/convertiti non vanno retrocessi.
  const keepStatus = ["registered", "converted", "opened", "clicked"]
  const update: Record<string, unknown> = {
    email_sent_at: new Date().toISOString(),
    email_sent_count: (lead.email_sent_count ?? 0) + 1,
    last_email_subject: savedSubject,
    last_email_body: savedBody,
  }
  if (!keepStatus.includes(lead.status)) update.status = "invited"

  await svc.from("sales_leads").update(update).eq("id", lead.id)

  return NextResponse.json({ ok: true, email_sent: true, call_warning: callWarning })
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
