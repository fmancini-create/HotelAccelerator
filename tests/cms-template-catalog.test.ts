import { describe, expect, it } from "vitest"
import { CMSBuilderDocumentSchema } from "@/lib/cms/builder-document"
import { CMS_TEMPLATE_CATALOG, createDocumentFromTemplate } from "@/lib/cms/template-catalog"

describe("CMS template catalog", () => {
  it("contains unique template ids", () => {
    const ids = CMS_TEMPLATE_CATALOG.map((template) => template.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it.each(CMS_TEMPLATE_CATALOG.map((template) => [template.id]))("creates a valid document for %s", (templateId) => {
    const document = createDocumentFromTemplate(templateId)
    expect(CMSBuilderDocumentSchema.safeParse(document).success).toBe(true)
    expect(document.templateId).toBe(templateId)
    expect(document.pages[0].sections.length).toBeGreaterThanOrEqual(4)
  })

  it("falls back to luxury for an unknown template", () => {
    expect(createDocumentFromTemplate("missing").templateId).toBe("luxury")
  })
})
