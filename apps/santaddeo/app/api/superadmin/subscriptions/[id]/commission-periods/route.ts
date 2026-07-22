import { NextRequest, NextResponse } from "next/server"
import { createClient, createServiceRoleClient, getAuthUser } from "@/lib/supabase/server"

/**
 * GET /api/superadmin/subscriptions/[id]/commission-periods
 * Restituisce la storia delle commissioni applicate all'abbonamento.
 * Ordinati per valid_from DESC (i periodi piu' recenti in cima).
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const authClient = await createClient()
    const user = await getAuthUser(authClient)
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const supabase = await createServiceRoleClient()
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single()
    if (!profile || !["superadmin", "super_admin"].includes(profile.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const { data, error } = await supabase
      .from("subscription_commission_periods")
      .select("id, subscription_id, hotel_id, valid_from, valid_to, commission_percentage, commission_basis, notes, created_at, updated_at")
      .eq("subscription_id", id)
      .order("valid_from", { ascending: false })

    if (error) throw error
    return NextResponse.json({ periods: data || [] })
  } catch (error) {
    console.error("[commission-periods GET] Error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

/**
 * POST /api/superadmin/subscriptions/[id]/commission-periods
 * Crea un nuovo periodo. Body: { valid_from, valid_to|null, commission_percentage, notes? }.
 * Il vincolo gist `cp_no_overlap` blocca lato DB sovrapposizioni con periodi esistenti
 * della stessa subscription.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const authClient = await createClient()
    const user = await getAuthUser(authClient)
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const supabase = await createServiceRoleClient()
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single()
    if (!profile || !["superadmin", "super_admin"].includes(profile.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    // hotel_id viene dedotto dalla subscription (non lo accettiamo dal client per evitare mismatch)
    const { data: sub, error: subErr } = await supabase
      .from("accelerator_subscriptions")
      .select("id, hotel_id")
      .eq("id", id)
      .single()
    if (subErr || !sub) return NextResponse.json({ error: "Subscription not found" }, { status: 404 })

    const body = await req.json()
    const { valid_from, valid_to, commission_percentage, commission_basis, notes } = body
    if (!valid_from || commission_percentage == null) {
      return NextResponse.json({ error: "valid_from e commission_percentage sono obbligatori" }, { status: 400 })
    }

    const pct = Number(commission_percentage)
    if (Number.isNaN(pct) || pct < 0 || pct > 100) {
      return NextResponse.json({ error: "commission_percentage deve essere tra 0 e 100" }, { status: 400 })
    }

    const { data, error } = await supabase
      .from("subscription_commission_periods")
      .insert({
        subscription_id: id,
        hotel_id: sub.hotel_id,
        valid_from,
        valid_to: valid_to || null,
        commission_percentage: pct,
        commission_basis: commission_basis || "total",
        notes: notes || null,
      })
      .select()
      .single()

    if (error) {
      // 23P01 = exclusion violation (overlap)
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
    console.error("[commission-periods POST] Error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
