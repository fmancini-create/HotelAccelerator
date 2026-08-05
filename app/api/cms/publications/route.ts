import { type NextRequest, NextResponse } from "next/server"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"
import { CMS_BUILDER_SCHEMA_VERSION, CMSBuilderDocumentSchema } from "@/lib/cms/builder-document"
import { normalizeBuilderNavigation } from "@/lib/cms/normalize-builder-navigation"
import { tenantSubdomainHost } from "@/lib/domains/domain-names"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { inspectProjectDomain } from "@/lib/vercel/project-domains"

function statusFor(message: string) {
  return message.includes("Non autenticato") ? 401 : 500
}

type PublicSiteProperty = {
  active_cms_publication_id: string | null
  active_domain_type: string | null
  custom_domain: string | null
  domain_status: string | null
  frontend_enabled: boolean | null
  subdomain: string | null
}

async function publicSiteState(property: PublicSiteProperty | null) {
  if (!property?.active_cms_publication_id) {
    return { url: null, ready: false, status: "not_published", message: "Nessuna versione pubblicata" }
  }
  if (!property.frontend_enabled) {
    return { url: null, ready: false, status: "disabled", message: "Sito pubblico disattivato" }
  }
  const hostname = property.active_domain_type === "custom_domain"
    ? property.custom_domain
    : property.subdomain
      ? tenantSubdomainHost(property.subdomain)
      : null
  const readiness = await inspectProjectDomain(hostname)
  return {
    url: readiness.ready && readiness.name ? `https://${readiness.name}` : null,
    ready: readiness.ready,
    status: readiness.status,
    message: readiness.message,
  }
}

export async function GET(request: NextRequest) {
  try {
    const propertyId = await getAuthenticatedPropertyId(request)
    const db = createServiceClient()
    const [{ data: versions, error }, { data: property, error: propertyError }] = await Promise.all([
      db.from("cms_publication_versions")
        .select("id, version, source_version_id, published_at, published_by")
        .eq("property_id", propertyId).order("version", { ascending: false }).limit(50),
      db.from("properties")
        .select("active_cms_publication_id, active_domain_type, custom_domain, domain_status, frontend_enabled, subdomain")
        .eq("id", propertyId).single(),
    ])
    if (error || propertyError) return NextResponse.json({ error: error?.message || propertyError?.message }, { status: 500 })
    const publicSite = await publicSiteState(property)
    return NextResponse.json({
      publications: versions ?? [],
      activeId: property?.active_cms_publication_id ?? null,
      publicUrl: publicSite.url,
      publicSite,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Errore sconosciuto"
    return NextResponse.json({ error: message }, { status: statusFor(message) })
  }
}

export async function POST(request: NextRequest) {
  try {
    const propertyId = await getAuthenticatedPropertyId(request)
    const body = await request.json().catch(() => ({}))
    const db = createServiceClient()
    const auth = await createClient()
    const { data: { user } } = await auth.auth.getUser()

    let sourceVersionId: string | null = null
    let candidate: unknown
    if (typeof body.rollback_to === "string") {
      const { data: source, error } = await db.from("cms_publication_versions")
        .select("id, document").eq("id", body.rollback_to).eq("property_id", propertyId).single()
      if (error || !source) return NextResponse.json({ error: "Versione di rollback non trovata" }, { status: 404 })
      sourceVersionId = source.id
      candidate = source.document
    } else {
      const { data: draft, error } = await db.from("cms_ai_projects")
        .select("builder_document").eq("property_id", propertyId).single()
      if (error || !draft?.builder_document) return NextResponse.json({ error: "Nessuna bozza CMS da pubblicare" }, { status: 400 })
      candidate = draft.builder_document
    }

    const validation = CMSBuilderDocumentSchema.safeParse(candidate)
    if (!validation.success) return NextResponse.json({ error: "Documento CMS non valido", details: validation.error.flatten() }, { status: 400 })
    const document = normalizeBuilderNavigation(validation.data)
    const blockingWarnings = document.warnings.filter((warning) => warning.severity === "error")
    if (blockingWarnings.length) return NextResponse.json({ error: "La pubblicazione contiene errori bloccanti", warnings: blockingWarnings }, { status: 409 })

    const { data: rows, error: publishError } = await db.rpc("publish_cms_version", {
      p_property_id: propertyId,
      p_document: document,
      p_builder_schema_version: CMS_BUILDER_SCHEMA_VERSION,
      p_published_by: user?.id ?? null,
      p_source_version_id: sourceVersionId,
    })
    const publication = rows?.[0]
    if (publishError || !publication) return NextResponse.json({ error: publishError?.message || "Pubblicazione non riuscita" }, { status: 500 })
    return NextResponse.json({ publication }, { status: 201 })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Errore sconosciuto"
    return NextResponse.json({ error: message }, { status: statusFor(message) })
  }
}
