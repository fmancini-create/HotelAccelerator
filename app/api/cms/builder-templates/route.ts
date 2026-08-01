import { NextRequest, NextResponse } from "next/server"
import { createDocumentFromTemplate } from "@/lib/cms/template-catalog"
import { CMS_STUDIO_TEMPLATES, getCMSStudioTemplate } from "@/lib/cms/template-variants"

export async function GET(request: NextRequest) {
  const templateId = request.nextUrl.searchParams.get("id")

  if (!templateId) {
    return NextResponse.json({
      schema_version: 2,
      templates: CMS_STUDIO_TEMPLATES,
    })
  }

  const template = getCMSStudioTemplate(templateId)
  if (!template) {
    return NextResponse.json({ error: "Template non trovato" }, { status: 404 })
  }

  const document = createDocumentFromTemplate(template.baseTemplateId)
  document.templateId = template.id
  document.pages[0].seo.title = template.name
  document.pages[0].seo.description = template.description

  return NextResponse.json({
    schema_version: 2,
    template,
    document,
  })
}
