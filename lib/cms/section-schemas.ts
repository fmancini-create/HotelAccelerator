import { z } from "zod"

// ===========================================
// SECTION TYPES & METADATA
// ===========================================

export const SECTION_TYPES = {
  // Generic sections
  hero: { label: "Hero", icon: "🖼️", description: "Banner principale con titolo e CTA" },
  text: { label: "Testo", icon: "📝", description: "Blocco di testo con formattazione" },
  image: { label: "Immagine", icon: "🏞️", description: "Singola immagine con didascalia" },
  gallery: { label: "Galleria", icon: "🖼️", description: "Griglia di immagini" },
  video: { label: "Video", icon: "🎬", description: "Video embed (YouTube, Vimeo)" },
  cta: { label: "Call to Action", icon: "🎯", description: "Box con bottone d'azione" },
  testimonials: { label: "Testimonianze", icon: "💬", description: "Slider di recensioni" },
  features: { label: "Features", icon: "✨", description: "Griglia di caratteristiche" },
  pricing: { label: "Prezzi", icon: "💰", description: "Tabella prezzi" },
  contact_form: { label: "Form Contatto", icon: "📧", description: "Modulo di contatto" },
  map: { label: "Mappa", icon: "📍", description: "Mappa interattiva" },
  faq: { label: "FAQ", icon: "❓", description: "Domande frequenti" },
  spacer: { label: "Spaziatore", icon: "↕️", description: "Spazio vuoto configurabile" },

  villa_hero_slider: { label: "Hero Slider Villa", icon: "🏛️", description: "Hero con slider immagini stile Villa" },
  villa_hero_gallery: { label: "Hero Gallery", icon: "🖼️", description: "Hero con galleria foto dinamica" },
  villa_about: { label: "About Villa", icon: "📜", description: "Sezione about con testo e decorazioni" },
  villa_pool: { label: "Piscina", icon: "🏊", description: "Sezione piscina con foto categoria" },
  villa_restaurant: { label: "Ristorante", icon: "🍽️", description: "Sezione ristorante" },
  villa_florence: { label: "Firenze", icon: "🏰", description: "Sezione Firenze" },
  villa_three_features: { label: "Tre Features", icon: "🌟", description: "Tre icone con descrizione" },
  villa_cta_icons: { label: "CTA Icons", icon: "🔗", description: "Barra CTA con icone" },
  villa_cantina: { label: "Cantina Antinori", icon: "🍷", description: "Sezione cantina Antinori" },
  villa_room_gallery: { label: "Galleria Camere", icon: "🛏️", description: "Galleria foto camera con categoria" },
  villa_room_intro: { label: "Intro Camera", icon: "📝", description: "Introduzione camera con titolo e CTA" },
  villa_spa: { label: "Spa", icon: "💆", description: "Sezione spa e benessere" },
  villa_services: { label: "Servizi", icon: "🛎️", description: "Lista servizi disponibili" },
} as const

export type SectionType = keyof typeof SECTION_TYPES

// ===========================================
// SECTION SCHEMAS (Zod)
// ===========================================

export const HeroSectionSchema = z.object({
  title: z.string().min(1, "Titolo richiesto"),
  subtitle: z.string().optional(),
  backgroundImage: z.string().url().optional(),
  ctaText: z.string().optional(),
  ctaLink: z.string().optional(),
  alignment: z.enum(["left", "center", "right"]).default("center"),
})

export const TextSectionSchema = z.object({
  title: z.string().optional(),
  content: z.string().min(1, "Contenuto richiesto"),
  headingLevel: z.enum(["h2", "h3", "h4"]).default("h2"),
})

export const ImageSectionSchema = z.object({
  src: z.string().url("URL immagine non valido"),
  alt: z.string().min(1, "Alt text richiesto per SEO"),
  caption: z.string().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
})

export const GallerySectionSchema = z.object({
  title: z.string().optional(),
  images: z.array(
    z.object({
      src: z.string().url(),
      alt: z.string(),
      caption: z.string().optional(),
    }),
  ),
  columns: z.number().min(1).max(6).default(3),
})

export const VideoSectionSchema = z.object({
  title: z.string().optional(),
  url: z.string().url("URL video non valido"),
  provider: z.enum(["youtube", "vimeo", "other"]).default("youtube"),
})

export const CTASectionSchema = z.object({
  title: z.string().min(1, "Titolo richiesto"),
  description: z.string().optional(),
  buttonText: z.string().min(1, "Testo bottone richiesto"),
  buttonLink: z.string().min(1, "Link bottone richiesto"),
  variant: z.enum(["primary", "secondary", "outline"]).default("primary"),
})

export const TestimonialsSectionSchema = z.object({
  title: z.string().optional(),
  items: z.array(
    z.object({
      name: z.string(),
      role: z.string().optional(),
      quote: z.string(),
      avatar: z.string().url().optional(),
      rating: z.number().min(1).max(5).optional(),
    }),
  ),
})

export const FeaturesSectionSchema = z.object({
  title: z.string().optional(),
  subtitle: z.string().optional(),
  items: z.array(
    z.object({
      icon: z.string().optional(),
      title: z.string(),
      description: z.string(),
    }),
  ),
  columns: z.number().min(1).max(4).default(3),
})

export const PricingSectionSchema = z.object({
  title: z.string().optional(),
  items: z.array(
    z.object({
      name: z.string(),
      price: z.string(),
      period: z.string().optional(),
      description: z.string().optional(),
      features: z.array(z.string()),
      highlighted: z.boolean().default(false),
      ctaText: z.string().optional(),
      ctaLink: z.string().optional(),
    }),
  ),
})

export const ContactFormSectionSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  email: z.string().email("Email non valida"),
  fields: z
    .array(
      z.object({
        name: z.string(),
        label: z.string(),
        type: z.enum(["text", "email", "tel", "textarea"]),
        required: z.boolean().default(false),
      }),
    )
    .optional(),
})

export const MapSectionSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
  zoom: z.number().min(1).max(20).default(15),
  address: z.string().optional(),
  title: z.string().optional(),
})

export const FAQSectionSchema = z.object({
  title: z.string().optional(),
  items: z.array(
    z.object({
      question: z.string(),
      answer: z.string(),
    }),
  ),
})

export const SpacerSectionSchema = z.object({
  height: z.number().min(8).max(200).default(48),
})

export const VillaHeroSliderSchema = z.object({
  title: z.string(),
  subtitle: z.string().optional(),
  description: z.string().optional(),
  ctaText: z.string().optional(),
  ctaLink: z.string().optional(),
  images: z
    .array(
      z.object({
        src: z.string(),
        alt: z.string(),
      }),
    )
    .optional(),
})

export const VillaHeroGallerySchema = z.object({
  title: z.string(),
  subtitle: z.string().optional(),
  category: z.string(), // Categoria foto da caricare dinamicamente
  heroIndex: z.number().default(0),
})

export const VillaAboutSchema = z.object({
  title: z.string(),
  subtitle: z.string().optional(),
  description: z.string().optional(),
  content: z.string(),
})

export const VillaPoolSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  ctaText: z.string().optional(),
  ctaLink: z.string().optional(),
})

export const VillaRestaurantSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  ctaText: z.string().optional(),
  ctaLink: z.string().optional(),
})

export const VillaFlorenceSchema = z.object({
  lang: z.enum(["it", "en", "de", "fr"]).default("it"),
})

export const VillaThreeFeaturesSchema = z.object({
  lang: z.enum(["it", "en", "de", "fr"]).default("it"),
})

export const VillaCTAIconsSchema = z.object({
  lang: z.enum(["it", "en", "de", "fr"]).default("it"),
})

export const VillaCantinaSchema = z.object({
  lang: z.enum(["it", "en", "de", "fr"]).default("it"),
})

export const VillaRoomGallerySchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  category: z.string(), // Categoria foto da caricare
  columns: z.number().default(4),
})

export const VillaRoomIntroSchema = z.object({
  title: z.string(),
  subtitle: z.string().optional(),
  content: z.string(),
  ctaText: z.string().optional(),
  ctaLink: z.string().optional(),
  backgroundColor: z.string().default("#f5f3f0"),
})

export const VillaSpaSchema = z.object({
  title: z.string(),
  description: z.string().optional(),
  ctaText: z.string().optional(),
  ctaLink: z.string().optional(),
})

export const VillaServicesSchema = z.object({
  title: z.string(),
  items: z.array(
    z.object({
      icon: z.string().optional(),
      title: z.string(),
      description: z.string(),
      link: z.string().optional(),
    }),
  ),
})

// ===========================================
// SECTION SCHEMA MAP
// ===========================================

export const SECTION_SCHEMAS: Record<SectionType, z.ZodType> = {
  hero: HeroSectionSchema,
  text: TextSectionSchema,
  image: ImageSectionSchema,
  gallery: GallerySectionSchema,
  video: VideoSectionSchema,
  cta: CTASectionSchema,
  testimonials: TestimonialsSectionSchema,
  features: FeaturesSectionSchema,
  pricing: PricingSectionSchema,
  contact_form: ContactFormSectionSchema,
  map: MapSectionSchema,
  faq: FAQSectionSchema,
  spacer: SpacerSectionSchema,
  villa_hero_slider: VillaHeroSliderSchema,
  villa_hero_gallery: VillaHeroGallerySchema,
  villa_about: VillaAboutSchema,
  villa_pool: VillaPoolSchema,
  villa_restaurant: VillaRestaurantSchema,
  villa_florence: VillaFlorenceSchema,
  villa_three_features: VillaThreeFeaturesSchema,
  villa_cta_icons: VillaCTAIconsSchema,
  villa_cantina: VillaCantinaSchema,
  villa_room_gallery: VillaRoomGallerySchema,
  villa_room_intro: VillaRoomIntroSchema,
  villa_spa: VillaSpaSchema,
  villa_services: VillaServicesSchema,
}

// ===========================================
// SECTION DEFAULTS
// ===========================================

export function getSectionDefault(type: SectionType): Record<string, unknown> {
  switch (type) {
    case "hero":
      return { title: "Titolo Hero", subtitle: "", backgroundImage: "", ctaText: "", ctaLink: "", alignment: "center" }
    case "text":
      return { title: "", content: "Inserisci il testo qui...", headingLevel: "h2" }
    case "image":
      return { src: "", alt: "", caption: "" }
    case "gallery":
      return { title: "", images: [], columns: 3 }
    case "video":
      return { title: "", url: "", provider: "youtube" }
    case "cta":
      return {
        title: "Call to Action",
        description: "",
        buttonText: "Scopri di più",
        buttonLink: "/",
        variant: "primary",
      }
    case "testimonials":
      return { title: "Cosa dicono i nostri clienti", items: [] }
    case "features":
      return { title: "Le nostre caratteristiche", subtitle: "", items: [], columns: 3 }
    case "pricing":
      return { title: "Prezzi", items: [] }
    case "contact_form":
      return { title: "Contattaci", description: "", email: "" }
    case "map":
      return { latitude: 43.7696, longitude: 11.2558, zoom: 15, address: "", title: "" }
    case "faq":
      return { title: "Domande Frequenti", items: [] }
    case "spacer":
      return { height: 48 }
    case "villa_hero_slider":
      return {
        title: "VILLA I BARRONCI",
        subtitle: "RESORT & SPA",
        description: "",
        ctaText: "",
        ctaLink: "",
        images: [],
      }
    case "villa_hero_gallery":
      return { title: "", subtitle: "", category: "", heroIndex: 0 }
    case "villa_about":
      return { title: "Villa I Barronci", subtitle: "Resort & Spa", description: "", content: "" }
    case "villa_pool":
      return { title: "Piscina & Jacuzzi", description: "", ctaText: "SCOPRI", ctaLink: "/piscina-jacuzzi" }
    case "villa_restaurant":
      return { title: "Ristorante", description: "", ctaText: "SCOPRI", ctaLink: "/ristorante" }
    case "villa_florence":
      return { lang: "it" }
    case "villa_three_features":
      return { lang: "it" }
    case "villa_cta_icons":
      return { lang: "it" }
    case "villa_cantina":
      return { lang: "it" }
    case "villa_room_gallery":
      return { title: "", description: "", category: "", columns: 4 }
    case "villa_room_intro":
      return { title: "", subtitle: "", content: "", ctaText: "PRENOTA", ctaLink: "", backgroundColor: "#f5f3f0" }
    case "villa_spa":
      return { title: "Spa", description: "", ctaText: "SCOPRI", ctaLink: "/spa" }
    case "villa_services":
      return { title: "Servizi", items: [] }
    default:
      return {}
  }
}

// ===========================================
// VALIDATION HELPERS
// ===========================================

export const SectionSchema = z.object({
  id: z.string().uuid(),
  type: z.enum(Object.keys(SECTION_TYPES) as [SectionType, ...SectionType[]]),
  data: z.record(z.unknown()),
})

export const PageSchema = z.object({
  property_id: z.string().uuid(),
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/, "Slug può contenere solo lettere minuscole, numeri e trattini"),
  title: z.string().min(1, "Titolo richiesto"),
  status: z.enum(["draft", "published", "hidden"]).default("draft"),
  seo_title: z.string().nullable().optional(),
  seo_description: z.string().nullable().optional(),
  seo_noindex: z.boolean().default(false),
  sections: z.array(SectionSchema).default([]),
})

export type Section = z.infer<typeof SectionSchema>
export type Page = z.infer<typeof PageSchema>

export function validateSection(type: SectionType, data: unknown) {
  const schema = SECTION_SCHEMAS[type]
  if (!schema) {
    return { success: false, error: `Tipo sezione sconosciuto: ${type}` }
  }

  const result = schema.safeParse(data)
  if (!result.success) {
    return { success: false, error: result.error.errors.map((e) => e.message).join(", ") }
  }

  return { success: true, data: result.data }
}

export function validatePage(data: unknown) {
  const result = PageSchema.safeParse(data)
  if (!result.success) {
    return { success: false, error: result.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join(", ") }
  }

  // Valida ogni sezione
  for (const section of result.data.sections) {
    const sectionValidation = validateSection(section.type, section.data)
    if (!sectionValidation.success) {
      return { success: false, error: `Sezione ${section.type}: ${sectionValidation.error}` }
    }
  }

  return { success: true, data: result.data }
}
