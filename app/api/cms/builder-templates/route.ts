import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { createDocumentFromTemplate } from "@/lib/cms/template-catalog"
import { getCMSTemplateDesignProfile } from "@/lib/cms/template-design-profiles"
import { CMS_STUDIO_TEMPLATES, getCMSStudioTemplate } from "@/lib/cms/template-variants"
import { personalizeBuilderDocument } from "@/lib/cms/profile-personalizer"
import { isAreaDenied, areaDeniedResponse } from "@/lib/auth/area-denied"
import { requireAreaApi } from "@/lib/auth/area-access"

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

  const designProfile = getCMSTemplateDesignProfile(templateId)
  const baseDocument = createDocumentFromTemplate(template.baseTemplateId)
  baseDocument.templateId = template.id
  const propertyProfile = `${template.name}. ${template.description}. ${template.idealFor.join(" ")}. ${template.features.join(" ")}.`
  const document = personalizeBuilderDocument(baseDocument, {
    siteName: template.name,
    propertyProfile,
    designProfile,
  })
  document.pages[0].seo.title = template.name
  document.pages[0].seo.description = template.description
  return { template, designProfile, document }
}

function responsePersonalization(result: NonNullable<ReturnType<typeof createVariantDocument>>, mode: string) {
  return {
    mode,
    designProfileVersion: result.designProfile.version,
    objective: result.designProfile.objective,
    bookingMode: result.designProfile.bookingMode,
    navigationStyle: result.designProfile.navigationStyle,
    spacing: result.designProfile.spacing,
    sectionPlan: result.designProfile.sectionPlan,
    explanation: result.designProfile.tenantExplanation,
    pages: result.document.pages.map((page) => ({ title: page.title, slug: page.slug })),
  }
}

export async function GET(request: NextRequest) {
  const templateId = request.nextUrl.searchParams.get("id")

  if (!templateId) {
    return NextResponse.json({
      schema_version: 3,
      templates: CMS_STUDIO_TEMPLATES.map((template) => ({
        ...template,
        guidance: getCMSTemplateDesignProfile(template.id).tenantExplanation,
        designObjective: getCMSTemplateDesignProfile(template.id).objective,
      })),
    })
  }

  const result = createVariantDocument(templateId)
  if (!result) return NextResponse.json({ error: "Template non trovato" }, { status: 404 })

  return NextResponse.json({
    schema_version: 3,
    template: result.template,
    document: result.document,
    personalization: responsePersonalization(result, "design-profile-v1"),
  })
}

export async function POST(request: NextRequest) {
  try {
    // Permesso di sezione: in "enforce" lancia 403, tradotto dal catch qui sotto.
    await requireAreaApi("cms", request)
    const payload = PersonalizeRequestSchema.parse(await request.json())
    const result = createVariantDocument(payload.templateId)
    if (!result) return NextResponse.json({ error: "Template non trovato" }, { status: 404 })

    const document = personalizeBuilderDocument(result.document, {
      ...payload,
      designProfile: result.designProfile,
    })
    result.document = document

    return NextResponse.json({
      schema_version: 3,
      template: result.template,
      document,
      personalization: responsePersonalization(result, "deterministic-design-profile-v1"),
    })
  } catch (error) {
    // Diniego della guardia di area: 403, non il 500 generico qui sotto.
    if (isAreaDenied(error)) return areaDeniedResponse(error)
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Profilo non valido", details: error.flatten() }, { status: 400 })
    }
    return NextResponse.json({ error: "Impossibile generare la configurazione iniziale" }, { status: 500 })
  }
}
