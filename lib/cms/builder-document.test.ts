import { describe, expect, it } from "vitest"
import {
  BuilderCommandSchema,
  CMSBuilderDocumentSchema,
  createEmptyBuilderDocument,
} from "./builder-document"

describe("CMS builder document v1", () => {
  it("creates a valid empty tenant document", () => {
    const document = createEmptyBuilderDocument("luxury")

    expect(document.schemaVersion).toBe(1)
    expect(document.pages[0]?.slug).toBe("/")
    expect(CMSBuilderDocumentSchema.safeParse(document).success).toBe(true)
  })

  it("rejects executable links", () => {
    const document = createEmptyBuilderDocument("luxury")
    document.navigation[0]!.href = "javascript:alert(1)"

    expect(CMSBuilderDocumentSchema.safeParse(document).success).toBe(false)
  })

  it("accepts a responsive move command", () => {
    const result = BuilderCommandSchema.safeParse({
      action: "move_element",
      pageId: "page-home",
      elementId: "booking-cta",
      targetSectionId: "hero-main",
      placement: {
        desktop: { order: 2, columnStart: 7, columnSpan: 4, align: "center", hidden: false },
        tablet: { order: 2, columnStart: 1, columnSpan: 8, align: "center", hidden: false },
        mobile: { order: 3, columnStart: 1, columnSpan: 4, align: "stretch", hidden: false },
      },
    })

    expect(result.success).toBe(true)
  })

  it("rejects placements outside the responsive grid", () => {
    const result = BuilderCommandSchema.safeParse({
      action: "set_visibility",
      pageId: "page-home",
      sectionId: "hero-main",
      elementId: "booking-cta",
      breakpoint: "watch",
      hidden: true,
    })

    expect(result.success).toBe(false)
  })
})
