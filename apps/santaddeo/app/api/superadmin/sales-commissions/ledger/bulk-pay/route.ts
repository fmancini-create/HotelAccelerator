/**
 * POST /api/superadmin/sales-commissions/ledger/bulk-pay
 *   Liquidazione massiva: paga in batch tutte le righe ledger con id elencati.
 *   Body: { ids: string[], paymentMethod?, paymentReference?, allowFromAccrued? }
 *   Ritorna { results: [{ id, ok, error? }], paidCount, skippedCount }
 */

import { NextResponse } from "next/server"
import { createClient, createServiceRoleClient } from "@/lib/supabase/server"
import { markCommissionPaid } from "@/lib/sales/commissions-engine"
import { notifyUser } from "@/lib/notifications/notify"

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

export const maxDuration = 120

export async function POST(request: Request) {
  const auth = await assertSuperAdmin()
  if (!auth.ok) return auth.response

  const body = await request.json().catch(() => ({}))
  const ids: string[] = Array.isArray(body.ids) ? body.ids.filter((x: any) => typeof x === "string") : []
  if (ids.length === 0) return NextResponse.json({ error: "ids vuoto" }, { status: 400 })
  if (ids.length > 200) return NextResponse.json({ error: "Massimo 200 per batch" }, { status: 400 })

  const sb = await createServiceRoleClient()

  // Pre-fetch tutte le righe per il batch notify
  const { data: rows } = await sb
    .from("sales_commissions_ledger")
    .select("id, sales_agent_id, amount_eur, period_year, period_month, hotels(name), sales_agents(user_id)")
    .in("id", ids)

  const rowMap = new Map((rows ?? []).map((r) => [r.id as string, r]))

  type Result = { id: string; ok: boolean; error?: string }
  const results: Result[] = []
  let paidCount = 0
  for (const id of ids) {
    const r = await markCommissionPaid(id, {
      paymentMethod: body.paymentMethod ?? null,
      paymentReference: body.paymentReference ?? null,
      allowFromAccrued: !!body.allowFromAccrued,
    })
    if (r.ok) {
      paidCount++
      results.push({ id, ok: true })
      const row: any = rowMap.get(id)
      const userId = row?.sales_agents?.user_id
      if (userId) {
        await notifyUser({
          userId,
          type: "commission_paid",
          title: "Commissione liquidata",
          body: `€ ${Number(row.amount_eur).toFixed(2)} per ${row?.hotels?.name ?? "struttura"} (${String(row.period_month).padStart(2, "0")}/${row.period_year}).`,
          actionUrl: "/sales/commissions",
          dedupKey: `commission_paid:${id}`,
        })
      }
    } else {
      results.push({ id, ok: false, error: r.error })
    }
  }

  return NextResponse.json({
    results,
    paidCount,
    skippedCount: ids.length - paidCount,
  })
}
