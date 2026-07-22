import { NextResponse } from "next/server"
import { createClient, createServiceRoleClient } from "@/lib/supabase/server"
import { getTemplateById } from "@/lib/sales/email-templates"

/**
 * POST /api/sales/leads/generate-email
 * Genera un'email personalizzata usando AI e il knowledge base di Santaddeo.
 */
export async function POST(request: Request) {
  // Verifica auth
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { template_id, lead } = await request.json()

  if (!template_id || !lead?.first_name || !lead?.hotel_name) {
    return NextResponse.json({ error: "Missing template_id or lead data" }, { status: 400 })
  }

  const template = getTemplateById(template_id)
  if (!template) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 })
  }

  // Carica il knowledge base pertinente
  const svc = await createServiceRoleClient()
  const { data: knowledge } = await svc
    .from("platform_knowledge")
    .select("title, content, category")
    .eq("is_active", true)
    .in("category", ["product", "features", "pricing", "support", "faq"])
    .limit(10)

  // Carica info venditore: la firma deve essere il NOME REALE del venditore
  // (display_name agente o nome+cognome del profilo), mai "Staff/Team SANTADDEO".
  const [{ data: profile }, { data: agent }] = await Promise.all([
    svc.from("profiles").select("first_name, last_name, email").eq("id", user.id).maybeSingle(),
    svc.from("sales_agents").select("display_name, email").eq("user_id", user.id).maybeSingle(),
  ])

  const fullName = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ").trim()
  const venditoreName = agent?.display_name?.trim() || fullName || "Il tuo consulente SANTADDEO"
  const venditoreEmail = agent?.email || profile?.email || user.email || "info@santaddeo.com"

  // Costruisci il context per l'AI
  const knowledgeContext = (knowledge || [])
    .map((k) => `[${k.category}] ${k.title}: ${k.content}`)
    .join("\n\n")

  const prompt = `Sei un copywriter esperto di email commerciali B2B per il settore hospitality.

CONTESTO PRODOTTO SANTADDEO:
${knowledgeContext || "SANTADDEO è un Revenue Management System per hotel che offre dashboard gratuite, algoritmi personalizzabili e un modello pay-for-performance."}

TEMA DELL'EMAIL: ${template.name}
TAGLINE: ${template.tagline}
DESCRIZIONE: ${template.description}

DATI LEAD:
- Nome: ${lead.first_name} ${lead.last_name || ""}
- Struttura: ${lead.hotel_name}
- Email: ${lead.email || ""}

VENDITORE:
- Nome: ${venditoreName}
- Email: ${venditoreEmail}

ISTRUZIONI:
1. Scrivi un'email commerciale persuasiva ma non aggressiva
2. Personalizzala per ${lead.hotel_name}
3. Mantieni il focus sul tema "${template.name}"
4. Usa un tono professionale ma amichevole
5. Includi una call-to-action chiara
6. L'email deve essere in HTML con formattazione semplice. Usa SEMPRE <p> per ogni paragrafo (uno per concetto, niente muri di testo). Per gli elenchi usa SEMPRE <ul><li>...</li></ul>: NON usare MAI caratteri puntati inline come "•", "-" o "*" dentro un paragrafo, perche' verrebbero appiattiti su un'unica riga.
7. Includi il bottone CTA con questo stile: <a href="{{link_signup}}" style="background: #10b981; color: white; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: bold; display: inline-block;">TESTO CTA</a>
8. FIRMA OBBLIGATORIA: chiudi l'email firmando con il NOME DEL VENDITORE "${venditoreName}". NON firmare mai come "Staff SANTADDEO", "Team SANTADDEO" o simili.

Rispondi SOLO con un JSON valido in questo formato:
{
  "subject": "Oggetto dell'email",
  "body": "<p>Corpo HTML dell'email...</p>"
}`

  try {
    // Usa l'AI Gateway di Vercel
    const aiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
        max_tokens: 1500,
      }),
    })

    if (!aiResponse.ok) {
      console.error("AI API error:", await aiResponse.text())
      // Fallback: usa il template base con placeholders sostituiti
      return NextResponse.json({
        subject: template.subject
          .replace(/\{\{nome_lead\}\}/g, lead.first_name)
          .replace(/\{\{nome_struttura\}\}/g, lead.hotel_name),
        body: template.body
          .replace(/\{\{nome_lead\}\}/g, lead.first_name)
          .replace(/\{\{cognome_lead\}\}/g, lead.last_name || "")
          .replace(/\{\{nome_struttura\}\}/g, lead.hotel_name)
          .replace(/\{\{nome_venditore\}\}/g, venditoreName)
          .replace(/\{\{email_venditore\}\}/g, venditoreEmail),
        ai_generated: false,
      })
    }

    const aiData = await aiResponse.json()
    const content = aiData.choices?.[0]?.message?.content || ""

    // Parse JSON dalla risposta
    const jsonMatch = content.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      return NextResponse.json({
        subject: parsed.subject || template.subject,
        body: parsed.body || template.body,
        ai_generated: true,
      })
    }

    // Fallback se parsing fallisce
    return NextResponse.json({
      subject: template.subject
        .replace(/\{\{nome_lead\}\}/g, lead.first_name)
        .replace(/\{\{nome_struttura\}\}/g, lead.hotel_name),
      body: template.body
        .replace(/\{\{nome_lead\}\}/g, lead.first_name)
        .replace(/\{\{cognome_lead\}\}/g, lead.last_name || "")
        .replace(/\{\{nome_struttura\}\}/g, lead.hotel_name)
        .replace(/\{\{nome_venditore\}\}/g, venditoreName)
        .replace(/\{\{email_venditore\}\}/g, venditoreEmail),
      ai_generated: false,
    })
  } catch (error) {
    console.error("Email generation error:", error)
    // Fallback al template base
    return NextResponse.json({
      subject: template.subject
        .replace(/\{\{nome_lead\}\}/g, lead.first_name)
        .replace(/\{\{nome_struttura\}\}/g, lead.hotel_name),
      body: template.body
        .replace(/\{\{nome_lead\}\}/g, lead.first_name)
        .replace(/\{\{cognome_lead\}\}/g, lead.last_name || "")
        .replace(/\{\{nome_struttura\}\}/g, lead.hotel_name)
        .replace(/\{\{nome_venditore\}\}/g, venditoreName)
        .replace(/\{\{email_venditore\}\}/g, venditoreEmail),
      ai_generated: false,
    })
  }
}
