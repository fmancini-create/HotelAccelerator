import { NextRequest, NextResponse } from "next/server"
import { createClient, createServiceRoleClient, getAuthUser } from "@/lib/supabase/server"

async function ensureSuperAdmin() {
  const authClient = await createClient()
  const user = await getAuthUser(authClient)
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  const supabase = await createServiceRoleClient()
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single()
  if (!profile || !["superadmin", "super_admin"].includes(profile.role)) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) }
  }
  return { supabase }
}

/**
 * PATCH /api/superadmin/subscriptions/[id]/commission-periods/[periodId]
 * Aggiorna i campi modificabili di un singolo periodo.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; periodId: string }> },
) {
  try {
    const { id, periodId } = await params
    const auth = await ensureSuperAdmin()
    if ("error" in auth) return auth.error
    const supabase = auth.supabase

    const body = await req.json()
    const patch: Record<string, unknown> = {}
    if (body.valid_from !== undefined) patch.valid_from = body.valid_from
    if (body.valid_to !== undefined) patch.valid_to = body.valid_to || null
    if (body.commission_percentage !== undefined) {
      const pct = Number(body.commission_percentage)
      if (Number.isNaN(pct) || pct < 0 || pct > 100) {
        return NextResponse.json({ error: "commission_percentage deve essere tra 0 e 100" }, { status: 400 })
      }
      patch.commission_percentage = pct
    }
    if (body.notes !== undefined) patch.notes = body.notes || null
    if (body.commission_basis !== undefined) {
      if (!["total", "delta"].includes(body.commission_basis)) {
        return NextResponse.json({ error: "commission_basis deve essere 'total' o 'delta'" }, { status: 400 })
      }
      patch.commission_basis = body.commission_basis
    }

    const { data, error } = await supabase
      .from("subscription_commission_periods")
      .update(patch)
      .eq("id", periodId)
      .eq("subscription_id", id)
      .select()
      .single()

    if (error) {
      if ((error as { code?: string }).code === "23P01") {
        return NextResponse.json(
          { error: "Il periodo si sovrappone a un altro gia' esistente per questo abbonamento" },
          { status: 409 },
        )
      }
      throw error
    }
    return NextResponse.json({ success: true, period: data })
  } catch (error) {
    console.error("[commission-periods PATCH] Error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

/** DELETE: rimuove un singolo periodo. */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; periodId: string }> },
) {
  try {
    const { id, periodId } = await params
    const auth = await ensureSuperAdmin()
    if ("error" in auth) return auth.error
    const supabase = auth.supabase

    const { error } = await supabase
      .from("subscription_commission_periods")
      .delete()
      .eq("id", periodId)
      .eq("subscription_id", id)

    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[commission-periods DELETE] Error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
