import { type NextRequest, NextResponse } from "next/server"
import { createClient, createServiceRoleClient } from "@/lib/supabase/server"
import { isDevAuthAsync } from "@/lib/env/dev-auth"

/**
 * Gestione associazioni multi-struttura di un utente.
 *
 * Scrive sulla tabella `user_property_map`, che e' la FONTE DI VERITA' che la
 * dashboard struttura (`/dashboard`) usa per stabilire a quali hotel un utente
 * ha accesso. Le altre tabelle (`hotel_users`, `sales_agent_hotels`,
 * `revman_sales_access`) servono ad altri scopi e NON vengono toccate qui.
 *
 * - GET ?user_id=...  -> { hotelIds: string[] }  strutture attualmente associate
 * - PUT { user_id, hotelIds } -> sincronizza l'elenco (insert mancanti + delete rimossi)
 */

async function requireSuperAdmin() {
  const isV0Preview = await isDevAuthAsync()
  const svc = await createServiceRoleClient()
  if (isV0Preview) return { svc, adminUserId: null as string | null }

  const authClient = await createClient()
  const {
    data: { user },
  } = await authClient.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }

  const { data: profile } = await svc.from("profiles").select("role").eq("id", user.id).single()
  if (!profile || !["superadmin", "super_admin"].includes(profile.role)) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) }
  }
  return { svc, adminUserId: user.id }
}

export async function GET(request: NextRequest) {
  try {
    const guard = await requireSuperAdmin()
    if ("error" in guard) return guard.error
    const { svc } = guard

    const userId = request.nextUrl.searchParams.get("user_id")
    if (!userId) {
      return NextResponse.json({ error: "user_id richiesto" }, { status: 400 })
    }

    const { data, error } = await svc
      .from("user_property_map")
      .select("hotel_id")
      .eq("user_id", userId)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ hotelIds: (data || []).map((r) => r.hotel_id) })
  } catch (e: any) {
    console.error("[superadmin/users/properties GET]", e)
    return NextResponse.json({ error: e?.message || "Errore" }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const guard = await requireSuperAdmin()
    if ("error" in guard) return guard.error
    const { svc, adminUserId } = guard

    const body = await request.json().catch(() => ({}))
    const userId: string | undefined = body.user_id
    const hotelIds: string[] = Array.isArray(body.hotelIds) ? body.hotelIds : []

    if (!userId) {
      return NextResponse.json({ error: "user_id richiesto" }, { status: 400 })
    }

    // Validazione: gli hotel devono esistere e non essere eliminati
    const desired = new Set(hotelIds.filter(Boolean))
    if (desired.size > 0) {
      const { data: validHotels } = await svc
        .from("hotels")
        .select("id")
        .in("id", Array.from(desired))
        .is("deleted_at", null)
      const validIds = new Set((validHotels || []).map((h) => h.id))
      for (const id of Array.from(desired)) {
        if (!validIds.has(id)) desired.delete(id)
      }
    }

    // Stato attuale
    const { data: current, error: curErr } = await svc
      .from("user_property_map")
      .select("hotel_id")
      .eq("user_id", userId)
    if (curErr) {
      return NextResponse.json({ error: curErr.message }, { status: 500 })
    }
    const currentSet = new Set((current || []).map((r) => r.hotel_id))

    const toAdd = Array.from(desired).filter((id) => !currentSet.has(id))
    const toRemove = Array.from(currentSet).filter((id) => !desired.has(id))

    // Insert delle nuove associazioni (con permessi di default = accesso pieno)
    if (toAdd.length > 0) {
      const rows = toAdd.map((hotel_id) => ({
        user_id: userId,
        hotel_id,
        can_manage: true,
        can_view_financials: true,
        can_sync_data: true,
        can_manage_team: false,
        assigned_by: adminUserId,
      }))
      const { error: insErr } = await svc.from("user_property_map").insert(rows)
      if (insErr) {
        return NextResponse.json({ error: insErr.message }, { status: 500 })
      }
    }

    // Delete delle associazioni rimosse
    if (toRemove.length > 0) {
      const { error: delErr } = await svc
        .from("user_property_map")
        .delete()
        .eq("user_id", userId)
        .in("hotel_id", toRemove)
      if (delErr) {
        return NextResponse.json({ error: delErr.message }, { status: 500 })
      }
    }

    return NextResponse.json({
      ok: true,
      added: toAdd.length,
      removed: toRemove.length,
      total: desired.size,
    })
  } catch (e: any) {
    console.error("[superadmin/users/properties PUT]", e)
    return NextResponse.json({ error: e?.message || "Errore" }, { status: 500 })
  }
}
