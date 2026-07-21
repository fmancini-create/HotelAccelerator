import { NextResponse } from "next/server"
import crypto from "node:crypto"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { getAuthUserOrDev } from "@/lib/auth/getAuthUserOrDev"
import { sendEmail } from "@/lib/email"
import { renderLeadPresentationEmail } from "@/lib/sales/lead-email-renderer"
import { prepareLeadCall, type LeadCallOption } from "@/lib/sales/lead-call"
import { buildSellerReplyTo, buildSellerFrom, getArchiveBccAddress } from "@/lib/sales/inbox-config"
import { recordOutboundMessage } from "@/lib/sales/lead-messages"
import { renderSantaddeoEmail } from "@/lib/sales/email-layout"
import { parseRecipientList } from "@/lib/sales/email-recipients"

export const dynamic = "force-dynamic"

/**
 * Lista i lead del venditore corrente. Super admin puo' passare ?agent_id=...
 */
export async function GET(request: Request) {
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

  const url = new URL(request.url)
  const overrideAgentId = url.searchParams.get("agent_id")
  const svc = await createServiceRoleClient()

  let agentQuery = svc.from("sales_agents").select("id")
  if (profile.role === "super_admin" && overrideAgentId) {
    agentQuery = agentQuery.eq("id", overrideAgentId)
  } else {
    agentQuery = agentQuery.eq("user_id", user.id)
  }
  const { data: agent } = await agentQuery.maybeSingle()
  if (!agent) return NextResponse.json({ leads: [] })

  const { data: leads, error } = await svc
    .from("sales_leads")
    .select("*")
    .eq("sales_agent_id", agent.id)
    .order("created_at", { ascending: false })

  if (error) {
    console.error("[sales/leads] list error:", error)
    return NextResponse.json({ error: "db_error" }, { status: 500 })
  }
  return NextResponse.json({ leads: leads ?? [] })
}

/**
 * Crea un nuovo lead per il venditore corrente e invia la mail di
 * presentazione SANTADDEO al potenziale cliente. La mail contiene un link
 * con tracking token che, alla registrazione, associera' automaticamente
 * la nuova struttura al venditore.
 *
 * Body:
 *  - first_name, last_name, hotel_name, email (required)
 *  - phone (optional)
 *  - notes (optional)
 *  - send_email (boolean, default true): se false, salva solo il record
 *    senza inviare email (utile per lead caricati ma da contattare dopo).
 */
export async function POST(request: Request) {
  const { user, supabase: authSupa } = await getAuthUserOrDev()
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  const { data: profile } = await authSupa
    .from("profiles")
    .select("id, role, first_name, last_name, email")
    .eq("id", user.id)
    .single()
  if (!profile || (profile.role !== "sales_agent" && profile.role !== "super_admin")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: "invalid_body" }, { status: 400 })

  const firstName = String(body.first_name ?? "").trim()
  const lastName = String(body.last_name ?? "").trim()
  const hotelName = String(body.hotel_name ?? "").trim()
  const email = String(body.email ?? "").trim().toLowerCase()
  const phone = body.phone ? String(body.phone).trim() : null
  const notes = body.notes ? String(body.notes).trim() : null
  const sendEmailFlag = body.send_email !== false
  const overrideAgentId = body.agent_id // solo super_admin
  // Template custom opzionale (da EmailTemplateSelector)
  const customSubject = body.custom_subject ? String(body.custom_subject).trim() : null
  const customBody = body.custom_body ? String(body.custom_body).trim() : null
  const callOption = parseCallOption(body.call_option)
  // Destinatari aggiuntivi opzionali: Cc (copia visibile) e Ccn (copia nascosta).
  const ccList = parseRecipientList(body.cc)
  const bccUser = parseRecipientList(body.bcc)
  // Allegati gia' caricati su Blob: [{ url, filename, contentType }].
  const attachments = Array.isArray(body.attachments)
    ? body.attachments
        .filter((a: any) => a && typeof a.url === "string" && /^https?:\/\//i.test(a.url))
        .slice(0, 10)
        .map((a: any) => ({
          filename: String(a.filename || "allegato").slice(0, 120),
          href: String(a.url),
          contentType: a.contentType ? String(a.contentType) : undefined,
        }))
    : []

  if (!firstName || !lastName || !hotelName || !email) {
    return NextResponse.json(
      { error: "missing_fields", fields: ["first_name", "last_name", "hotel_name", "email"] },
      { status: 400 },
    )
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "invalid_email" }, { status: 400 })
  }

  const svc = await createServiceRoleClient()

  // Trova il sales_agent. Super_admin puo' creare lead a nome di un altro
  // agente con override esplicito.
  let agentQuery = svc.from("sales_agents").select("id, user_id, display_name, email, phone, sender_email, sender_name, is_active")
  if (profile.role === "super_admin" && overrideAgentId) {
    agentQuery = agentQuery.eq("id", overrideAgentId)
  } else {
    agentQuery = agentQuery.eq("user_id", user.id)
  }
  const { data: agent } = await agentQuery.maybeSingle()
  if (!agent) {
    return NextResponse.json({ error: "no_sales_agent" }, { status: 400 })
  }
  if (!agent.is_active) {
    return NextResponse.json({ error: "agent_inactive" }, { status: 403 })
  }

  // Genera tracking token unico (32 hex chars).
  const trackingToken = crypto.randomBytes(16).toString("hex")

  // Insert lead (controllo unique vincolato, se gia esiste per stesso agente
  // ed email, ritorniamo errore).
  const { data: lead, error: insertErr } = await svc
    .from("sales_leads")
    .insert({
      sales_agent_id: agent.id,
      first_name: firstName,
      last_name: lastName,
      hotel_name: hotelName,
      email,
      phone,
      notes,
      tracking_token: trackingToken,
      status: "draft",
    })
    .select()
    .single()

  if (insertErr) {
    if (insertErr.code === "23505") {
      return NextResponse.json(
        { error: "duplicate_lead", message: "Hai gia' un lead con questa email" },
        { status: 409 },
      )
    }
    console.error("[sales/leads] insert error:", insertErr)
    return NextResponse.json({ error: "db_error" }, { status: 500 })
  }

  // Invio mail (best-effort: anche se fallisce, il lead resta salvato).
  let emailSent = false
  let emailError: string | null = null
  if (sendEmailFlag) {
    try {
      const agentName = agent.display_name || "Il tuo consulente SANTADDEO"
      const agentEmail = agent.email || profile.email || "info@santaddeo.com"

      // Identita' mittente venditore (alias @santaddeo.com) o fallback noreply.
      const sellerFrom = buildSellerFrom(agent.sender_email, agent.sender_name || agentName)
      const fromEmailForRecord =
        agent.sender_email && sellerFrom
          ? String(agent.sender_email).trim().toLowerCase()
          : process.env.SMTP_USER || "noreply@santaddeo.com"
      
      // Se c'è un template custom (da EmailTemplateSelector), usa quello
      // altrimenti usa il renderer standard
      let subject: string
      let html: string
      
      if (customSubject && customBody) {
        // Template custom - sostituisci i placeholder rimanenti
        subject = customSubject
          .replace(/\{\{nome_venditore\}\}/g, agentName)
          .replace(/\{\{email_venditore\}\}/g, agentEmail)
        html = customBody
          .replace(/\{\{nome_venditore\}\}/g, agentName)
          .replace(/\{\{email_venditore\}\}/g, agentEmail)
          .replace(/\{\{link_signup\}\}/g, `https://www.santaddeo.com/auth/sign-up?ref=${trackingToken}`)
          .replace(/\{\{link_dashboard_demo\}\}/g, `https://www.santaddeo.com/landing/dashboard-gratuita?ref=${trackingToken}`)
      } else {
        // Template standard
        const rendered = await renderLeadPresentationEmail({
          leadFirstName: firstName,
          leadLastName: lastName,
          leadHotelName: hotelName,
          agentName,
          agentEmail,
          trackingToken,
        })
        subject = rendered.subject
        html = rendered.html
      }

      // Testo "pulito" dell'email (prima dei bottoni call) per la revisione al
      // prossimo "Re-invia".
      const savedSubject = subject
      const savedBody = html

      // Allega la call scelta (link Meet diretto o form di prenotazione).
      if (callOption.type !== "none") {
        try {
          const call = await prepareLeadCall({
            option: callOption,
            lead: {
              id: lead.id,
              first_name: firstName,
              last_name: lastName,
              hotel_name: hotelName,
              email,
            },
            agent: { id: agent.id, userId: agent.user_id, name: agentName, email: agentEmail },
          })
          if (call.html) {
            if (html.includes("{{link_call}}") || html.includes("{{link_prenota_call}}")) {
              html = html
                .replace(/\{\{link_call\}\}/g, call.html)
                .replace(/\{\{link_prenota_call\}\}/g, call.html)
            } else {
              html = `${html}${call.html}`
            }
          }
        } catch (e) {
          console.error("[sales/leads] call option error:", e instanceof Error ? e.message : e)
          // La call è best-effort: l'email parte comunque senza il bottone.
        }
      }

      // Rimuovi eventuali segnaposto call residui (template "Fissa una demo"
      // senza orari selezionati): non mostrarli grezzi al lead.
      html = html.replace(/\{\{link_call\}\}/g, "").replace(/\{\{link_prenota_call\}\}/g, "")

      const replyTo = buildSellerReplyTo(agent.sender_email, agentEmail)
      // Aggiunge la sezione allegati (link) al corpo, se presenti.
      if (attachments.length > 0) {
        const items = attachments
          .map(
            (a: { href: string; filename: string }) =>
              `<li><a href="${a.href.replace(/"/g, "&quot;")}">${a.filename
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")}</a></li>`,
          )
          .join("")
        html += `<p style="margin-top:12px"><strong>Allegati:</strong></p><ul>${items}</ul>`
      }
      // Email brandizzata effettivamente inviata: logo SANTADDEO + firma
      // venditore (nome/email/cellulare) + footer dati 4 bid con logo. Il corpo
      // "interno" pulito (html) resta salvato nel thread e per il re-invio.
      const wrappedHtml = renderSantaddeoEmail({
        preheader: subject,
        signature: { name: agentName, email: agentEmail, aliasEmail: agent.sender_email ?? null, phone: agent.phone ?? null },
        bodyHtml: html,
      })
      const result = await sendEmail({
        to: email,
        subject,
        html: wrappedHtml,
        type: "sales_lead_presentation",
        from: sellerFrom ?? undefined,
        ...(ccList.length > 0 ? { cc: ccList } : {}),
        bcc: [getArchiveBccAddress(), ...bccUser].filter(Boolean) as string[],
        replyTo,
        ...(attachments.length > 0 ? { attachments } : {}),
        metadata: {
          source: "/api/sales/leads",
          lead_id: lead.id,
          sales_agent_id: agent.id,
          tracking_token: trackingToken,
        },
      })

      if (result.success) {
        emailSent = true
        await svc
          .from("sales_leads")
          .update({
            status: "invited",
            email_sent_at: new Date().toISOString(),
            email_sent_count: (lead.email_sent_count ?? 0) + 1,
            last_email_subject: savedSubject,
            last_email_body: savedBody,
          })
          .eq("id", lead.id)
        // Registra il messaggio in uscita (thread + threading risposte).
        await recordOutboundMessage({
          leadId: lead.id,
          salesAgentId: agent.id,
          fromEmail: fromEmailForRecord,
          toEmail: email,
          subject: savedSubject,
          bodyHtml: html,
          messageId: result.messageId ?? null,
        })
      } else {
        emailError = result.error ?? "send_failed"
      }
    } catch (e) {
      emailError = e instanceof Error ? e.message : "send_exception"
      console.error("[sales/leads] email error:", emailError)
    }
  }

  return NextResponse.json({
    lead,
    email_sent: emailSent,
    email_error: emailError,
  })
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
  return { type: "none" }
}
