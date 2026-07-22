import { type NextRequest, NextResponse } from "next/server"
import { createClient, createServiceRoleClient } from "@/lib/supabase/server"

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: hotelId } = await params
    const supabase = await createClient()
    
    const { data, error } = await supabase
      .from("hotels")
      .select(
        "id, name, organization_id, address, city, country, total_rooms, revenue_vat_mode, accommodation_vat_rate",
      )
      .eq("id", hotelId)
      .single()
    
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    
    if (!data) {
      return NextResponse.json({ error: "Hotel not found" }, { status: 404 })
    }
    
    return NextResponse.json(data)
  } catch (error) {
    console.error("[v0] Error in GET /api/hotels/[id]:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: hotelId } = await params
    const supabase = await createClient()
    // FIX 04/05/2026: serviceSupabase deve essere DAVVERO service-role.
    // Bug precedente: era assegnato a `createClient()` (cookie-bound anon),
    // quindi le RLS su `hotels` bloccavano l'UPDATE per super_admin che
    // operavano cross-organization (es. Filippo org Barronci che invia
    // un PATCH su un hotel in altra org tipo Massabò). Le policy UPDATE
    // su hotels richiedono `organization_id == profile.organization_id`
    // e NON esiste un'override per super_admin (a differenza del SELECT).
    // Risultato: UPDATE matchava 0 righe -> PGRST116 con messaggio
    // "Cannot coerce the result to a single JSON object". Il check
    // applicativo isSuperAdmin (gia' presente) e' la fonte di verita'
    // per l'autorizzazione, quindi qui usiamo service-role.
    const serviceSupabase = await createServiceRoleClient()
    const body = await request.json()

    // Verify user has access to this hotel
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Get user's profile to check organization access and role
    const { data: profile } = await serviceSupabase
      .from("profiles")
      .select("organization_id, role")
      .eq("id", user.id)
      .single()

    if (!profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 })
    }

    // FIX 30/04/2026: il role canonico per superadmin nell'app e' "super_admin"
    // (con underscore) o "superadmin" (legacy). Controllare solo "system_admin"
    // (mai usato altrove) faceva cadere il superadmin nel branch normale e
    // ritornare 403 Forbidden quando provava a modificare total_rooms.
    const isSuperAdmin =
      profile.role === "super_admin" ||
      profile.role === "superadmin" ||
      profile.role === "system_admin"

    // Verify hotel belongs to user's organization (skip for system_admin)
    if (!isSuperAdmin) {
      const { data: hotel } = await serviceSupabase
        .from("hotels")
        .select("organization_id")
        .eq("id", hotelId)
        .single()

      if (!hotel || hotel.organization_id !== profile.organization_id) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 })
      }
    }

    const updateData: any = {
      updated_at: new Date().toISOString(),
    }

    // Preferenza di VISUALIZZAZIONE importi (IVA) del tenant: consentita anche
    // ai non-super_admin (come lo splash motivazionale). Validazione difensiva.
    const vatUpdate: any = {}
    if (body.revenue_vat_mode !== undefined) {
      if (body.revenue_vat_mode !== "included" && body.revenue_vat_mode !== "excluded") {
        return NextResponse.json({ error: "revenue_vat_mode non valido (included|excluded)." }, { status: 400 })
      }
      vatUpdate.revenue_vat_mode = body.revenue_vat_mode
    }
    if (body.accommodation_vat_rate !== undefined) {
      const rate = Number(body.accommodation_vat_rate)
      if (!Number.isFinite(rate) || rate < 0 || rate >= 100) {
        return NextResponse.json({ error: "accommodation_vat_rate non valido (0-99)." }, { status: 400 })
      }
      vatUpdate.accommodation_vat_rate = rate
    }

    // Non-super_admin can only update user-level settings (splash + IVA display)
    if (!isSuperAdmin) {
      const allowedTenant: any = {}
      if (body.show_motivational_splash !== undefined) {
        allowedTenant.show_motivational_splash = body.show_motivational_splash
      }
      Object.assign(allowedTenant, vatUpdate)
      if (Object.keys(allowedTenant).length === 0) {
        return NextResponse.json({ error: "Solo gli amministratori della piattaforma possono modificare i dati della struttura." }, { status: 403 })
      }
      Object.assign(updateData, allowedTenant)
    } else {
      Object.assign(updateData, vatUpdate)
    }

    // Add fields that exist in the hotels table (super_admin only gets here for structural data)
    if (body.name !== undefined) updateData.name = body.name
    if (body.address !== undefined) updateData.address = body.address
    if (body.city !== undefined) updateData.city = body.city
    if (body.province !== undefined) updateData.province = body.province
    if (body.cap !== undefined) updateData.cap = body.cap
    if (body.country !== undefined) updateData.country = body.country
    if (body.total_rooms !== undefined) updateData.total_rooms = body.total_rooms
    if (body.star_rating !== undefined) updateData.star_rating = body.star_rating
    if (body.show_motivational_splash !== undefined) updateData.show_motivational_splash = body.show_motivational_splash

    // Update hotel using service role to bypass RLS
    const { data, error } = await serviceSupabase
      .from("hotels")
      .update(updateData)
      .eq("id", hotelId)
      .select()
      .single()

    if (error) {
      console.error("Error updating hotel:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data })
  } catch (error) {
    console.error("Error in PATCH /api/hotels/[id]:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
