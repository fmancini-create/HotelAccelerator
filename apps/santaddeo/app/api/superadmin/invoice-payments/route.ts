import { type NextRequest, NextResponse } from "next/server"
import { createClient, createServiceRoleClient } from "@/lib/supabase/server"

async function assertSuperAdmin() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    }
  }
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle()
  if (profile?.role !== "super_admin") {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    }
  }
  return { ok: true as const, userId: user.id }
}

/**
 * GET /api/superadmin/invoice-payments
 *
 * Lista cronologica di tutti i pagamenti registrati. Filtri opzionali:
 *   - hotelId
 *   - from / to (range payment_date in formato YYYY-MM-DD)
 *   - search (cerca su invoice_number o hotel name, ILIKE)
 *   - includeBackfill=0  (default: include i pagamenti di backfill)
 *
 * Output sorted by payment_date DESC, created_at DESC.
 */
export async function GET(req: NextRequest) {
  const auth = await assertSuperAdmin()
  if (!auth.ok) return auth.response

  const { searchParams } = new URL(req.url)
  const hotelId = searchParams.get("hotelId")
  const from = searchParams.get("from")
  const to = searchParams.get("to")
  const search = (searchParams.get("search") || "").trim()
  const includeBackfill = searchParams.get("includeBackfill") !== "0"

  const sb = await createServiceRoleClient()

  let query = sb
    .from("invoice_payments")
    .select(
      `id, amount, payment_date, notes, is_backfill, created_at,
       invoice:invoices!inner (
         id, invoice_number, total, status, hotel_id,
         hotel:hotels ( id, name )
       )`,
    )
    .order("payment_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1000)

  if (hotelId) {
    query = query.eq("invoice.hotel_id", hotelId)
  }
  if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) {
    query = query.gte("payment_date", from)
  }
  if (to && /^\d{4}-\d{2}-\d{2}$/.test(to)) {
    query = query.lte("payment_date", to)
  }
  if (!includeBackfill) {
    query = query.eq("is_backfill", false)
  }

  const { data, error } = await query
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  let payments = (data || []) as any[]
  if (search) {
    const lc = search.toLowerCase()
    payments = payments.filter((p) => {
      const num = (p.invoice?.invoice_number || "").toLowerCase()
      const hot = (p.invoice?.hotel?.name || "").toLowerCase()
      return num.includes(lc) || hot.includes(lc)
    })
  }

  const totalAmount = payments.reduce((s, p) => s + Number(p.amount || 0), 0)

  return NextResponse.json({
    payments,
    count: payments.length,
    totalAmount,
  })
}
