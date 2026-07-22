/**
 * GET /api/superadmin/sales-commissions/ledger
 *   ?agentId=&hotelId=&status=&year=&month=
 *   Lista paginata del ledger. Filtri opzionali. Limite 500.
 *
 *   Aggrega anche i totali per stato (count + amount) per i KPI in UI.
 *   Usa count: "exact", head: true per non sbattere contro il PostgREST
 *   1000-row cap (vedi memorie 10/05).
 */

import { NextResponse } from "next/server"
import { createClient, createServiceRoleClient } from "@/lib/supabase/server"

async function assertSuperAdmin() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false as const, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle()
  if (profile?.role !== "super_admin") {
    return { ok: false as const, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) }
  }
  return { ok: true as const }
}

export async function GET(request: Request) {
  const auth = await assertSuperAdmin()
  if (!auth.ok) return auth.response

  const url = new URL(request.url)
  const agentId = url.searchParams.get("agentId")
  const hotelId = url.searchParams.get("hotelId")
  const status = url.searchParams.get("status")
  const year = url.searchParams.get("year")
  const month = url.searchParams.get("month")
  const invoiceId = url.searchParams.get("invoiceId")

  const sb = await createServiceRoleClient()
  let q = sb
    .from("sales_commissions_ledger")
    .select(
      `id, sales_agent_id, hotel_id, invoice_id, period_year, period_month,
       base_amount_eur, commission_percentage, commission_basis, amount_eur,
       status, accrued_at, earned_at, paid_at, voided_at, voided_reason,
       payment_method, payment_reference, notes, created_at, updated_at,
       sales_agents(display_name, email),
       hotels(name),
       invoices(invoice_number, status, total, paid_at, due_date, issue_date)`,
    )
    .order("period_year", { ascending: false })
    .order("period_month", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(500)

  if (agentId) q = q.eq("sales_agent_id", agentId)
  if (hotelId) q = q.eq("hotel_id", hotelId)
  if (status) q = q.eq("status", status)
  if (year) q = q.eq("period_year", Number(year))
  if (month) q = q.eq("period_month", Number(month))
  if (invoiceId) q = q.eq("invoice_id", invoiceId)

  const { data, error } = await q
  if (error) {
    console.error("[v0] ledger GET failed:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Calcola totali per stato sul filtro corrente (senza limit)
  const totals: Record<string, { count: number; amount: number }> = {
    accrued: { count: 0, amount: 0 },
    earned: { count: 0, amount: 0 },
    paid: { count: 0, amount: 0 },
    voided: { count: 0, amount: 0 },
  }
  // Per i totali completi su filtro (non sui 500 ritornati) facciamo un sweep
  // separato senza select pesante.
  for (const s of ["accrued", "earned", "paid", "voided"] as const) {
    let tq = sb
      .from("sales_commissions_ledger")
      .select("amount_eur", { count: "exact" })
      .eq("status", s)
    if (agentId) tq = tq.eq("sales_agent_id", agentId)
    if (hotelId) tq = tq.eq("hotel_id", hotelId)
    if (year) tq = tq.eq("period_year", Number(year))
    if (month) tq = tq.eq("period_month", Number(month))
    if (invoiceId) tq = tq.eq("invoice_id", invoiceId)
    const { data: rows, count } = await tq.limit(5000)
    totals[s].count = count ?? 0
    totals[s].amount = (rows ?? []).reduce((sum, r: any) => sum + Number(r.amount_eur || 0), 0)
  }

  return NextResponse.json({ ledger: data ?? [], totals })
}
