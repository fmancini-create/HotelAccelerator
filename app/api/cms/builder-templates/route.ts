import { NextRequest, NextResponse } from "next/server"
import { CMS_TEMPLATE_CATALOG, createDocumentFromTemplate, getCMSTemplateSummary } from "@/lib/cms/template-catalog"

export async function GET(request: NextRequest) {
  const templateId = request.nextUrl.searchParams.get("id")

  if (!templateId) {
    return NextResponse.json({
      schema_version: 1,
      templates: CMS_TEMPLATE_CATALOG,
    })
  }

  const template = getCMSTemplateSummary(templateId)
  if (!template) {
    return NextResponse.json({ error: "Template non trovato" }, { status: 404 })
  }

  return NextResponse.json({
    schema_version: 1,
    template,
    document: createDocumentFromTemplate(templateId),
  })
}
