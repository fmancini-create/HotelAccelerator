import { NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { requireSuperadmin } from "@/lib/sales/superadmin-guard"
import { renderLeadPresentationEmail } from "@/lib/sales/lead-email-renderer"

export const dynamic = "force-dynamic"

/**
 * GET /api/superadmin/sales/email-template
 *
 * Restituisce il template attivo della categoria 'lead_presentation'.
 * Se non esiste in DB (caso anomalo), torna null e il client mostra
 * un default editabile per crearlo.
 */
export async function GET() {
  const guard = await requireSuperadmin()
  if ("error" in guard) return guard.error

  const svc = await createServiceRoleClient()
  const { data, error } = await svc
    .from("sales_email_templates")
    .select("*")
    .eq("category", "lead_presentation")
    .eq("is_active", true)
    .maybeSingle()

  if (error) {
    console.error("[superadmin/sales/email-template] error:", error)
    return NextResponse.json({ error: "db_error" }, { status: 500 })
  }
  return NextResponse.json({ template: data ?? null })
}

/**
 * PUT /api/superadmin/sales/email-template
 *
 * Crea o aggiorna il template attivo. Body:
 *  { subject_template, html_template, name? }
 */
export async function PUT(req: Request) {
  const guard = await requireSuperadmin()
  if ("error" in guard) return guard.error

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: "invalid_body" }, { status: 400 })

  const subject = String(body.subject_template ?? "").trim()
  const html = String(body.html_template ?? "").trim()
  if (!subject || !html) {
    return NextResponse.json(
      { error: "missing_fields", fields: ["subject_template", "html_template"] },
      { status: 400 },
    )
  }

  const svc = await createServiceRoleClient()
  const updated_at = new Date().toISOString()

  // Upsert su (category, is_active=true). Se esiste, aggiorno; altrimenti
  // creo con is_active=true.
  const { data: existing } = await svc
    .from("sales_email_templates")
    .select("id")
    .eq("category", "lead_presentation")
    .eq("is_active", true)
    .maybeSingle()

  if (existing) {
    const { data, error } = await svc
      .from("sales_email_templates")
      .update({
        subject_template: subject,
        html_template: html,
        name: body.name ?? undefined,
        updated_at,
      })
      .eq("id", existing.id)
      .select()
      .single()
    if (error) {
      console.error("[email-template/PUT] update error:", error)
      return NextResponse.json({ error: "db_error" }, { status: 500 })
    }
    return NextResponse.json({ template: data })
  }

  const { data, error } = await svc
    .from("sales_email_templates")
    .insert({
      category: "lead_presentation",
      subject_template: subject,
      html_template: html,
      name: body.name ?? "Lead Presentation",
      is_active: true,
    })
    .select()
    .single()
  if (error) {
    console.error("[email-template/PUT] insert error:", error)
    return NextResponse.json({ error: "db_error" }, { status: 500 })
  }
  return NextResponse.json({ template: data })
}

/**
 * POST /api/superadmin/sales/email-template/preview
 * Vedi route preview separato.
 */
