import { type NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { requireAreaApi } from "@/lib/auth/area-access"
import { isAreaDenied, areaDeniedResponse } from "@/lib/auth/area-denied"
import { resolveIdentity, normalizeExtension } from "@/lib/telephony/user-extension"

/**
 * Assegnazione dell'interno telefonico alle persone.
 *
 * "users" e' una chiave d'area VALIDA (verificata in lib/platform/areas.ts).
 * L'area "channels" non esiste: usarla negherebbe l'accesso a tutti.
 */

export async function GET(request: NextRequest) {
  try {
    await requireAreaApi("users", request)
    const identity = await resolveIdentity(request)
    const supabase = createServiceClient()

    // Due letture separate invece di un embed: fra `admin_users` e
    // `telephony_user_extensions` non esiste una FK diretta, e un embed
    // PostgREST fallirebbe (PGRST200) restituendo zero righe in silenzio.
    const [{ data: users }, { data: rows }] = await Promise.all([
      supabase
        .from("admin_users")
        .select("id, name, email, role")
        .eq("property_id", identity.propertyId)
        .order("name"),
      supabase
        .from("telephony_user_extensions")
        .select("user_id, extension, can_call")
        .eq("property_id", identity.propertyId),
    ])

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
          role: u.role,
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

    // ISOLAMENTO: l'utente da modificare deve appartenere ALLA struttura
    // autenticata. Senza questo controllo un id altrui, passato a mano,
    // assegnerebbe un interno a una persona di un'altra struttura.
    const { data: target } = await supabase
      .from("admin_users")
      .select("id, name")
      .eq("id", userId)
      .eq("property_id", identity.propertyId)
      .maybeSingle()

    if (!target) {
      return NextResponse.json({ error: "Utente non trovato in questa struttura." }, { status: 404 })
    }

    // Campo svuotato = rimozione dell'assegnazione. Senza questo ramo un interno
    // assegnato per errore non sarebbe piu' togliebile dall'interfaccia.
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
      // 23505 = violazione di unicita'. Qui significa quasi sempre "interno
      // gia' assegnato a un collega": un messaggio generico costringerebbe a
      // indovinare, quindi dico CHI lo ha.
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
