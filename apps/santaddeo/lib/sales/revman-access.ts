/**
 * Accesso del venditore all'Area Revenue Manager (sola lettura) di un hotel.
 *
 * CONTESTO (incidente 06/06/2026): esistevano due sistemi scollegati.
 *  - `sales_agent_hotels`  -> associazione COMMERCIALE (CRM). Chiave
 *    `sales_agent_id = sales_agents.id`. Ci scrive "Associa struttura".
 *  - `revman_sales_access` -> grant ESPLICITO di accesso RevMan. Chiave
 *    `sales_agent_id = profiles.id` (auth user id). Lo legge l'area /sales/revman.
 *
 * Associare una struttura a un venditore (sales_agent_hotels) NON creava il
 * grant RevMan, quindi il venditore vedeva l'hotel nella dashboard CRM ma non
 * poteva "entrare" nell'area Revenue Manager. Qui unifichiamo i due mondi a
 * livello di LETTURA: un venditore ha accesso RevMan a un hotel se
 *   (a) esiste un grant esplicito in revman_sales_access, OPPURE
 *   (b) l'hotel gli e' associato in sales_agent_hotels (via sales_agents.user_id).
 *
 * Cosi' l'associazione commerciale implica l'accesso (intento del super-admin),
 * senza perdere il flusso di grant esplicito per venditori NON associati.
 *
 * Tutte le query usano il service-role client passato dal chiamante (il check
 * di identita'/ruolo e' gia' stato fatto a monte). Il param e' tipizzato `any`
 * per evitare l'istanziazione profonda dei generics Supabase (TS2589), coerente
 * col resto del codebase.
 */

export type SellerRevmanHotel = {
  hotel_id: string
  hotel_name: string
  granted_at: string | null
  /** Origine dell'accesso: grant esplicito o associazione commerciale. */
  source: "grant" | "association"
}

/** Risolve gli id delle righe sales_agents collegate a un utente (profiles.id). */
async function resolveAgentIds(svc: any, userId: string): Promise<string[]> {
  const { data } = await svc.from("sales_agents").select("id").eq("user_id", userId)
  return (data ?? []).map((r: { id: string }) => r.id)
}

/**
 * Elenco hotel a cui il venditore (profiles.id = userId) ha accesso RevMan,
 * unione di grant espliciti + strutture associate. Deduplicato per hotel_id
 * (il grant esplicito ha priorita' sulla sorgente mostrata).
 */
export async function getSellerRevmanHotels(
  svc: any,
  userId: string,
): Promise<SellerRevmanHotel[]> {
  const map = new Map<string, SellerRevmanHotel>()

  // (a) Grant espliciti
  const { data: grants } = await svc
    .from("revman_sales_access")
    .select("hotel_id, granted_at, hotel:hotels!inner(id, name)")
    .eq("sales_agent_id", userId)
    .order("granted_at", { ascending: false })
  for (const g of grants ?? []) {
    map.set(g.hotel_id, {
      hotel_id: g.hotel_id,
      hotel_name: g.hotel?.name || g.hotel_id,
      granted_at: g.granted_at ?? null,
      source: "grant",
    })
  }

  // (b) Strutture associate commercialmente
  const agentIds = await resolveAgentIds(svc, userId)
  if (agentIds.length > 0) {
    const { data: assocs } = await svc
      .from("sales_agent_hotels")
      .select("hotel_id, created_at, hotel:hotels!inner(id, name)")
      .in("sales_agent_id", agentIds)
    for (const a of assocs ?? []) {
      if (!map.has(a.hotel_id)) {
        map.set(a.hotel_id, {
          hotel_id: a.hotel_id,
          hotel_name: a.hotel?.name || a.hotel_id,
          granted_at: a.created_at ?? null,
          source: "association",
        })
      }
    }
  }

  return [...map.values()].sort((x, y) =>
    (y.granted_at ?? "").localeCompare(x.granted_at ?? ""),
  )
}

/**
 * Permessi del venditore su una SINGOLA struttura. Stessa semantica usata in
 * /api/sales/dashboard: il flag per-struttura (sales_agent_hotels.can_view_*)
 * fa OVERRIDE in OR sul flag globale dell'agente (sales_agents.global_can_view_*).
 *
 *   permesso_effettivo = flag_struttura OR flag_globale_agente
 *
 * - `metrics`        -> KPI/analytics in sola lettura (occupazione, ADR, RevPAR...)
 * - `full_dashboard` -> accesso completo (anche moduli avanzati: pricing, pace,
 *                       rate shopper, obiettivi). Implica `metrics`.
 *
 * Ritorna null se l'utente non e' un venditore con accesso a quell'hotel.
 */
export type SellerHotelPermissions = {
  view_subscription: boolean
  view_payments: boolean
  view_metrics: boolean
  view_full_dashboard: boolean
}

export async function getSellerHotelPermissions(
  svc: any,
  userId: string,
  hotelId: string,
): Promise<SellerHotelPermissions | null> {
  const agentIds = await resolveAgentIds(svc, userId)
  if (agentIds.length === 0) {
    // Nessuna riga sales_agents: puo' comunque avere un grant esplicito RevMan,
    // ma senza agente non esistono flag di permesso -> accesso base nullo.
    return null
  }

  // Flag globali dell'agente (prendiamo la prima riga agente collegata).
  const { data: agent } = await svc
    .from("sales_agents")
    .select(
      "global_can_view_subscription, global_can_view_payments, global_can_view_metrics, global_can_view_full_dashboard",
    )
    .in("id", agentIds)
    .limit(1)
    .maybeSingle()

  // Flag per-struttura (override) sull'associazione, se presente.
  const { data: assoc } = await svc
    .from("sales_agent_hotels")
    .select(
      "can_view_subscription, can_view_payments, can_view_metrics, can_view_full_dashboard",
    )
    .eq("hotel_id", hotelId)
    .in("sales_agent_id", agentIds)
    .maybeSingle()

  const or = (perHotel: unknown, global: unknown) => Boolean(perHotel) || Boolean(global)

  const fullDashboard = or(assoc?.can_view_full_dashboard, agent?.global_can_view_full_dashboard)
  return {
    view_subscription: or(assoc?.can_view_subscription, agent?.global_can_view_subscription),
    view_payments: or(assoc?.can_view_payments, agent?.global_can_view_payments),
    // full_dashboard implica metrics
    view_metrics: fullDashboard || or(assoc?.can_view_metrics, agent?.global_can_view_metrics),
    view_full_dashboard: fullDashboard,
  }
}

/**
 * True se il venditore (profiles.id = userId) puo' accedere all'area RevMan
 * dell'hotel: grant esplicito OPPURE struttura associata.
 */
export async function sellerHasRevmanAccess(
  svc: any,
  userId: string,
  hotelId: string,
): Promise<boolean> {
  const { data: grant } = await svc
    .from("revman_sales_access")
    .select("id")
    .eq("hotel_id", hotelId)
    .eq("sales_agent_id", userId)
    .maybeSingle()
  if (grant) return true

  const agentIds = await resolveAgentIds(svc, userId)
  if (agentIds.length === 0) return false

  const { data: assoc } = await svc
    .from("sales_agent_hotels")
    .select("id")
    .eq("hotel_id", hotelId)
    .in("sales_agent_id", agentIds)
    .maybeSingle()
  return !!assoc
}
