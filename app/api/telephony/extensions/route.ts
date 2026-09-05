import { type NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { requireAreaApi } from "@/lib/auth/area-access"
import { isAreaDenied, areaDeniedResponse } from "@/lib/auth/area-denied"
import { resolveIdentity, normalizeExtension } from "@/lib/telephony/user-extension"

/**
 * Assegnazione dell'interno telefonico alle persone del tenant attivo.
 *
 * Fonte autorevole: tenant_user_memberships. `admin_users.property_id` resta
 * solo il tenant primario legacy e non puo' rappresentare persone che lavorano
 * in piu' tenant (es. Villa I Barronci + 4BID).
 */

export async function GET(request: NextRequest) {
  try {
    await requireAreaApi("users", request)
    const identity = await resolveIdentity(request)
    const supabase = createServiceClient()

    const [{ data: memberships, error: membershipsError }, { data: rows, error: rowsError }] = await Promise.all([
      supabase
        .from("tenant_user_memberships")
        .select("user_id, role")
        .eq("property_id", identity.propertyId),
      supabase
        .from("telephony_user_extensions")
        .select("user_id, extension, can_call")
        .eq("property_id", identity.propertyId),
    ])
    if (membershipsError) throw membershipsError
    if (rowsError) throw rowsError

    const userIds = (memberships ?? []).map((membership) => String(membership.user_id))
    const { data: users, error: usersError } = userIds.length
      ? await supabase
          .from("admin_users")
          .select("id, name, email")
          .in("id", userIds)
          .order("name")
      : { data: [], error: null }
    if (usersError) throw usersError

    const membershipByUser = new Map(
      (memberships ?? []).map((membership) => [String(membership.user_id), String(membership.role || "editor")]),
    )
    const byUser = new Map<string, { extension: string; can_call: boolean }>()
    for (const r of rows ?? []) {
      byUser.set(String(r.user_id), {
        extension: String(r.extension),
        can_call: r.can_call !== false,
      })
    }

    return NextResponse.json({
      users: ((users ?? []) as Array<Record<string, unknown>>).map((u) => {
        const assigned = byUser.get(String(u.id))
        return {
          id: u.id,
          name: u.name,
          email: u.email,
          role: membershipByUser.get(String(u.id)) ?? "editor",
          extension: assigned?.extension ?? "",
          can_call: assigned?.can_call ?? true,
          is_me: u.id === identity.userId,
        }
      }),
    })
  } catch (error) {
    if (isAreaDenied(error)) return areaDeniedResponse(error)
    const message = error instanceof Error ? error.message : "Errore"
    return NextResponse.json({ error: message }, { status: message.includes("autenticat") ? 401 : 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    await requireAreaApi("users", request)
    const identity = await resolveIdentity(request)

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
    const userId = typeof body?.user_id === "string" ? body.user_id.trim() : ""
    const rawExtension = typeof body?.extension === "string" ? body.extension : ""
    const canCall = body?.can_call !== false

    if (!userId) {
      return NextResponse.json({ error: "Utente non indicato." }, { status: 400 })
    }

    const supabase = createServiceClient()

    // Isolamento tenant basato sulla membership, non sul tenant primario legacy.
    const { data: membership } = await supabase
      .from("tenant_user_memberships")
      .select("user_id")
      .eq("property_id", identity.propertyId)
      .eq("user_id", userId)
      .maybeSingle()

    if (!membership) {
      return NextResponse.json({ error: "Utente non trovato in questa struttura." }, { status: 404 })
    }

    if (rawExtension.trim() === "") {
      const { error } = await supabase
        .from("telephony_user_extensions")
        .delete()
        .eq("property_id", identity.propertyId)
        .eq("user_id", userId)

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true, removed: true })
    }

    const extension = normalizeExtension(rawExtension)
    if (!extension) {
      return NextResponse.json(
        { error: "L'interno deve essere composto solo da cifre (massimo 10)." },
        { status: 400 },
      )
    }

    const { error } = await supabase.from("telephony_user_extensions").upsert(
      {
        property_id: identity.propertyId,
        user_id: userId,
        extension,
        can_call: canCall,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "property_id,user_id" },
    )

    if (error) {
      if (error.code === "23505") {
        const { data: owner } = await supabase
          .from("telephony_user_extensions")
          .select("user_id")
          .eq("property_id", identity.propertyId)
          .eq("extension", extension)
          .maybeSingle()

        let ownerName = ""
        if (owner?.user_id) {
          const { data: person } = await supabase
            .from("admin_users")
            .select("name")
            .eq("id", owner.user_id)
            .maybeSingle()
          ownerName = (person?.name as string) ?? ""
        }

        return NextResponse.json(
          {
            error: ownerName
              ? `L'interno ${extension} è già assegnato a ${ownerName}. Ogni interno può appartenere a una sola persona.`
              : `L'interno ${extension} è già assegnato a un altro utente.`,
          },
          { status: 409 },
        )
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, extension })
  } catch (error) {
    if (isAreaDenied(error)) return areaDeniedResponse(error)
    const message = error instanceof Error ? error.message : "Errore"
    return NextResponse.json({ error: message }, { status: message.includes("autenticat") ? 401 : 500 })
  }
}
