import { createClient } from "@/lib/supabase/server"
import { type NextRequest, NextResponse } from "next/server"
import { triggerPriceRecalculation } from "@/lib/pricing/auto-trigger"

/**
 * 13/05/2026: clamp del range al futuro. Se interamente nel passato saltiamo.
 */
function clampRecalcRange(dateFrom: string, dateTo: string): { from: string; to: string } | null {
  const today = new Date().toISOString().split("T")[0]
  if (dateTo < today) return null
  return { from: dateFrom < today ? today : dateFrom, to: dateTo }
}

/**
 * Calcola l'UNION dei range vecchio e nuovo: in caso di PATCH che sposta o
 * accorcia il periodo, dobbiamo ricalcolare sia le date che erano coperte
 * prima (per tornare al peso base) sia quelle ora coperte dal nuovo range.
 */
function unionRanges(
  oldFrom: string,
  oldTo: string,
  newFrom: string,
  newTo: string,
): { from: string; to: string } {
  return {
    from: oldFrom < newFrom ? oldFrom : newFrom,
    to: oldTo > newTo ? oldTo : newTo,
  }
}

/**
 * /api/settings/pricing-variables/[id]/weight-overrides/[overrideId]
 *
 * PATCH: aggiorna un override esistente (parziale)
 * DELETE: rimuove definitivamente l'override (hard delete coerente con la
 *   semantica della UI "elimina dall'elenco"; per disattivare temporaneamente
 *   usare PATCH con is_active=false)
 */

const ROLE_ALLOWLIST = ["superadmin", "super_admin", "admin", "manager"] as const

async function ensureAuthorized(supabase: Awaited<ReturnType<typeof createClient>>) {
  const isDev = !process.env.VERCEL_ENV || process.env.VERCEL_ENV === "development"
  if (isDev) return { ok: true as const }
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()
  if (authError || !user) {
    return { ok: false as const, status: 401, message: "Non autenticato" }
  }
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single()
  if (!profile || !ROLE_ALLOWLIST.includes(profile.role)) {
    return { ok: false as const, status: 403, message: "Accesso negato" }
  }
  return { ok: true as const }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; overrideId: string }> },
) {
  try {
    const { overrideId } = await params
    const supabase = await createClient()
    const auth = await ensureAuthorized(supabase)
    if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status })

    const body = await request.json()
    const allowed: Record<string, unknown> = {}
    if (typeof body.label === "string") allowed.label = body.label.trim()
    if (typeof body.date_from === "string") allowed.date_from = body.date_from
    if (typeof body.date_to === "string") allowed.date_to = body.date_to
    if (body.days_of_week === null) allowed.days_of_week = null
    else if (Array.isArray(body.days_of_week)) allowed.days_of_week = body.days_of_week
    if (typeof body.weight === "number") allowed.weight = body.weight
    if (typeof body.priority === "number") allowed.priority = body.priority
    if (typeof body.is_active === "boolean") allowed.is_active = body.is_active

    if (Object.keys(allowed).length === 0) {
      return NextResponse.json({ error: "Nessun campo da aggiornare" }, { status: 400 })
    }

    // Validazione cross-campo: se aggiorno entrambe le date, controlla coerenza
    if (allowed.date_from && allowed.date_to) {
      if ((allowed.date_to as string) < (allowed.date_from as string)) {
        return NextResponse.json(
          { error: "La data di fine deve essere uguale o successiva a quella di inizio" },
          { status: 400 },
        )
      }
    }
    if (allowed.weight !== undefined) {
      const w = allowed.weight as number
      if (w < 0 || w > 10) {
        return NextResponse.json({ error: "L'importanza deve essere tra 0 e 10" }, { status: 400 })
      }
    }

    // 13/05/2026: leggiamo PRIMA della update per conoscere il vecchio range
    // (serve per ricalcolare anche le date che escono dall'override).
    const { data: prevRow } = await supabase
      .from("pricing_variable_weight_overrides")
      .select("hotel_id, date_from, date_to, is_active")
      .eq("id", overrideId)
      .maybeSingle()

    const { data, error } = await supabase
      .from("pricing_variable_weight_overrides")
      .update(allowed)
      .eq("id", overrideId)
      .select()
      .single()

    if (error) {
      console.error("[v0] weight-override PATCH error:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Trigger recalc se qualcosa di rilevante e' cambiato (date, peso,
    // is_active, days_of_week, priority). Se solo la label e' cambiata
    // il prezzo non cambia, quindi saltiamo.
    let recalcInfo: { queued: boolean; reason?: string; queue_id?: string; range_days?: number } = { queued: false }
    const pricingChanged =
      "date_from" in allowed ||
      "date_to" in allowed ||
      "weight" in allowed ||
      "priority" in allowed ||
      "is_active" in allowed ||
      "days_of_week" in allowed
    if (pricingChanged && prevRow && data) {
      const union = unionRanges(
        prevRow.date_from,
        prevRow.date_to,
        data.date_from,
        data.date_to,
      )
      const clamp = clampRecalcRange(union.from, union.to)
      if (clamp) {
        try {
          const res = await triggerPriceRecalculation(
            prevRow.hotel_id,
            "k_weight_override_change",
            clamp.from,
            clamp.to,
          )
          const days = Math.ceil(
            (new Date(clamp.to).getTime() - new Date(clamp.from).getTime()) / 86400000,
          ) + 1
          recalcInfo = { ...res, range_days: days }
        } catch (e) {
          console.error("[v0] weight-override PATCH: trigger recalc failed (non-fatal):", e)
        }
      }
    }

    return NextResponse.json({ override: data, recalc: recalcInfo })
  } catch (err) {
    console.error("[v0] weight-override PATCH unhandled:", err)
    return NextResponse.json({ error: "Errore interno" }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; overrideId: string }> },
) {
  try {
    const { overrideId } = await params
    const supabase = await createClient()
    const auth = await ensureAuthorized(supabase)
    if (!auth.ok) return NextResponse.json({ error: auth.message }, { status: auth.status })

    // 13/05/2026: leggi PRIMA della delete per ottenere range + hotel_id e
    // poter triggerare il ricalcolo (le date interessate devono tornare al
    // peso base).
    const { data: rowToDelete } = await supabase
      .from("pricing_variable_weight_overrides")
      .select("hotel_id, date_from, date_to, is_active")
      .eq("id", overrideId)
      .maybeSingle()

    const { error } = await supabase
      .from("pricing_variable_weight_overrides")
      .delete()
      .eq("id", overrideId)

    if (error) {
      console.error("[v0] weight-override DELETE error:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    let recalcInfo: { queued: boolean; reason?: string; queue_id?: string; range_days?: number } = { queued: false }
    if (rowToDelete && rowToDelete.is_active !== false) {
      const clamp = clampRecalcRange(rowToDelete.date_from, rowToDelete.date_to)
      if (clamp) {
        try {
          const res = await triggerPriceRecalculation(
            rowToDelete.hotel_id,
            "k_weight_override_change",
            clamp.from,
            clamp.to,
          )
          const days = Math.ceil(
            (new Date(clamp.to).getTime() - new Date(clamp.from).getTime()) / 86400000,
          ) + 1
          recalcInfo = { ...res, range_days: days }
        } catch (e) {
          console.error("[v0] weight-override DELETE: trigger recalc failed (non-fatal):", e)
        }
      }
    }

    return NextResponse.json({ ok: true, recalc: recalcInfo })
  } catch (err) {
    console.error("[v0] weight-override DELETE unhandled:", err)
    return NextResponse.json({ error: "Errore interno" }, { status: 500 })
  }
}
