import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { createDocumentFromTemplate } from "@/lib/cms/template-catalog"
import { CMS_STUDIO_TEMPLATES, getCMSStudioTemplate } from "@/lib/cms/template-variants"
import { personalizeBuilderDocument } from "@/lib/cms/profile-personalizer"

const PersonalizeRequestSchema = z.object({
  templateId: z.string().min(1).max(120),
  siteName: z.string().max(160).optional().default(""),
  propertyProfile: z.string().max(5000).optional().default(""),
  stylePrompt: z.string().max(5000).optional().default(""),
  pagePrompt: z.string().max(10000).optional().default(""),
})

function createVariantDocument(templateId: string) {
  const template = getCMSStudioTemplate(templateId)
  if (!template) return null

  const baseDocument = createDocumentFromTemplate(template.baseTemplateId)
  baseDocument.templateId = template.id
  const propertyProfile = `${template.name}. ${template.description}. ${template.idealFor.join(" ")}. ${template.features.join(" ")}.`
  const document = personalizeBuilderDocument(baseDocument, {
    siteName: template.name,
    propertyProfile,
  })
  document.pages[0].seo.title = template.name
  document.pages[0].seo.description = template.description
  return { template, document }
}

export async function GET(request: NextRequest) {
  const templateId = request.nextUrl.searchParams.get("id")

  if (!templateId) {
    return NextResponse.json({
      schema_version: 2,
      templates: CMS_STUDIO_TEMPLATES,
    })
  }

  const result = createVariantDocument(templateId)
  if (!result) return NextResponse.json({ error: "Template non trovato" }, { status: 404 })

  return NextResponse.json({
    schema_version: 2,
    template: result.template,
    document: result.document,
    personalization: {
      mode: "collection-profile-v1",
      pages: result.document.pages.map((page) => ({ title: page.title, slug: page.slug })),
    },
  })
}

export async function POST(request: NextRequest) {
  try {
    const payload = PersonalizeRequestSchema.parse(await request.json())
    const result = createVariantDocument(payload.templateId)
    if (!result) return NextResponse.json({ error: "Template non trovato" }, { status: 404 })

    const document = personalizeBuilderDocument(result.document, payload)
    return NextResponse.json({
      schema_version: 2,
      template: result.template,
      document,
      personalization: {
        mode: "deterministic-profile-v1",
        pages: document.pages.map((page) => ({ title: page.title, slug: page.slug })),
      },
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Profilo non valido", details: error.flatten() }, { status: 400 })
    }
    return NextResponse.json({ error: "Impossibile generare la configurazione iniziale" }, { status: 500 })
  }
}
