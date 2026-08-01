import { type NextRequest, NextResponse } from "next/server"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"
import { createClient } from "@/lib/supabase/server"

const TEMPLATE_IDS = new Set(["luxury", "boutique", "wellness", "family", "business", "agriturismo"])

function text(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined
  const normalized = value.trim()
  if (normalized.length > max) throw new Error(`Testo troppo lungo (max ${max} caratteri)`)
  return normalized
}

function errorStatus(message: string): number {
  if (message.includes("Non autenticato")) return 401
  if (message.includes("troppo lungo") || message.includes("non valido")) return 400
  return 500
}

export async function GET(request: NextRequest) {
  try {
    const propertyId = await getAuthenticatedPropertyId(request)
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("cms_ai_projects")
      .select("id, template_id, site_name, style_prompt, page_prompt, current_step, status, project_version, updated_at")
      .eq("property_id", propertyId)
      .maybeSingle()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ project: data })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Errore sconosciuto"
    return NextResponse.json({ error: message }, { status: errorStatus(message) })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const propertyId = await getAuthenticatedPropertyId(request)
    const body = await request.json().catch(() => ({}))
    const payload: Record<string, unknown> = { property_id: propertyId }

    if (body.template_id !== undefined) {
      if (typeof body.template_id !== "string" || !TEMPLATE_IDS.has(body.template_id)) {
        throw new Error("Template non valido")
      }
      payload.template_id = body.template_id
    }

    const siteName = text(body.site_name, 160)
    const stylePrompt = text(body.style_prompt, 5000)
    const pagePrompt = text(body.page_prompt, 10000)
    if (siteName !== undefined) payload.site_name = siteName
    if (stylePrompt !== undefined) payload.style_prompt = stylePrompt
    if (pagePrompt !== undefined) payload.page_prompt = pagePrompt

    if (body.current_step !== undefined) {
      const step = Number(body.current_step)
      if (!Number.isInteger(step) || step < 1 || step > 3) throw new Error("Step non valido")
      payload.current_step = step
    }

    const supabase = await createClient()
    const { data, error } = await supabase
      .from("cms_ai_projects")
      .upsert(payload, { onConflict: "property_id" })
      .select("id, template_id, site_name, style_prompt, page_prompt, current_step, status, project_version, updated_at")
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ project: data })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Errore sconosciuto"
    return NextResponse.json({ error: message }, { status: errorStatus(message) })
  }
}
