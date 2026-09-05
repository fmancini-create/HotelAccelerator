import { NextResponse, type NextRequest } from "next/server"
import { accessErrorStatus } from "@/lib/auth/admin-access"
import { createServiceClient } from "@/lib/supabase/server"
import { requireCalendarIdentity } from "@/lib/calendar/access"

function canAdmin(identity: Awaited<ReturnType<typeof requireCalendarIdentity>>) {
  return identity.isSuperAdmin || identity.isTenantAdmin
}

export async function GET(request: NextRequest) {
  try {
    const identity = await requireCalendarIdentity(request)
    if (!canAdmin(identity)) return NextResponse.json({ error: "Accesso negato" }, { status: 403 })
    const service = createServiceClient()
    const [{ data: users, error: usersError }, { data: sources, error: sourcesError }, { data: grants, error: grantsError }] = await Promise.all([
      service
        .from("admin_users")
        .select("id, name, email, role, is_tenant_admin")
        .eq("property_id", identity.propertyId)
        .order("name"),
      service
        .from("calendar_sources")
        .select("id, label, source_kind, color")
        .eq("property_id", identity.propertyId)
        .in("source_kind", ["shared", "platform_demo"])
        .eq("is_active", true)
        .order("label"),
      service
        .from("calendar_source_grants")
        .select("id, source_id, admin_user_id, permission")
        .eq("property_id", identity.propertyId),
    ])
    if (usersError) throw usersError
    if (sourcesError) throw sourcesError
    if (grantsError) throw grantsError
    return NextResponse.json({ users: users || [], sources: sources || [], grants: grants || [] })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Errore permessi calendario" },
      { status: accessErrorStatus(error) },
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const identity = await requireCalendarIdentity(request)
    if (!canAdmin(identity)) return NextResponse.json({ error: "Accesso negato" }, { status: 403 })
    const body = await request.json()
    const permission = String(body?.permission || "")
    if (!body?.sourceId || !body?.adminUserId || !["view", "edit", "manage"].includes(permission)) {
      return NextResponse.json({ error: "Calendario, utente e permesso sono obbligatori" }, { status: 400 })
    }

    const service = createServiceClient()
    const [{ data: source }, { data: user }] = await Promise.all([
      service
        .from("calendar_sources")
        .select("id, source_kind")
        .eq("id", String(body.sourceId))
        .eq("property_id", identity.propertyId)
        .in("source_kind", ["shared", "platform_demo"])
        .maybeSingle(),
      service
        .from("admin_users")
        .select("id")
        .eq("id", String(body.adminUserId))
        .eq("property_id", identity.propertyId)
        .maybeSingle(),
    ])
    if (!source || !user) return NextResponse.json({ error: "Calendario o utente non valido" }, { status: 404 })

    const { data, error } = await service
      .from("calendar_source_grants")
      .upsert(
        {
          property_id: identity.propertyId,
          source_id: source.id,
          admin_user_id: user.id,
          permission,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "source_id,admin_user_id" },
      )
      .select("id, source_id, admin_user_id, permission")
      .single()
    if (error) throw error
    return NextResponse.json({ grant: data })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Impossibile salvare il permesso" },
      { status: accessErrorStatus(error) },
    )
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const identity = await requireCalendarIdentity(request)
    if (!canAdmin(identity)) return NextResponse.json({ error: "Accesso negato" }, { status: 403 })
    const sourceId = request.nextUrl.searchParams.get("sourceId")
    const adminUserId = request.nextUrl.searchParams.get("adminUserId")
    if (!sourceId || !adminUserId) return NextResponse.json({ error: "Parametri mancanti" }, { status: 400 })

    const service = createServiceClient()
    const { error } = await service
      .from("calendar_source_grants")
      .delete()
      .eq("property_id", identity.propertyId)
      .eq("source_id", sourceId)
      .eq("admin_user_id", adminUserId)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Impossibile rimuovere il permesso" },
      { status: accessErrorStatus(error) },
    )
  }
}
