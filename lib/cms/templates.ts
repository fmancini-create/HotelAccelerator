import { createServerClient } from "@/lib/supabase/server"

// Tipi per i templates CMS
export interface CMSTemplate {
  id: string
  property_id: string | null
  name: string
  slug: string
  description: string | null
  thumbnail_url: string | null
  category: string
  is_system: boolean
  is_active: boolean
  theme_config: ThemeConfig
  page_layouts: Record<string, string[]>
  default_sections: Record<string, SectionDefault[]>
  created_at: string
  updated_at: string
}

export interface ThemeConfig {
  colors: {
    primary: string
    secondary: string
    accent: string
    background: string
    text: string
    heading: string
  }
  fonts: {
    heading: string
    body: string
  }
  style: string
}

export interface SectionDefault {
  type: string
  data: Record<string, unknown>
}

export type PageType = "home" | "room" | "service" | "location" | "contact" | "gallery" | "custom"

// Ottenere tutti i templates disponibili per un tenant
export async function getAvailableTemplates(propertyId?: string): Promise<CMSTemplate[]> {
  const supabase = await createServerClient()

  let query = supabase.from("cms_templates").select("*").eq("is_active", true)

  if (propertyId) {
    // Templates di piattaforma (property_id = null) + templates custom del tenant
    query = query.or(`property_id.is.null,property_id.eq.${propertyId}`)
  } else {
    // Solo templates di piattaforma
    query = query.is("property_id", null)
  }

  const { data, error } = await query.order("is_system", { ascending: false })

  if (error) {
    console.error("[CMS Templates] Error fetching templates:", error)
    return []
  }

  return data || []
}

// Ottenere un template specifico
export async function getTemplate(templateId: string): Promise<CMSTemplate | null> {
  const supabase = await createServerClient()

  const { data, error } = await supabase.from("cms_templates").select("*").eq("id", templateId).single()

  if (error) {
    console.error("[CMS Templates] Error fetching template:", error)
    return null
  }

  return data
}

// Ottenere il template di default (Villa I Barronci)
export async function getDefaultTemplate(): Promise<CMSTemplate | null> {
  const supabase = await createServerClient()

  const { data, error } = await supabase.from("cms_templates").select("*").eq("slug", "villa-i-barronci").single()

  if (error) {
    console.error("[CMS Templates] Error fetching default template:", error)
    return null
  }

  return data
}

// Ottenere le sezioni di default per un tipo di pagina
export function getDefaultSectionsForPageType(template: CMSTemplate, pageType: PageType): SectionDefault[] {
  return template.default_sections[pageType] || []
}

// Ottenere il layout suggerito per un tipo di pagina
export function getSuggestedLayoutForPageType(template: CMSTemplate, pageType: PageType): string[] {
  return template.page_layouts[pageType] || []
}

// Applicare il tema del template ai CSS variables
export function getThemeCSSVariables(theme: ThemeConfig): Record<string, string> {
  return {
    "--color-primary": theme.colors.primary,
    "--color-secondary": theme.colors.secondary,
    "--color-accent": theme.colors.accent,
    "--color-background": theme.colors.background,
    "--color-text": theme.colors.text,
    "--color-heading": theme.colors.heading,
    "--font-heading": theme.fonts.heading,
    "--font-body": theme.fonts.body,
  }
}

// Tipi di pagina disponibili con metadata
export const PAGE_TYPES: Record<PageType, { label: string; description: string; icon: string }> = {
  home: {
    label: "Homepage",
    description: "Pagina principale del sito",
    icon: "🏠",
  },
  room: {
    label: "Camera",
    description: "Pagina di una camera o suite",
    icon: "🛏️",
  },
  service: {
    label: "Servizio",
    description: "Pagina di un servizio (spa, ristorante, etc.)",
    icon: "🛎️",
  },
  location: {
    label: "Località",
    description: "Pagina di una località o attrazione",
    icon: "📍",
  },
  contact: {
    label: "Contatti",
    description: "Pagina con form di contatto",
    icon: "📧",
  },
  gallery: {
    label: "Galleria",
    description: "Pagina con galleria fotografica",
    icon: "🖼️",
  },
  custom: {
    label: "Personalizzata",
    description: "Pagina con layout libero",
    icon: "✨",
  },
}

// Lingue supportate
export const SUPPORTED_LANGUAGES = [
  { code: "it", label: "Italiano", flag: "🇮🇹" },
  { code: "en", label: "English", flag: "🇬🇧" },
  { code: "de", label: "Deutsch", flag: "🇩🇪" },
  { code: "fr", label: "Français", flag: "🇫🇷" },
]
