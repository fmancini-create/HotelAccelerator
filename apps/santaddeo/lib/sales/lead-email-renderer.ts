import { createServiceRoleClient } from "@/lib/supabase/server"

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  "https://www.santaddeo.com"

/**
 * Carica il template attivo della categoria 'lead_presentation' e applica
 * sostituzioni per i placeholder {{nome_lead}}, {{cognome_lead}},
 * {{nome_struttura}}, {{nome_venditore}}, {{email_venditore}},
 * {{link_signup}}, {{link_dashboard_demo}}.
 *
 * Se il template non esiste in DB (es. seed non eseguito), fallisce
 * gracefully con un template hardcoded di backup.
 */
export async function renderLeadPresentationEmail(args: {
  leadFirstName: string
  leadLastName: string
  leadHotelName: string
  agentName: string
  agentEmail: string
  trackingToken: string
  /** Se passato, usa questo template invece di quello attivo (preview) */
  templateOverride?: { subject_template: string; html_template: string }
}) {
  const linkSignup = `${SITE_URL}/auth/sign-up?ref=${args.trackingToken}`
  const linkDemo = `${SITE_URL}/landing/dashboard-gratuita?ref=${args.trackingToken}`

  const placeholders: Record<string, string> = {
    nome_lead: args.leadFirstName,
    cognome_lead: args.leadLastName,
    nome_struttura: args.leadHotelName,
    nome_venditore: args.agentName,
    email_venditore: args.agentEmail,
    link_signup: linkSignup,
    link_dashboard_demo: linkDemo,
  }

  let subjectTpl: string
  let htmlTpl: string

  if (args.templateOverride) {
    subjectTpl = args.templateOverride.subject_template
    htmlTpl = args.templateOverride.html_template
  } else {
    const svc = await createServiceRoleClient()
    const { data: tpl } = await svc
      .from("sales_email_templates")
      .select("subject_template, html_template")
      .eq("category", "lead_presentation")
      .eq("is_active", true)
      .maybeSingle()
    if (tpl) {
      subjectTpl = tpl.subject_template
      htmlTpl = tpl.html_template
    } else {
      // Fallback hardcoded (caso anomalo: seed non applicato).
      subjectTpl = "{{nome_lead}}, una proposta per {{nome_struttura}}"
      htmlTpl = `<p>Ciao {{nome_lead}},</p><p>Sono {{nome_venditore}} di SANTADDEO. Ho preparato una demo gratuita per {{nome_struttura}}: <a href="{{link_dashboard_demo}}">prova qui</a>.</p>`
    }
  }

  return {
    subject: applyPlaceholders(subjectTpl, placeholders),
    html: applyPlaceholders(htmlTpl, placeholders),
  }
}

/**
 * Costruisce la mappa standard dei placeholder per un lead/venditore.
 * Riusabile da tutti i path di invio (nuovo contatto, risposta, template).
 */
export function buildLeadPlaceholders(args: {
  leadFirstName?: string | null
  leadLastName?: string | null
  leadHotelName?: string | null
  agentName: string
  agentEmail: string
  trackingToken?: string | null
}): Record<string, string> {
  const token = args.trackingToken || ""
  return {
    nome_lead: args.leadFirstName || "",
    cognome_lead: args.leadLastName || "",
    nome_struttura: args.leadHotelName || "",
    nome_venditore: args.agentName,
    email_venditore: args.agentEmail,
    link_signup: token ? `${SITE_URL}/auth/sign-up?ref=${token}` : `${SITE_URL}/auth/sign-up`,
    link_dashboard_demo: token
      ? `${SITE_URL}/landing/dashboard-gratuita?ref=${token}`
      : `${SITE_URL}/landing/dashboard-gratuita`,
  }
}

export function applyPlaceholders(text: string, vars: Record<string, string>) {
  return text.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (_match, name) => {
    const v = vars[String(name).toLowerCase()]
    return v ?? `{{${name}}}`
  })
}
