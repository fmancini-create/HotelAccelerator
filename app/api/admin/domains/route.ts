import { createClient } from "@/lib/supabase/server"
import { type NextRequest, NextResponse } from "next/server"
import { randomBytes } from "crypto"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"

// GET - Ottieni configurazione dominio per property
export async function GET(request: NextRequest) {
  try {
    const propertyId = await getAuthenticatedPropertyId()

    const supabase = await createClient()

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

    const supabase = await createClient()
    const body = await request.json()
    const { subdomain, custom_domain, active_domain_type, frontend_enabled } = body

    // Se viene impostato un custom_domain, genera token di verifica
    const updateData: Record<string, unknown> = {
      active_domain_type,
      frontend_enabled,
      updated_at: new Date().toISOString(),
    }

    if (subdomain !== undefined) {
      updateData.subdomain = subdomain || null
    }

    if (custom_domain !== undefined) {
      updateData.custom_domain = custom_domain || null

      if (custom_domain) {
        // Genera nuovo token di verifica
        const token = `hotelaccelerator-verify-${randomBytes(16).toString("hex")}`
        updateData.domain_verification_token = token
        updateData.domain_status = "pending_verification"
        updateData.domain_verified_at = null
      } else {
        // Rimuove custom domain
        updateData.domain_status = "not_set"
        updateData.domain_verification_token = null
        updateData.domain_verified_at = null
      }
    }

    const { data, error } = await supabase.from("properties").update(updateData).eq("id", propertyId).select().single()

    if (error) {
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

    return NextResponse.json({ property: data, success: true })
  } catch (error) {
    console.error("[DOMAINS] Error in PUT:", error)
    return NextResponse.json({ error: "Errore nel salvataggio" }, { status: 500 })
  }
}
