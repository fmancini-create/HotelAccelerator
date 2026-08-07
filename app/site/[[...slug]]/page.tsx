import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { BuilderLiveRenderer } from "@/components/cms/builder-live-renderer"
import { CMSBuilderDocumentSchema } from "@/lib/cms/builder-document"
import { getCurrentTenant } from "@/lib/get-tenant"
import { createServiceClient } from "@/lib/supabase/server"
import { FourBidCredit } from "@/components/cms/four-bid-credit"
import { TenantPolicyPage } from "@/components/cms/tenant-policy-page"
import { isModuleActive } from "@/lib/modules"
import { mapPropertyToSiteSettings } from "@/lib/cms/tenant-site-settings"

type Props = { params: Promise<{ slug?: string[] }> }

async function publicationForCurrentTenant() {
  const tenant = await getCurrentTenant()
  if (!tenant) return null
  // The public route runs exclusively on the server. Use the service client so
  // publication reads keep working without exposing database grants to anon.
  const db = createServiceClient()
  const [{ data, error }, { data: property, error: propertyError }, whiteLabel] = await Promise.all([
    db.from("public_cms_publications").select("id, version, document, published_at").eq("property_id", tenant.id).maybeSingle(),
    db.from("properties").select("billing_company_name, billing_vat, billing_tax_code, billing_address, billing_city, billing_postal_code, billing_province, billing_email, legal_rea, legal_registry, legal_share_capital, site_privacy_policy, site_cookie_policy").eq("id", tenant.id).single(),
    isModuleActive(db, tenant.id, "white_label"),
  ])
  if (error) {
    console.error("[cms-publication] Failed to load published site", {
      propertyId: tenant.id,
      code: error.code,
      message: error.message,
    })
    return null
  }
  if (propertyError) {
    console.error("[cms-publication] Failed to load tenant legal settings", { propertyId: tenant.id, code: propertyError.code })
  }
  if (!data) return null
  const parsed = CMSBuilderDocumentSchema.safeParse(data.document)
  return parsed.success ? { tenant, publication: data, document: parsed.data, siteSettings: mapPropertyToSiteSettings((property || {}) as Record<string, unknown>, whiteLabel) } : null
}

function requestedPath(slug?: string[]) {
  return slug?.length ? `/${slug.join("/")}` : "/"
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const [{ slug }, release] = await Promise.all([params, publicationForCurrentTenant()])
  if (!release) return { title: "Sito non pubblicato", robots: { index: false, follow: false } }
  const path = requestedPath(slug)
  if (path === "/privacy-policy" || path === "/cookie-policy") return { title: path === "/privacy-policy" ? "Privacy Policy" : "Cookie Policy", robots: { index: false, follow: true } }
  const page = release.document.pages.find((item) => item.slug === path)
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
  if (!release) return <main className="flex min-h-screen flex-col items-center justify-center gap-12 px-5"><div className="text-center"><h1 className="text-2xl font-semibold">Sito temporaneamente non disponibile</h1><p className="mt-2 text-muted-foreground">La struttura sta aggiornando il proprio sito.</p></div><FourBidCredit label="Sito e marketing in fase di realizzazione by" /></main>
  const path = requestedPath(slug)
  if (path === "/privacy-policy" || path === "/cookie-policy") return <TenantPolicyPage kind={path === "/privacy-policy" ? "privacy" : "cookie"} settings={release.siteSettings} />
  const page = release.document.pages.find((item) => item.slug === path)
  if (!page) notFound()
  return <BuilderLiveRenderer document={release.document} pageId={page.id} siteSettings={release.siteSettings} />
}
