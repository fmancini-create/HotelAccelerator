import { NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { getAuthUserOrDev } from "@/lib/auth/getAuthUserOrDev"

export const dynamic = "force-dynamic"

/**
 * GET /api/sales/commissions
 *
 * Ritorna lo storico commissioni del venditore corrente:
 *  - kpi: totale pagato (status='paid'), totale in attesa (status='pending'),
 *    mese corrente, ultimi 12 mesi
 *  - ledger: righe di sales_commissions_ledger filtrate per il proprio
 *    sales_agent_id, JOIN con hotels per il nome
 *  - by_month: aggregazione per period_year/period_month per mostrare
 *    un breakdown temporale
 *
 * Permessi: come /api/sales/dashboard, gli agenti vedono solo le proprie
 * righe. I super_admin possono passare ?agent_id=... per ispezionare lo
 * storico di un singolo venditore.
 *
 * Filtri opzionali:
 *  - ?status=accrued|earned|paid|voided
 *    (compat retroattiva: "pending" mappato a "accrued+earned",
 *     "cancelled" a "voided")
 *  - ?hotel_id=<uuid>
 *  - ?from=YYYY-MM (period inclusivo)
 *  - ?to=YYYY-MM (period inclusivo)
 *
 * Lifecycle stati:
 *  accrued = maturata (fattura tenant emessa, Santaddeo non ha ancora incassato)
 *  earned  = liquidabile (tenant ha pagato la fattura, in attesa del bonifico al venditore)
 *  paid    = liquidata (bonifico Santaddeo → venditore eseguito)
 *  voided  = annullata (storno, fattura cancellata, ecc.)
 */
export async function GET(request: Request) {
  const { user, supabase: authSupa } = await getAuthUserOrDev()
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  const { data: profile } = await authSupa
    .from("profiles")
    .select("id, role")
    .eq("id", user.id)
    .single()

  if (!profile || (profile.role !== "sales_agent" && profile.role !== "super_admin")) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }

  const url = new URL(request.url)
  const overrideAgentId = url.searchParams.get("agent_id")
  const statusFilter = url.searchParams.get("status")
  const hotelFilter = url.searchParams.get("hotel_id")
  const fromMonth = url.searchParams.get("from") // "2026-01"
  const toMonth = url.searchParams.get("to") // "2026-12"

  const svc = await createServiceRoleClient()

  // 1) Trova il sales_agent (proprio o quello richiesto da admin).
  let agentQuery = svc.from("sales_agents").select("id, display_name, default_commission_percentage")
  if (profile.role === "super_admin" && overrideAgentId) {
    agentQuery = agentQuery.eq("id", overrideAgentId)
  } else {
    agentQuery = agentQuery.eq("user_id", user.id)
  }
  const { data: agent, error: agentErr } = await agentQuery.maybeSingle()

  if (agentErr) {
    console.error("[sales/commissions] error fetching sales_agent:", agentErr)
    return NextResponse.json({ error: "db_error" }, { status: 500 })
  }
  if (!agent) {
    return NextResponse.json({
      sales_agent: null,
      kpi: emptyKpi(),
      ledger: [],
      by_month: [],
      hotels: [],
      message: "Profilo venditore non ancora configurato dal superadmin.",
    })
  }

  // 2) Carica il ledger con filtri. Usa range esplicito per evitare il
  //    cap default 1000 di Supabase (vedi MEMORY: lezioni connectors-health).
  let q = svc
    .from("sales_commissions_ledger")
    .select(
      "id, hotel_id, invoice_id, period_year, period_month, period_start, base_amount_eur, commission_percentage, commission_basis, amount_eur, currency, status, accrued_at, earned_at, paid_at, voided_at, voided_reason, payment_method, notes, created_at",
    )
    .eq("sales_agent_id", agent.id)
    .order("period_start", { ascending: false })

  if (statusFilter) {
    // Compat retroattiva con vecchio API
    const map: Record<string, string[]> = {
      accrued: ["accrued"],
      earned: ["earned"],
      paid: ["paid"],
      voided: ["voided"],
      pending: ["accrued", "earned"],
      cancelled: ["voided"],
    }
    const allowed = map[statusFilter]
    if (allowed) q = q.in("status", allowed)
  }
  if (hotelFilter) {
    q = q.eq("hotel_id", hotelFilter)
  }
  if (fromMonth) {
    const [y, m] = fromMonth.split("-").map((n) => Number.parseInt(n, 10))
    if (!Number.isNaN(y) && !Number.isNaN(m)) {
      const from = `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-01`
      q = q.gte("period_start", from)
    }
  }
  if (toMonth) {
    const [y, m] = toMonth.split("-").map((n) => Number.parseInt(n, 10))
    if (!Number.isNaN(y) && !Number.isNaN(m)) {
      // Ultimo giorno del mese
      const last = new Date(Date.UTC(y, m, 0)).getUTCDate()
      const to = `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(last).padStart(2, "0")}`
      q = q.lte("period_start", to)
    }
  }

  const { data: rawLedger, error: ledgerErr } = await q.range(0, 999)
  if (ledgerErr) {
    console.error("[sales/commissions] error fetching ledger:", ledgerErr)
    return NextResponse.json({ error: "db_error" }, { status: 500 })
  }
  const ledgerRows = rawLedger ?? []

  // 3) Risolvi i nomi degli hotel in batch.
  const hotelIds = [...new Set(ledgerRows.map((r) => r.hotel_id).filter(Boolean))] as string[]
  let hotelsByid: Record<string, { id: string; name: string }> = {}
  if (hotelIds.length > 0) {
    const { data: hs } = await svc.from("hotels").select("id, name").in("id", hotelIds)
    hotelsByid = Object.fromEntries((hs ?? []).map((h) => [h.id, h]))
  }

  // 4) Lista delle strutture associate (per popolare il filtro nel dropdown).
  const { data: associatedHotels } = await svc
    .from("sales_agent_hotels")
    .select("hotel_id, hotels:hotel_id(id, name)")
    .eq("sales_agent_id", agent.id)

  // 5) Compose ledger arricchito.
  const ledger = ledgerRows.map((r: any) => ({
    id: r.id,
    hotel_id: r.hotel_id,
    hotel_name: hotelsByid[r.hotel_id]?.name ?? "(struttura rimossa)",
    invoice_id: r.invoice_id ?? null,
    period_year: r.period_year,
    period_month: r.period_month,
    period_start: r.period_start,
    base_amount_eur: Number(r.base_amount_eur ?? 0),
    commission_percentage: Number(r.commission_percentage ?? 0),
    commission_basis: r.commission_basis ?? "invoice_total",
    amount_eur: Number(r.amount_eur ?? 0),
    currency: r.currency ?? "EUR",
    status: r.status,
    accrued_at: r.accrued_at,
    earned_at: r.earned_at,
    paid_at: r.paid_at,
    voided_at: r.voided_at,
    voided_reason: r.voided_reason,
    payment_method: r.payment_method,
    notes: r.notes,
  }))

  // 6) KPI aggregati (su TUTTO il ledger del venditore, ignorando i filtri,
  //    cosi' i numeri restano coerenti tra le pagine).
  const { data: allLedger } = await svc
    .from("sales_commissions_ledger")
    .select("amount_eur, status, period_year, period_month, period_start, paid_at")
    .eq("sales_agent_id", agent.id)
    .range(0, 9999)

  const all = allLedger ?? []
  const now = new Date()
  const currentYear = now.getUTCFullYear()
  const currentMonth = now.getUTCMonth() + 1

  // Metriche venditore con 4 stati:
  //  - accrued = maturata
  //  - earned  = liquidabile (tenant ha pagato)
  //  - paid    = liquidata
  //  - voided  = annullata
  // Totale "maturato" = accrued + earned + paid (la performance reale).
  let totalAccrued = 0
  let totalEarned = 0
  let totalPaid = 0
  let monthCurrent = 0
  let last12 = 0
  const cutoff12 = new Date(now)
  cutoff12.setUTCMonth(cutoff12.getUTCMonth() - 11)
  cutoff12.setUTCDate(1)

  const monthlyMap = new Map<string, { accrued: number; earned: number; paid: number; total: number }>()
  for (const r of all as any[]) {
    const amt = Number(r.amount_eur ?? 0)
    if (r.status === "paid") totalPaid += amt
    else if (r.status === "earned") totalEarned += amt
    else if (r.status === "accrued") totalAccrued += amt

    if (r.period_year === currentYear && r.period_month === currentMonth && r.status !== "voided") {
      monthCurrent += amt
    }
    const periodDate = r.period_start ? new Date(r.period_start) : null
    if (periodDate && periodDate >= cutoff12 && r.status !== "voided") {
      last12 += amt
    }
    const key = `${r.period_year}-${String(r.period_month).padStart(2, "0")}`
    const cur = monthlyMap.get(key) ?? { accrued: 0, earned: 0, paid: 0, total: 0 }
    if (r.status === "paid") cur.paid += amt
    else if (r.status === "earned") cur.earned += amt
    else if (r.status === "accrued") cur.accrued += amt
    if (r.status !== "voided") cur.total += amt
    monthlyMap.set(key, cur)
  }

  const by_month = [...monthlyMap.entries()]
    .map(([key, v]) => ({
      key,
      year: Number.parseInt(key.split("-")[0]!, 10),
      month: Number.parseInt(key.split("-")[1]!, 10),
      accrued: round2(v.accrued),
      earned: round2(v.earned),
      paid: round2(v.paid),
      // pending = totale che non e' ancora paid (= accrued + earned), retrocompat
      pending: round2(v.accrued + v.earned),
      total: round2(v.total),
    }))
    .sort((a, b) => (a.key < b.key ? 1 : -1))
    .slice(0, 24)

  return NextResponse.json({
    sales_agent: {
      id: agent.id,
      display_name: agent.display_name,
      default_commission_percentage: agent.default_commission_percentage,
    },
    kpi: {
      // Liquidate (gia' incassate dal venditore)
      total_paid_eur: round2(totalPaid),
      // Liquidabili (tenant ha pagato, Santaddeo deve liquidare)
      total_earned_eur: round2(totalEarned),
      // Maturate ma non ancora liquidabili (tenant non ha ancora pagato)
      total_accrued_eur: round2(totalAccrued),
      // Pending totale = accrued + earned (compat retro)
      total_pending_eur: round2(totalAccrued + totalEarned),
      // Performance reale = tutto cio' che non e' voided
      total_maturato_eur: round2(totalAccrued + totalEarned + totalPaid),
      month_current_eur: round2(monthCurrent),
      last_12_months_eur: round2(last12),
    },
    hotels: (associatedHotels ?? [])
      .map((a) => {
        const h = a.hotels as unknown as { id: string; name: string } | null
        return h ? { id: h.id, name: h.name } : null
      })
      .filter((x): x is { id: string; name: string } => Boolean(x))
      .sort((a, b) => a.name.localeCompare(b.name, "it")),
    by_month,
    ledger,
  })
}

function round2(n: number) {
  return Math.round(n * 100) / 100
}
function emptyKpi() {
  return {
    total_paid_eur: 0,
    total_earned_eur: 0,
    total_accrued_eur: 0,
    total_pending_eur: 0,
    total_maturato_eur: 0,
    month_current_eur: 0,
    last_12_months_eur: 0,
  }
}
