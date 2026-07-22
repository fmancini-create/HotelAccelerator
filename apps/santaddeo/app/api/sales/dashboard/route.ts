import { NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { getAuthUserOrDev } from "@/lib/auth/getAuthUserOrDev"

export const dynamic = "force-dynamic"

/**
 * Dashboard data API per i venditori (CRM).
 *
 * Ritorna un payload aggregato per la pagina /sales:
 *  - sales_agent: la riga sales_agents collegata all'utente
 *  - kpi: contatori aggregati (strutture, MRR delle attive, commissione mese)
 *  - hotels: lista delle strutture associate (sales_agent_hotels JOIN hotels
 *    JOIN accelerator_subscriptions) coi permessi granulari applicati
 *
 * Permessi:
 *  - sales_agent puo' vedere SOLO le strutture associate (filtro per
 *    sales_agent_id). I campi di dettaglio sono mascherati in base ai flag
 *    can_view_* di sales_agent_hotels (eventualmente sovrascritti dai
 *    permessi globali del venditore).
 *  - super_admin puo' opzionalmente passare ?agent_id=... per ispezionare
 *    una dashboard di un singolo venditore.
 *
 * Service role: usato per bypassare RLS dopo il check di ruolo. Cosi'
 * possiamo applicare i permessi granulari lato server senza fare
 * RPC complesse a livello DB.
 */
export async function GET(request: Request) {
  const { user, supabase: authSupa } = await getAuthUserOrDev()
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  const { data: profile } = await authSupa
    .from("profiles")
    .select("id, role, first_name, last_name, email")
    .eq("id", user.id)
    .single()

  // Permesso d'accesso al CRM venditori:
  //  - super_admin (puo' impersonare qualunque agent passando ?agent_id=)
  //  - profile.role = 'sales_agent' (utente puramente venditore)
  //  - chiunque abbia una riga in `sales_agents` con `is_active=true` (dual
  //    role: es. property_admin che e' anche venditore — vedi memoria
  //    03/05/2026 "role primario property_admin + flag agente").
  //
  // L'unica differenza: i super_admin possono override l'agent_id per
  // ispezionare; tutti gli altri vedono SEMPRE il proprio agent record
  // (filtro user_id=user.id sotto).
  let isAllowed = profile?.role === "super_admin" || profile?.role === "sales_agent"
  if (!isAllowed && user?.id) {
    const svcEarly = await createServiceRoleClient()
    const { data: maybeAgent } = await svcEarly
      .from("sales_agents")
      .select("id")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .maybeSingle()
    if (maybeAgent) isAllowed = true
  }
  if (!isAllowed) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 })
  }

  const url = new URL(request.url)
  const overrideAgentId = url.searchParams.get("agent_id")

  // Service role: dopo il check di ruolo applichiamo i filtri lato server.
  const svc = await createServiceRoleClient()

  // 1. Trova il sales_agent dell'utente (oppure quello richiesto da admin).
  let agentQuery = svc.from("sales_agents").select("*")
  if (profile?.role === "super_admin" && overrideAgentId) {
    agentQuery = agentQuery.eq("id", overrideAgentId)
  } else {
    agentQuery = agentQuery.eq("user_id", user.id)
  }
  const { data: agent, error: agentErr } = await agentQuery.maybeSingle()

  if (agentErr) {
    console.error("[sales/dashboard] error fetching sales_agent:", agentErr)
    return NextResponse.json({ error: "db_error" }, { status: 500 })
  }
  if (!agent) {
    // Caso comune al primo accesso: il superadmin deve creare la riga
    // sales_agents per questo profilo. UI mostra "non sei configurato".
    return NextResponse.json({
      profile,
      sales_agent: null,
      kpi: null,
      hotels: [],
      message: "Profilo venditore non ancora configurato dal superadmin.",
    })
  }

  if (!agent.is_active) {
    return NextResponse.json({
      profile,
      sales_agent: agent,
      kpi: { hotels_total: 0, hotels_active: 0, mrr_total_eur: 0, commission_month_eur: 0 },
      hotels: [],
      message: "Account venditore disattivato. Contatta il superadmin.",
    })
  }

  // 2. Strutture associate al venditore (con dettagli hotel + abbonamento).
  const { data: associations, error: assocErr } = await svc
    .from("sales_agent_hotels")
    .select(
      `
      hotel_id,
      lead_status,
      commission_percentage,
      can_view_subscription,
      can_view_payments,
      can_view_metrics,
      can_view_full_dashboard,
      activated_at,
      created_at,
      notes,
      hotels:hotel_id (
        id,
        name,
        is_active,
        organization_id,
        created_at
      )
    `,
    )
    .eq("sales_agent_id", agent.id)
    .order("created_at", { ascending: false })

  if (assocErr) {
    console.error("[sales/dashboard] error fetching associations:", assocErr)
    return NextResponse.json({ error: "db_error" }, { status: 500 })
  }

  const hotelIds = (associations ?? []).map((a) => a.hotel_id).filter(Boolean) as string[]

  // 3. Abbonamenti correnti delle strutture.
  //    Schema reale `accelerator_subscriptions` (NON quello che il codice
  //    storico assumeva: status/plan/amount_eur/billing_period/...). Vedi
  //    information_schema. Mappatura di compatibilita' verso il client UI:
  //
  //      DB                        →  client/UI key
  //      payment_status            →  status        ('active'|'pending'|...)
  //      plan_type                 →  plan          ('fixed_fee'|'commission')
  //      monthly_fee               →  amount_eur    (numerico mensile)
  //      billing_cycle             →  billing_period ('monthly'|'yearly'|...)
  //      last_payment_date         →  last_payment_at
  //      next_billing_date         →  current_period_end
  //      started_at                →  started_at    (uguale)
  //
  //    Inoltre filtriamo `is_active=true` per non considerare sub spente.
  //    Se l'hotel ha piu' record (storico), ordiniamo per started_at desc
  //    e teniamo il piu' recente.
  let subsByHotel: Record<string, any> = {}
  if (hotelIds.length > 0) {
    const { data: subs, error: subsErr } = await svc
      .from("accelerator_subscriptions")
      .select(
        "hotel_id, payment_status, plan_type, monthly_fee, fixed_fee_per_room, commission_percentage, billing_cycle, last_payment_date, next_billing_date, started_at, is_active, trial_end_at",
      )
      .in("hotel_id", hotelIds)
      .eq("is_active", true)
      .order("started_at", { ascending: false })
    if (subsErr) {
      console.error("[sales/dashboard] error fetching subscriptions:", subsErr)
    }
    // Tieni solo il record piu' recente per hotel.
    for (const s of subs ?? []) {
      if (!subsByHotel[s.hotel_id]) {
        subsByHotel[s.hotel_id] = {
          // Campi mappati per il client UI (vedi commento sopra).
          status: s.payment_status,
          plan: s.plan_type,
          amount_eur: Number(s.monthly_fee ?? 0),
          billing_period: s.billing_cycle,
          last_payment_at: s.last_payment_date,
          current_period_end: s.next_billing_date,
          started_at: s.started_at,
          // Campi raw mantenuti per logica server (KPI/MRR).
          _raw: s,
        }
      }
    }
  }

  // 4. Calcoli KPI aggregati.
  const startOfMonth = new Date()
  startOfMonth.setDate(1)
  startOfMonth.setHours(0, 0, 0, 0)

  let mrrTotal = 0
  let activeCount = 0
  for (const a of associations ?? []) {
    const sub = subsByHotel[a.hotel_id]
    // Considero "attivo" un sub con payment_status='active' OPPURE un trial
    // ancora dentro la finestra trial_end_at > now. Tutto il resto (pending,
    // cancelled, ecc.) non contribuisce all'MRR.
    const isActive =
      sub &&
      (sub.status === "active" ||
        (sub._raw?.trial_end_at && new Date(sub._raw.trial_end_at) > new Date()))
    if (isActive) {
      activeCount += 1
      const monthly = monthlyAmount(sub.amount_eur ?? 0, sub.billing_period)
      mrrTotal += monthly
    }
  }

  // 5. Commissioni del mese corrente per questo venditore.
  const { data: ledgerMonth } = await svc
    .from("sales_commissions_ledger")
    .select("amount_eur, status, hotel_id")
    .eq("sales_agent_id", agent.id)
    .gte("period_start", startOfMonth.toISOString().slice(0, 10))

  const commissionMonth = (ledgerMonth ?? []).reduce(
    (sum, row) => sum + Number(row.amount_eur ?? 0),
    0,
  )

  // 5b. Commissioni totali per hotel (tutti gli stati: accrued, earned, paid)
  //     per mostrare l'importo nelle strutture con piano commission.
  const { data: ledgerByHotel } = await svc
    .from("sales_commissions_ledger")
    .select("hotel_id, amount_eur, status")
    .eq("sales_agent_id", agent.id)
    .in("hotel_id", hotelIds)
    .not("status", "eq", "voided")

  // Aggrega commissioni per hotel
  const commissionsByHotel: Record<string, { total: number; earned: number; paid: number }> = {}
  for (const row of ledgerByHotel ?? []) {
    if (!commissionsByHotel[row.hotel_id]) {
      commissionsByHotel[row.hotel_id] = { total: 0, earned: 0, paid: 0 }
    }
    const amt = Number(row.amount_eur ?? 0)
    commissionsByHotel[row.hotel_id].total += amt
    if (row.status === "earned" || row.status === "paid") {
      commissionsByHotel[row.hotel_id].earned += amt
    }
    if (row.status === "paid") {
      commissionsByHotel[row.hotel_id].paid += amt
    }
  }

  // 6. Compose hotels con dati mascherati in base ai permessi.
  const hotels = (associations ?? []).map((a: any) => {
    const sub = subsByHotel[a.hotel_id]
    const hotelComm = commissionsByHotel[a.hotel_id] ?? { total: 0, earned: 0, paid: 0 }
    const canSub =
      a.can_view_subscription || agent.global_can_view_subscription || profile?.role === "super_admin"
    const canPay =
      a.can_view_payments || agent.global_can_view_payments || profile?.role === "super_admin"
    const canMetrics =
      a.can_view_metrics || agent.global_can_view_metrics || profile?.role === "super_admin"
    const canFull =
      a.can_view_full_dashboard ||
      agent.global_can_view_full_dashboard ||
      profile?.role === "super_admin"

    const subscription = canSub && sub ? sub : null

    return {
      hotel_id: a.hotel_id,
      hotel_name: a.hotels?.name ?? "(senza nome)",
      is_active: a.hotels?.is_active ?? false,
      lead_status: a.lead_status,
      commission_percentage: a.commission_percentage,
      activated_at: a.activated_at,
      created_at: a.created_at,
      notes: a.notes,
      // Commissioni maturate per questa struttura (visibili sempre al venditore)
      commissions: {
        total_eur: round2(hotelComm.total),
        earned_eur: round2(hotelComm.earned),
        paid_eur: round2(hotelComm.paid),
      },
      subscription: subscription
        ? {
            // Field names allineati al client (vedi note sezione 3 sopra
            // sulla mappatura DB → UI).
            plan: subscription.plan,
            status: subscription.status,
            amount_eur: subscription.amount_eur,
            billing_period: subscription.billing_period,
            started_at: subscription.started_at,
            current_period_end: subscription.current_period_end,
            last_payment_at: canPay ? subscription.last_payment_at : null,
          }
        : null,
      permissions: {
        view_subscription: canSub,
        view_payments: canPay,
        view_metrics: canMetrics,
        view_full_dashboard: canFull,
      },
    }
  })

  return NextResponse.json({
    profile,
    sales_agent: {
      id: agent.id,
      display_name: agent.display_name,
      email: agent.email,
      is_active: agent.is_active,
      default_commission_percentage: agent.default_commission_percentage,
    },
    kpi: {
      hotels_total: hotels.length,
      hotels_active: activeCount,
      mrr_total_eur: round2(mrrTotal),
      commission_month_eur: round2(commissionMonth),
    },
    hotels,
  })
}

function monthlyAmount(amount: number, period: string | null) {
  if (!period || period === "monthly") return Number(amount)
  if (period === "yearly") return Number(amount) / 12
  if (period === "quarterly") return Number(amount) / 3
  return Number(amount)
}
function round2(n: number) {
  return Math.round(n * 100) / 100
}
