import { createServiceClient } from "@/lib/supabase/server"
import { type NextRequest, NextResponse } from "next/server"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"
import { addProjectDomain, removeProjectDomain } from "@/lib/vercel/project-domains"

const DOMAIN_RE = /^(?=.{1,253}$)(?!-)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/
const SUBDOMAIN_RE = /^(?!-)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/

// GET - Ottieni configurazione dominio per property
export async function GET(request: NextRequest) {
  try {
    const propertyId = await getAuthenticatedPropertyId()

    const supabase = createServiceClient()

    const { data, error } = await supabase
      .from("properties")
      .select(`
      id,
      name,
      subdomain,
      custom_domain,
      domain_status,
      domain_verification_token,
      domain_verified_at,
      active_domain_type,
      frontend_enabled
    `)
      .eq("id", propertyId)
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ property: data })
  } catch (error) {
    console.error("[DOMAINS] Error in GET:", error)
    return NextResponse.json({ error: "Errore nel caricamento della configurazione" }, { status: 500 })
  }
}

// PUT - Aggiorna configurazione dominio
export async function PUT(request: NextRequest) {
  try {
    const propertyId = await getAuthenticatedPropertyId()

    const supabase = createServiceClient()
    const body = await request.json()
    const { subdomain, custom_domain, active_domain_type, frontend_enabled } = body
    const normalizedSubdomain = typeof subdomain === "string" ? subdomain.trim().toLowerCase() : undefined
    const normalizedDomain = typeof custom_domain === "string" ? custom_domain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "") : undefined
    if (normalizedSubdomain && !SUBDOMAIN_RE.test(normalizedSubdomain)) return NextResponse.json({ error: "Sottodominio non valido" }, { status: 400 })
    if (normalizedDomain && !DOMAIN_RE.test(normalizedDomain)) return NextResponse.json({ error: "Dominio non valido" }, { status: 400 })
    if (active_domain_type !== "subdomain" && active_domain_type !== "custom_domain") return NextResponse.json({ error: "Tipo dominio non valido" }, { status: 400 })

    const { data: current } = await supabase.from("properties").select("custom_domain, subdomain").eq("id", propertyId).single()
    let vercelSubdomain: Awaited<ReturnType<typeof addProjectDomain>> | null = null
    let vercelDomain: Awaited<ReturnType<typeof addProjectDomain>> | null = null
    if (normalizedSubdomain && normalizedSubdomain !== current?.subdomain) {
      try { vercelSubdomain = await addProjectDomain(`${normalizedSubdomain}.hotelaccelerator.com`) }
      catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Registrazione sottodominio non riuscita" }, { status: 502 }) }
    }
    if (normalizedDomain && normalizedDomain !== current?.custom_domain) {
      try { vercelDomain = await addProjectDomain(normalizedDomain) }
      catch (error) {
        if (vercelSubdomain?.name) await removeProjectDomain(vercelSubdomain.name).catch(() => undefined)
        return NextResponse.json({ error: error instanceof Error ? error.message : "Registrazione dominio non riuscita" }, { status: 502 })
      }
    }

    // Se viene impostato un custom_domain, genera token di verifica
    const updateData: Record<string, unknown> = {
      active_domain_type,
      frontend_enabled,
      updated_at: new Date().toISOString(),
    }

    if (subdomain !== undefined) {
      updateData.subdomain = normalizedSubdomain || null
    }

    if (custom_domain !== undefined) {
      updateData.custom_domain = normalizedDomain || null

      if (normalizedDomain && normalizedDomain !== current?.custom_domain) {
        const txtChallenge = vercelDomain?.verification?.find((item) => item.type.toUpperCase() === "TXT")
        updateData.domain_verification_token = txtChallenge?.value ?? null
        updateData.domain_status = vercelDomain?.verified ? "active" : "pending_verification"
        updateData.domain_verified_at = vercelDomain?.verified ? new Date().toISOString() : null
      } else if (!normalizedDomain) {
        // Rimuove custom domain
        updateData.domain_status = "not_set"
        updateData.domain_verification_token = null
        updateData.domain_verified_at = null
      }
    }

    const { data, error } = await supabase.from("properties").update(updateData).eq("id", propertyId).select().single()

    if (error) {
      if (vercelDomain?.name) {
        try { await removeProjectDomain(vercelDomain.name) }
        catch (cleanupError) { console.error("[DOMAINS] failed Vercel domain rollback", cleanupError) }
      }
      if (vercelSubdomain?.name) {
        try { await removeProjectDomain(vercelSubdomain.name) }
        catch (cleanupError) { console.error("[DOMAINS] failed Vercel subdomain rollback", cleanupError) }
      }
      // Gestisci errore di subdomain duplicato
      if (error.code === "23505") {
        if (error.message.includes("subdomain")) {
          return NextResponse.json({ error: "Questo subdomain è già in uso" }, { status: 409 })
        }
        if (error.message.includes("custom_domain")) {
          return NextResponse.json({ error: "Questo dominio è già in uso" }, { status: 409 })
        }
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    if (current?.custom_domain && normalizedDomain !== current.custom_domain) {
      try { await removeProjectDomain(current.custom_domain) }
      catch (cleanupError) { console.error("[DOMAINS] old Vercel domain cleanup failed", cleanupError) }
    }
    if (current?.subdomain && normalizedSubdomain !== current.subdomain) {
      try { await removeProjectDomain(`${current.subdomain}.hotelaccelerator.com`) }
      catch (cleanupError) { console.error("[DOMAINS] old Vercel subdomain cleanup failed", cleanupError) }
    }

    return NextResponse.json({ property: data, success: true })
  } catch (error) {
    console.error("[DOMAINS] Error in PUT:", error)
    return NextResponse.json({ error: "Errore nel salvataggio" }, { status: 500 })
  }
}
