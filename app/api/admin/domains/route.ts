import { type NextRequest, NextResponse } from "next/server"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"
import {
  normalizeCustomDomain,
  normalizeSubdomain,
  tenantSubdomainHost,
  validateCustomDomain,
  validateSubdomain,
} from "@/lib/domains/domain-names"
import { createServiceClient } from "@/lib/supabase/server"
import {
  addProjectDomain,
  inspectProjectDomain,
  isProjectDomainAutomationConfigured,
  removeProjectDomain,
  type DomainReadiness,
} from "@/lib/vercel/project-domains"

type ActiveDomainType = "subdomain" | "custom_domain"

type PropertyDomainRow = {
  id: string
  name: string
  subdomain: string | null
  custom_domain: string | null
  domain_status: string | null
  domain_verification_token: string | null
  domain_verified_at: string | null
  active_domain_type: ActiveDomainType | null
  frontend_enabled: boolean | null
  active_cms_publication_id: string | null
  updated_at: string | null
}

const PROPERTY_COLUMNS = `
  id,
  name,
  subdomain,
  custom_domain,
  domain_status,
  domain_verification_token,
  domain_verified_at,
  active_domain_type,
  frontend_enabled,
  active_cms_publication_id,
  updated_at
`

function statusFor(message: string) {
  return message.includes("Non autenticato") ? 401 : 500
}

function activeReadiness(
  property: PropertyDomainRow,
  subdomain: DomainReadiness,
  customDomain: DomainReadiness,
) {
  return property.active_domain_type === "custom_domain" ? customDomain : subdomain
}

async function responsePayload(property: PropertyDomainRow) {
  const [subdomain, customDomain] = await Promise.all([
    inspectProjectDomain(property.subdomain ? tenantSubdomainHost(property.subdomain) : null),
    inspectProjectDomain(property.custom_domain),
  ])
  const active = activeReadiness(property, subdomain, customDomain)
  const publicUrl = property.frontend_enabled && property.active_cms_publication_id && active.ready && active.name
    ? `https://${active.name}`
    : null
  return {
    property,
    automationConfigured: isProjectDomainAutomationConfigured(),
    domains: { subdomain, customDomain, active },
    publicSite: {
      url: publicUrl,
      ready: Boolean(publicUrl),
      status: !property.active_cms_publication_id
        ? "not_published"
        : !property.frontend_enabled
          ? "disabled"
          : active.status,
      message: !property.active_cms_publication_id
        ? "Pubblica almeno una versione CMS"
        : !property.frontend_enabled
          ? "Sito pubblico disattivato"
          : active.message,
    },
  }
}

async function loadProperty(propertyId: string): Promise<PropertyDomainRow> {
  const db = createServiceClient()
  const { data, error } = await db.from("properties").select(PROPERTY_COLUMNS).eq("id", propertyId).single()
  if (error || !data) throw new Error(error?.message || "Struttura non trovata")
  return data as PropertyDomainRow
}

export async function GET(request: NextRequest) {
  try {
    const propertyId = await getAuthenticatedPropertyId(request)
    return NextResponse.json(await responsePayload(await loadProperty(propertyId)))
  } catch (error) {
    const message = error instanceof Error ? error.message : "Errore sconosciuto"
    console.error("[DOMAINS] GET failed", error)
    return NextResponse.json({ error: message }, { status: statusFor(message) })
  }
}

export async function PUT(request: NextRequest) {
  let db: ReturnType<typeof createServiceClient> | null = null
  let propertyId: string | null = null
  let current: PropertyDomainRow | null = null
  let nextSubdomain: string | null = null
  let nextCustomDomain: string | null = null
  let subdomainProvisioned = false
  let customDomainProvisioned = false

  try {
    propertyId = await getAuthenticatedPropertyId(request)
    current = await loadProperty(propertyId)
    db = createServiceClient()
    const body = await request.json()
    nextSubdomain = body.subdomain === undefined ? current.subdomain : normalizeSubdomain(body.subdomain)
    nextCustomDomain = body.custom_domain === undefined ? current.custom_domain : normalizeCustomDomain(body.custom_domain)
    const activeDomainType = body.active_domain_type as ActiveDomainType
    const frontendEnabled = body.frontend_enabled === undefined ? Boolean(current.frontend_enabled) : Boolean(body.frontend_enabled)

    const subdomainError = validateSubdomain(nextSubdomain)
    if (subdomainError) return NextResponse.json({ error: subdomainError }, { status: 400 })
    const customDomainError = validateCustomDomain(nextCustomDomain)
    if (customDomainError) return NextResponse.json({ error: customDomainError }, { status: 400 })
    if (activeDomainType !== "subdomain" && activeDomainType !== "custom_domain") {
      return NextResponse.json({ error: "Tipo dominio non valido" }, { status: 400 })
    }
    if (activeDomainType === "subdomain" && !nextSubdomain) {
      return NextResponse.json({ error: "Inserisci un sottodominio prima di renderlo principale" }, { status: 400 })
    }
    if (activeDomainType === "custom_domain" && !nextCustomDomain) {
      return NextResponse.json({ error: "Inserisci un dominio personalizzato prima di renderlo principale" }, { status: 400 })
    }

    const subdomainChanged = nextSubdomain !== current.subdomain
    const customDomainChanged = nextCustomDomain !== current.custom_domain
    const claim = {
      subdomain: nextSubdomain,
      custom_domain: nextCustomDomain,
      active_domain_type: activeDomainType,
      frontend_enabled: frontendEnabled,
      ...(customDomainChanged
        ? {
            domain_status: nextCustomDomain ? "pending_verification" : "not_set",
            domain_verification_token: null,
            domain_verified_at: null,
          }
        : {}),
      updated_at: new Date().toISOString(),
    }

    // Reserve unique names in Postgres before touching Vercel. This prevents
    // two tenants racing for the same host and one cleanup removing the other's domain.
    const { error: claimError } = await db.from("properties").update(claim).eq("id", propertyId)
    if (claimError) {
      if (claimError.code === "23505") {
        const field = claimError.message.includes("custom_domain") ? "dominio" : "sottodominio"
        return NextResponse.json({ error: `Questo ${field} è già in uso` }, { status: 409 })
      }
      throw claimError
    }

    if (nextSubdomain && (subdomainChanged || activeDomainType === "subdomain")) {
      await addProjectDomain(tenantSubdomainHost(nextSubdomain))
      subdomainProvisioned = true
    }
    if (nextCustomDomain && (customDomainChanged || activeDomainType === "custom_domain")) {
      await addProjectDomain(nextCustomDomain)
      customDomainProvisioned = true
    }

    const [subdomainReadiness, customDomainReadiness] = await Promise.all([
      inspectProjectDomain(nextSubdomain ? tenantSubdomainHost(nextSubdomain) : null),
      inspectProjectDomain(nextCustomDomain),
    ])
    const ownership = customDomainReadiness.dns.find((item) => item.purpose === "ownership")
    const { error: statusError } = await db
      .from("properties")
      .update({
        domain_status: !nextCustomDomain
          ? "not_set"
          : customDomainReadiness.ready
            ? "active"
            : "pending_verification",
        domain_verification_token: ownership?.value ?? null,
        domain_verified_at: customDomainReadiness.ready ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", propertyId)
    if (statusError) throw statusError

    if (current.custom_domain && customDomainChanged) {
      await removeProjectDomain(current.custom_domain).catch((cleanupError) => {
        console.error("[DOMAINS] old custom domain cleanup failed", cleanupError)
      })
    }
    if (current.subdomain && subdomainChanged) {
      await removeProjectDomain(tenantSubdomainHost(current.subdomain)).catch((cleanupError) => {
        console.error("[DOMAINS] old subdomain cleanup failed", cleanupError)
      })
    }

    return NextResponse.json({ ...(await responsePayload(await loadProperty(propertyId))), success: true })
  } catch (error) {
    console.error("[DOMAINS] PUT failed", error)
    if (db && propertyId && current) {
      const { error: rollbackError } = await db
        .from("properties")
        .update({
          subdomain: current.subdomain,
          custom_domain: current.custom_domain,
          domain_status: current.domain_status,
          domain_verification_token: current.domain_verification_token,
          domain_verified_at: current.domain_verified_at,
          active_domain_type: current.active_domain_type,
          frontend_enabled: current.frontend_enabled,
          updated_at: current.updated_at,
        })
        .eq("id", propertyId)
      if (rollbackError) console.error("[DOMAINS] database rollback failed", rollbackError)
    }
    await Promise.all([
      subdomainProvisioned && nextSubdomain && nextSubdomain !== current?.subdomain
        ? removeProjectDomain(tenantSubdomainHost(nextSubdomain)).catch((cleanupError) => {
            console.error("[DOMAINS] new subdomain rollback failed", cleanupError)
          })
        : Promise.resolve(),
      customDomainProvisioned && nextCustomDomain && nextCustomDomain !== current?.custom_domain
        ? removeProjectDomain(nextCustomDomain).catch((cleanupError) => {
            console.error("[DOMAINS] new custom domain rollback failed", cleanupError)
          })
        : Promise.resolve(),
    ])
    const message = error instanceof Error ? error.message : "Errore sconosciuto"
    const publicMessage = message.includes("Configurazione Vercel")
      ? "Automazione domini Vercel non configurata"
      : "Configurazione dominio non riuscita; nessuna modifica è stata applicata"
    return NextResponse.json({ error: publicMessage }, { status: message.includes("Non autenticato") ? 401 : 502 })
  }
}
