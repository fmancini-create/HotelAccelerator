import { type NextRequest, NextResponse } from "next/server"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"
import { createClient } from "@/lib/supabase/server"
import {
  CMS_BUILDER_SCHEMA_VERSION,
  CMSBuilderDocumentSchema,
  createEmptyBuilderDocument,
} from "@/lib/cms/builder-document"
import { normalizeBuilderNavigation } from "@/lib/cms/normalize-builder-navigation"
import { CMS_STUDIO_TEMPLATES } from "@/lib/cms/template-variants"

const TEMPLATE_IDS = new Set(CMS_STUDIO_TEMPLATES.map((template) => template.id))
const PROJECT_SELECT = "id, template_id, site_name, property_profile, style_prompt, page_prompt, current_step, status, project_version, builder_schema_version, builder_document, updated_at"

function text(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined
  const normalized = value.trim()
  if (normalized.length > max) throw new Error(`Testo troppo lungo (max ${max} caratteri)`)
  return normalized
}

function errorStatus(message: string): number {
  if (message.includes("Non autenticato")) return 401
  if (message.includes("troppo lungo") || message.includes("non valido") || message.includes("Documento CMS")) return 400
  return 500
}

function serializeProject(project: Record<string, unknown> | null) {
  if (!project) return null
  const templateId = typeof project.template_id === "string" ? project.template_id : CMS_STUDIO_TEMPLATES[0]?.id || "luxury-editorial"
  const candidate = project.builder_document ?? createEmptyBuilderDocument(templateId)
  const validation = CMSBuilderDocumentSchema.safeParse(candidate)
  return {
    ...project,
    builder_schema_version: project.builder_schema_version ?? CMS_BUILDER_SCHEMA_VERSION,
    builder_document: validation.success ? normalizeBuilderNavigation(validation.data) : createEmptyBuilderDocument(templateId),
  }
}

export async function GET(request: NextRequest) {
  try {
    const propertyId = await getAuthenticatedPropertyId(request)
    const supabase = await createClient()
    const { data, error } = await supabase
      .from("cms_ai_projects")
      .select(PROJECT_SELECT)
      .eq("property_id", propertyId)
      .maybeSingle()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ project: serializeProject(data) })
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
      if (typeof body.template_id !== "string" || !TEMPLATE_IDS.has(body.template_id)) throw new Error("Template non valido")
      payload.template_id = body.template_id
    }

    const siteName = text(body.site_name, 160)
    const propertyProfile = text(body.property_profile, 5000)
    const stylePrompt = text(body.style_prompt, 5000)
    const pagePrompt = text(body.page_prompt, 10000)
    if (siteName !== undefined) payload.site_name = siteName
    if (propertyProfile !== undefined) payload.property_profile = propertyProfile
    if (stylePrompt !== undefined) payload.style_prompt = stylePrompt
    if (pagePrompt !== undefined) payload.page_prompt = pagePrompt

    if (body.current_step !== undefined) {
      const step = Number(body.current_step)
      if (!Number.isInteger(step) || step < 1 || step > 3) throw new Error("Step non valido")
      payload.current_step = step
    }

    if (body.builder_document !== undefined) {
      const validation = CMSBuilderDocumentSchema.safeParse(body.builder_document)
      if (!validation.success) {
        return NextResponse.json({ error: "Documento CMS non valido", details: validation.error.flatten() }, { status: 400 })
      }
      const normalizedDocument = normalizeBuilderNavigation(validation.data)
      payload.builder_schema_version = CMS_BUILDER_SCHEMA_VERSION
      payload.builder_document = normalizedDocument
      payload.template_id = normalizedDocument.templateId
    }

    const supabase = await createClient()
    const { data, error } = await supabase
      .from("cms_ai_projects")
      .upsert(payload, { onConflict: "property_id" })
      .select(PROJECT_SELECT)
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ project: serializeProject(data) })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Errore sconosciuto"
    return NextResponse.json({ error: message }, { status: errorStatus(message) })
  }
}
