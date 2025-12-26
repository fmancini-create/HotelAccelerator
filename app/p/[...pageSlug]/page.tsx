import { createServerClient } from "@/lib/supabase/server"
import { notFound } from "next/navigation"
import { SectionRenderer } from "@/components/cms/section-renderer"
import type { Metadata } from "next"

const DEFAULT_PROPERTY_SLUG = "villa-i-barronci"

interface Props {
  params: Promise<{ pageSlug: string[] }>
  searchParams: Promise<{ property?: string }>
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { pageSlug } = await params
  const { property: propertySlug } = await searchParams

  const fullSlug = pageSlug.join("/")

  const supabase = await createServerClient()
  if (!supabase) return { title: "Pagina non trovata" }

  const effectivePropertySlug = propertySlug || DEFAULT_PROPERTY_SLUG

  const { data: property } = await supabase
    .from("properties")
    .select("id")
    .or(`slug.eq.${effectivePropertySlug},subdomain.eq.${effectivePropertySlug}`)
    .single()

  const propertyId = property?.id || null

  if (!propertyId) return { title: "Pagina non trovata" }

  const { data: page } = await supabase
    .from("cms_pages")
    .select("title, seo_title, seo_description, seo_noindex")
    .eq("property_id", propertyId)
    .eq("slug", fullSlug)
    .eq("status", "published")
    .single()

  if (!page) return { title: "Pagina non trovata" }

  return {
    title: page.seo_title || page.title,
    description: page.seo_description || undefined,
    robots: page.seo_noindex ? { index: false, follow: false } : undefined,
  }
}

export default async function CMSPage({ params, searchParams }: Props) {
  const { pageSlug } = await params
  const { property: propertySlug } = await searchParams

  const fullSlug = pageSlug.join("/")

  console.log("[v0] CMS Page - fullSlug:", fullSlug)

  const supabase = await createServerClient()
  if (!supabase) {
    console.log("[v0] CMS Page - No supabase client")
    notFound()
  }

  const effectivePropertySlug = propertySlug || DEFAULT_PROPERTY_SLUG
  console.log("[v0] CMS Page - effectivePropertySlug:", effectivePropertySlug)

  const { data: property, error: propertyError } = await supabase
    .from("properties")
    .select("id, slug, subdomain")
    .or(`slug.eq.${effectivePropertySlug},subdomain.eq.${effectivePropertySlug}`)
    .single()

  console.log("[v0] CMS Page - property:", property, "error:", propertyError)

  const propertyId = property?.id || null

  if (!propertyId) {
    console.log("[v0] CMS Page - No property found")
    notFound()
  }

  // Carica la pagina
  const { data: page, error } = await supabase
    .from("cms_pages")
    .select("*")
    .eq("property_id", propertyId)
    .eq("slug", fullSlug)
    .eq("status", "published")
    .single()

  console.log("[v0] CMS Page - page:", page?.title, "sections count:", page?.sections?.length, "error:", error)

  if (error || !page) {
    console.log("[v0] CMS Page - Page not found or error")
    notFound()
  }

  const sections = (page.sections || []) as { id: string; type: string; data: Record<string, unknown> }[]

  console.log("[v0] CMS Page - Rendering", sections.length, "sections")

  if (sections.length === 0) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4 p-8">
          <h1 className="text-3xl font-serif text-foreground">{page.title}</h1>
          <p className="text-muted-foreground">Questa pagina è in costruzione.</p>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen">
      {sections.map((section) => {
        console.log("[v0] CMS Page - Rendering section:", section.type, section.id)
        return <SectionRenderer key={section.id} section={section as any} />
      })}
    </main>
  )
}
