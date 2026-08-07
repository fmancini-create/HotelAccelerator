import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { BuilderLiveRenderer } from "@/components/cms/builder-live-renderer"
import { CMSBuilderDocumentSchema } from "@/lib/cms/builder-document"
import { getCurrentTenant } from "@/lib/get-tenant"
import { createServiceClient } from "@/lib/supabase/server"

type Props = { params: Promise<{ slug?: string[] }> }

async function publicationForCurrentTenant() {
  const tenant = await getCurrentTenant()
  if (!tenant) return null
  // The public route runs exclusively on the server. Use the service client so
  // publication reads keep working without exposing database grants to anon.
  const db = createServiceClient()
  const { data, error } = await db.from("public_cms_publications")
    .select("id, version, document, published_at")
    .eq("property_id", tenant.id).maybeSingle()
  if (error) {
    console.error("[cms-publication] Failed to load published site", {
      propertyId: tenant.id,
      code: error.code,
      message: error.message,
    })
    return null
  }
  if (!data) return null
  const parsed = CMSBuilderDocumentSchema.safeParse(data.document)
  return parsed.success ? { tenant, publication: data, document: parsed.data } : null
}

function requestedPath(slug?: string[]) {
  return slug?.length ? `/${slug.join("/")}` : "/"
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const [{ slug }, release] = await Promise.all([params, publicationForCurrentTenant()])
  if (!release) return { title: "Sito non pubblicato", robots: { index: false, follow: false } }
  const page = release.document.pages.find((item) => item.slug === requestedPath(slug))
  if (!page) return { title: "Pagina non trovata", robots: { index: false, follow: false } }
  return {
    title: page.seo.title || page.title,
    description: page.seo.description || undefined,
    robots: page.seo.noindex ? { index: false, follow: false } : { index: true, follow: true },
    alternates: { canonical: page.slug },
  }
}

export default async function PublishedTenantPage({ params }: Props) {
  const [{ slug }, release] = await Promise.all([params, publicationForCurrentTenant()])
  if (!release) return <main className="flex min-h-screen items-center justify-center"><div className="text-center"><h1 className="text-2xl font-semibold">Sito in preparazione</h1><p className="mt-2 text-muted-foreground">Non è ancora presente una versione pubblicata.</p></div></main>
  const page = release.document.pages.find((item) => item.slug === requestedPath(slug))
  if (!page) notFound()
  return <BuilderLiveRenderer document={release.document} pageId={page.id} />
}
