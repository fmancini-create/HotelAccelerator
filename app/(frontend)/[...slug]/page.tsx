import { createServerClient } from "@/lib/supabase/server"
import { getCurrentTenant, isPlatformDomain } from "@/lib/get-tenant"
import { notFound, redirect } from "next/navigation"
import { SectionRenderer } from "@/components/cms/section-renderer"
import { Navigation } from "@/components/navigation"
import { Footer } from "@/components/footer"
import type { Metadata } from "next"

// Questa route catch-all nel gruppo (frontend) gestisce:
// 1. Prima cerca una pagina CMS con quello slug
// 2. Se non trova, restituisce 404 (le pagine statiche hanno route dedicate)

interface PageProps {
  params: Promise<{ slug: string[] }>
}

const PROTECTED_ROUTES = [
  "admin",
  "super-admin",
  "api",
  "request-access",
  "p",
  "_next",
  "favicon.ico",
  "robots.txt",
  "sitemap.xml",
]

// Genera metadata dinamici per SEO
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const fullSlug = slug.join("/")

  // Se siamo sul dominio piattaforma, non servire pagine CMS tenant
  if (await isPlatformDomain()) {
    return {}
  }

  const tenant = await getCurrentTenant()
  if (!tenant) {
    return {}
  }

  const supabase = await createServerClient()
  const { data: page } = await supabase
    .from("cms_pages")
    .select("title, seo_title, seo_description, seo_noindex")
    .eq("property_id", tenant.id)
    .eq("slug", fullSlug)
    .eq("status", "published")
    .single()

  if (!page) {
    return {}
  }

  return {
    title: page.seo_title || page.title,
    description: page.seo_description || undefined,
    robots: page.seo_noindex ? { index: false, follow: false } : undefined,
  }
}

export default async function CMSCatchAllPage({ params }: PageProps) {
  const { slug } = await params
  const fullSlug = slug.join("/")

  const firstSegment = slug[0]?.toLowerCase()
  if (PROTECTED_ROUTES.includes(firstSegment)) {
    notFound()
  }

  // Se siamo sul dominio piattaforma, redirect alla home
  if (await isPlatformDomain()) {
    redirect("/")
  }

  const tenant = await getCurrentTenant()
  if (!tenant) {
    notFound()
  }

  // Cerca la pagina CMS con questo slug
  const supabase = await createServerClient()
  const { data: page, error } = await supabase
    .from("cms_pages")
    .select("*")
    .eq("property_id", tenant.id)
    .eq("slug", fullSlug)
    .eq("status", "published")
    .single()

  // Se non c'è pagina CMS, mostra placeholder
  if (error || !page) {
    return (
      <>
        <Navigation />
        <main className="min-h-screen flex items-center justify-center bg-[#f5f3f0]">
          <div className="text-center space-y-4 p-8">
            <h1 className="text-3xl font-serif text-[#8b7355]">Página no encontrada</h1>
            <p className="text-[#7a7a7a]">Esta página está en construcción.</p>
          </div>
        </main>
        <Footer />
      </>
    )
  }

  const sections = (page.sections as Array<{ id: string; type: string; data: Record<string, unknown> }>) || []

  // Se la pagina non ha sezioni, mostra placeholder
  if (sections.length === 0) {
    return (
      <>
        <Navigation />
        <main className="min-h-screen flex items-center justify-center bg-[#f5f3f0]">
          <div className="text-center space-y-4 p-8">
            <h1 className="text-3xl font-serif text-[#8b7355]">{page.title}</h1>
            <p className="text-[#7a7a7a]">Questa pagina è in costruzione.</p>
          </div>
        </main>
        <Footer />
      </>
    )
  }

  return (
    <>
      <Navigation />
      <main className="min-h-screen">
        {sections.map((section) => (
          <SectionRenderer key={section.id} section={section as any} />
        ))}
      </main>
      <Footer />
    </>
  )
}
