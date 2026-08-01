import { z } from "zod"

export const CMS_BUILDER_SCHEMA_VERSION = 1 as const

const IdSchema = z.string().min(1).max(120).regex(/^[a-zA-Z0-9_-]+$/, "ID non valido")
const HexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Colore esadecimale non valido")
const SafeLinkSchema = z.string().max(2048).refine(
  (value) => value.startsWith("/") || value.startsWith("#") || /^https:\/\//i.test(value) || /^mailto:/i.test(value) || /^tel:/i.test(value),
  "Link non consentito",
)

export const ResponsivePlacementSchema = z.object({
  order: z.number().int().min(0).max(999).default(0),
  columnStart: z.number().int().min(1).max(12).default(1),
  columnSpan: z.number().int().min(1).max(12).default(12),
  align: z.enum(["start", "center", "end", "stretch"]).default("stretch"),
  hidden: z.boolean().default(false),
})

export const ElementPlacementSchema = z.object({
  desktop: ResponsivePlacementSchema,
  tablet: ResponsivePlacementSchema,
  mobile: ResponsivePlacementSchema,
})

const BaseElementSchema = z.object({
  id: IdSchema,
  placement: ElementPlacementSchema,
  locked: z.boolean().default(false),
})

export const HeadingElementSchema = BaseElementSchema.extend({
  type: z.literal("heading"),
  content: z.string().max(500),
  level: z.enum(["h1", "h2", "h3", "h4"]).default("h2"),
  textAlign: z.enum(["left", "center", "right"]).default("left"),
})

export const TextElementSchema = BaseElementSchema.extend({
  type: z.literal("text"),
  content: z.string().max(20000),
  textAlign: z.enum(["left", "center", "right"]).default("left"),
})

export const ImageElementSchema = BaseElementSchema.extend({
  type: z.literal("image"),
  mediaId: z.string().uuid().optional(),
  src: z.string().url().optional(),
  alt: z.string().max(500),
  fit: z.enum(["cover", "contain"]).default("cover"),
  focalPoint: z.object({ x: z.number().min(0).max(100), y: z.number().min(0).max(100) }).default({ x: 50, y: 50 }),
}).refine((value) => Boolean(value.mediaId || value.src), "Immagine senza sorgente")

export const ButtonElementSchema = BaseElementSchema.extend({
  type: z.literal("button"),
  label: z.string().min(1).max(160),
  href: SafeLinkSchema,
  variant: z.enum(["primary", "secondary", "outline", "link"]).default("primary"),
  openInNewTab: z.boolean().default(false),
})

export const BookingElementSchema = BaseElementSchema.extend({
  type: z.literal("booking-widget"),
  mode: z.enum(["inline", "button", "bar"]).default("button"),
  label: z.string().min(1).max(160).default("Prenota"),
})

export const SpacerElementSchema = BaseElementSchema.extend({
  type: z.literal("spacer"),
  height: z.object({
    desktop: z.number().int().min(0).max(400),
    tablet: z.number().int().min(0).max(300),
    mobile: z.number().int().min(0).max(200),
  }),
})

export const BuilderElementSchema = z.discriminatedUnion("type", [
  HeadingElementSchema,
  TextElementSchema,
  ImageElementSchema,
  ButtonElementSchema,
  BookingElementSchema,
  SpacerElementSchema,
])

export const BuilderSectionSchema = z.object({
  id: IdSchema,
  type: z.enum(["hero", "content", "gallery", "rooms", "offers", "spa", "restaurant", "reviews", "contact", "custom"]),
  variant: z.string().min(1).max(80).default("default"),
  label: z.string().min(1).max(160),
  background: z.object({
    color: HexColorSchema.optional(),
    mediaId: z.string().uuid().optional(),
    overlayOpacity: z.number().min(0).max(1).default(0),
  }).default({ overlayOpacity: 0 }),
  gridColumns: z.object({
    desktop: z.number().int().min(1).max(12).default(12),
    tablet: z.number().int().min(1).max(12).default(8),
    mobile: z.number().int().min(1).max(4).default(4),
  }),
  elements: z.array(BuilderElementSchema).max(100),
})

export const BuilderPageSchema = z.object({
  id: IdSchema,
  title: z.string().min(1).max(200),
  slug: z.string().min(1).max(240).regex(/^\/?[a-z0-9]+(?:[\/-][a-z0-9]+)*$/, "Slug non valido"),
  language: z.string().min(2).max(10).default("it"),
  seo: z.object({
    title: z.string().max(70).default(""),
    description: z.string().max(180).default(""),
    noindex: z.boolean().default(false),
  }),
  sections: z.array(BuilderSectionSchema).max(80),
})

export const CMSBuilderDocumentSchema = z.object({
  schemaVersion: z.literal(CMS_BUILDER_SCHEMA_VERSION),
  templateId: z.string().min(1).max(120),
  designTokens: z.object({
    colors: z.object({
      primary: HexColorSchema,
      secondary: HexColorSchema,
      background: HexColorSchema,
      foreground: HexColorSchema,
      accent: HexColorSchema,
    }),
    typography: z.object({
      headingFamily: z.string().min(1).max(120),
      bodyFamily: z.string().min(1).max(120),
      baseSize: z.number().int().min(14).max(22).default(16),
    }),
    radius: z.enum(["none", "small", "medium", "large"]).default("medium"),
    spacingScale: z.enum(["compact", "normal", "relaxed"]).default("normal"),
  }),
  navigation: z.array(z.object({
    id: IdSchema,
    label: z.string().min(1).max(120),
    href: SafeLinkSchema,
    order: z.number().int().min(0).max(999),
  })).max(100),
  pages: z.array(BuilderPageSchema).min(1).max(200),
  warnings: z.array(z.object({
    code: z.string().min(1).max(80),
    severity: z.enum(["info", "warning", "error"]),
    message: z.string().min(1).max(500),
    nodeId: IdSchema.optional(),
  })).max(500).default([]),
})

export const BuilderCommandSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("move_element"),
    pageId: IdSchema,
    elementId: IdSchema,
    targetSectionId: IdSchema,
    placement: ElementPlacementSchema,
  }),
  z.object({
    action: z.literal("reorder_section"),
    pageId: IdSchema,
    sectionId: IdSchema,
    targetIndex: z.number().int().min(0).max(79),
  }),
  z.object({
    action: z.literal("update_element"),
    pageId: IdSchema,
    sectionId: IdSchema,
    elementId: IdSchema,
    patch: z.record(z.unknown()),
  }),
  z.object({
    action: z.literal("set_visibility"),
    pageId: IdSchema,
    sectionId: IdSchema,
    elementId: IdSchema,
    breakpoint: z.enum(["desktop", "tablet", "mobile"]),
    hidden: z.boolean(),
  }),
])

export type CMSBuilderDocument = z.infer<typeof CMSBuilderDocumentSchema>
export type BuilderCommand = z.infer<typeof BuilderCommandSchema>

export function createEmptyBuilderDocument(templateId: string): CMSBuilderDocument {
  return CMSBuilderDocumentSchema.parse({
    schemaVersion: CMS_BUILDER_SCHEMA_VERSION,
    templateId,
    designTokens: {
      colors: {
        primary: "#1F5132",
        secondary: "#C9A66B",
        background: "#FFFFFF",
        foreground: "#171717",
        accent: "#E9F3EC",
      },
      typography: { headingFamily: "serif", bodyFamily: "sans-serif", baseSize: 16 },
      radius: "medium",
      spacingScale: "normal",
    },
    navigation: [{ id: "nav-home", label: "Home", href: "/", order: 0 }],
    pages: [{
      id: "page-home",
      title: "Home",
      slug: "/",
      language: "it",
      seo: { title: "", description: "", noindex: false },
      sections: [],
    }],
    warnings: [],
  })
}
