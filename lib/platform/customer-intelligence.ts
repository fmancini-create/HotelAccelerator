export const PLATFORM_PRODUCT_KEYS = ["hotelaccelerator", "santaddeo", "hotelprofitai", "manubot"] as const
export type PlatformProductKey = (typeof PLATFORM_PRODUCT_KEYS)[number]

export const PLATFORM_PRODUCT_LABELS: Record<PlatformProductKey, string> = {
  hotelaccelerator: "HotelAccelerator",
  santaddeo: "Santaddeo RMS",
  hotelprofitai: "HotelProfitAI",
  manubot: "ManuBot",
}

export type PlatformCustomerProfile = {
  customer_account_id: string
  display_name: string | null
  legal_name: string | null
  lifecycle_stage: string
  account_type: string
  source: string | null
  structures_count: number
  rooms_count: number | null
  city: string | null
  province: string | null
  region: string | null
  country: string | null
  website: string | null
  customer_tier: string
  health_status: string
  health_score: number | null
  adoption_score: number | null
  churn_risk_score: number | null
  satisfaction_score: number | null
  potential_value_cents: number | null
  mrr_override_cents: number | null
  next_renewal_at: string | null
  last_touch_at: string | null
  owner_label: string | null
  tags: string[]
  tech_stack: Record<string, unknown>
  notes: string | null
  metadata: Record<string, unknown>
}

export type PlatformProductState = {
  product_key: PlatformProductKey
  status: string
  external_tenant_id: string | null
  activated_at: string | null
  expires_at: string | null
  plan: string | null
  mrr_cents: number | null
  usage_score: number | null
  health_score: number | null
  onboarding_status: string | null
  last_activity_at: string | null
  renewal_at: string | null
  last_synced_at: string | null
  metrics: Record<string, unknown>
}

export type PlatformCustomerAccount = {
  id: string
  account_number: number
  property_id: string | null
  created_at: string
  profile: PlatformCustomerProfile
  products: PlatformProductState[]
}

export type CrossSellOpportunity = {
  product: PlatformProductKey
  score: number
  reasons: string[]
}

const HOTEL_TYPES = new Set(["hotel_single", "hotel_group", "chain", "resort", "agriturismo", "bnb", "residence", "camping", "vacation_rental"])
const ACTIVE_PRODUCT_STATUSES = new Set(["active", "trial", "onboarding"])

export function hasActiveProduct(account: PlatformCustomerAccount, product: PlatformProductKey) {
  return account.products.some((item) => item.product_key === product && ACTIVE_PRODUCT_STATUSES.has(item.status))
}

export function activeProductCount(account: PlatformCustomerAccount) {
  return PLATFORM_PRODUCT_KEYS.filter((product) => hasActiveProduct(account, product)).length
}

export function accountDisplayName(account: PlatformCustomerAccount) {
  return account.profile.display_name?.trim() || account.profile.legal_name?.trim() || `Cliente 4BID #${account.account_number}`
}

function productState(account: PlatformCustomerAccount, product: PlatformProductKey) {
  return account.products.find((item) => item.product_key === product)
}

export function calculateCrossSell(account: PlatformCustomerAccount): CrossSellOpportunity[] {
  const result: CrossSellOpportunity[] = []
  const rooms = account.profile.rooms_count ?? 0
  const hotelLike = HOTEL_TYPES.has(account.profile.account_type)
  const productCount = activeProductCount(account)
  const healthPenalty = ["risk", "critical"].includes(account.profile.health_status) ? 25 : 0

  for (const product of PLATFORM_PRODUCT_KEYS) {
    if (hasActiveProduct(account, product)) continue
    let score = 10 + Math.min(productCount * 8, 24)
    const reasons: string[] = []

    if (hotelLike) {
      score += 15
      reasons.push("azienda hospitality")
    }
    if (rooms >= 10) {
      score += 10
      reasons.push(`${rooms} camere/unità`)
    }
    if (rooms >= 30) score += 8

    if (product === "hotelaccelerator") {
      if (hasActiveProduct(account, "santaddeo") || hasActiveProduct(account, "hotelprofitai") || hasActiveProduct(account, "manubot")) {
        score += 28
        reasons.push("già cliente della suite")
      }
    }
    if (product === "santaddeo") {
      if (hotelLike && rooms >= 8) {
        score += 28
        reasons.push("dimensione adatta a revenue management")
      }
      if (hasActiveProduct(account, "hotelaccelerator")) {
        score += 15
        reasons.push("CRM già attivo")
      }
    }
    if (product === "hotelprofitai") {
      if (hotelLike) {
        score += 20
        reasons.push("potenziale controllo di gestione")
      }
      if (hasActiveProduct(account, "hotelaccelerator") || hasActiveProduct(account, "santaddeo")) score += 12
    }
    if (product === "manubot") {
      if (rooms >= 15) {
        score += 24
        reasons.push("complessità manutentiva probabile")
      }
      if (["hotel_single", "hotel_group", "chain", "resort"].includes(account.profile.account_type)) score += 12
    }

    score = Math.max(0, Math.min(100, score - healthPenalty))
    if (healthPenalty) reasons.push("priorità ridotta: customer health da recuperare")
    result.push({ product, score, reasons })
  }

  return result.sort((a, b) => b.score - a.score)
}

export type PlatformSegment = {
  id: string
  category: "Acquisizione" | "Clienti" | "Cross-sell" | "Customer Health" | "Rinnovi"
  label: string
  description: string
  count: number
  accountIds: string[]
  prospectCount?: number
}

export function buildSystemSegments(accounts: PlatformCustomerAccount[], prospects: Array<{ id: string; sales_stage: string; lead_score: number; next_action_at: string | null; status: string }>): PlatformSegment[] {
  const now = Date.now()
  const customers = accounts.filter((a) => a.profile.lifecycle_stage !== "internal")
  const multi = customers.filter((a) => activeProductCount(a) >= 2)
  const complete = customers.filter((a) => activeProductCount(a) === PLATFORM_PRODUCT_KEYS.length)
  const newCustomers = customers.filter((a) => now - new Date(a.created_at).getTime() <= 30 * 86400000)
  const risk = customers.filter((a) => ["risk", "critical", "at_risk"].includes(a.profile.health_status) || a.profile.lifecycle_stage === "at_risk")
  const highChurnRisk = customers.filter((a) => (a.profile.churn_risk_score ?? 0) >= 60)
  const renewal30 = customers.filter((a) => {
    const dates = [a.profile.next_renewal_at, ...a.products.map((p) => p.renewal_at || p.expires_at)].filter(Boolean) as string[]
    return dates.some((value) => { const d = new Date(value).getTime(); return d >= now && d <= now + 30 * 86400000 })
  })
  const paymentRisk = customers.filter((a) => a.products.some((p) => p.status === "past_due"))

  const santaddeoLowUsage = customers.filter((a) => {
    const product = productState(a, "santaddeo")
    return Boolean(product && ACTIVE_PRODUCT_STATUSES.has(product.status) && product.usage_score !== null && product.usage_score < 30)
  })
  const hotelProfitOnboardingBlocked = customers.filter((a) => {
    const product = productState(a, "hotelprofitai")
    if (!product || !ACTIVE_PRODUCT_STATUSES.has(product.status)) return false
    const onboarding = product.onboarding_status?.toLowerCase() ?? ""
    return product.status === "onboarding" || ["integration_missing", "setup_incomplete", "blocked", "error", "pending"].includes(onboarding)
  })
  const manuBotIdle = customers.filter((a) => {
    const product = productState(a, "manubot")
    if (!product || !ACTIVE_PRODUCT_STATUSES.has(product.status)) return false
    return product.onboarding_status === "configured_idle" || (product.usage_score !== null && product.usage_score < 20)
  })
  const staleProducts = customers.filter((a) => a.products.some((product) => {
    if (!ACTIVE_PRODUCT_STATUSES.has(product.status) || !product.last_activity_at) return false
    const lastActivity = new Date(product.last_activity_at).getTime()
    return Number.isFinite(lastActivity) && now - lastActivity >= 14 * 86400000
  }))

  const segment = (id: string, category: PlatformSegment["category"], label: string, description: string, rows: PlatformCustomerAccount[]): PlatformSegment => ({
    id, category, label, description, count: rows.length, accountIds: rows.map((row) => row.id),
  })

  const cross = (product: PlatformProductKey, minScore = 55) => customers.filter((a) => calculateCrossSell(a).some((o) => o.product === product && o.score >= minScore))
  const dueProspects = prospects.filter((p) => p.next_action_at && new Date(p.next_action_at).getTime() <= now && !["won", "lost", "paused"].includes(p.sales_stage))
  const hotProspects = prospects.filter((p) => p.lead_score >= 60 && !["won", "lost"].includes(p.sales_stage))
  const engaged = prospects.filter((p) => ["engaged", "email_followup", "qualified"].includes(p.sales_stage))

  return [
    { id: "prospects-hot", category: "Acquisizione", label: "Prospect caldi", description: "Lead score ≥ 60, ancora aperti", count: hotProspects.length, accountIds: [], prospectCount: hotProspects.length },
    { id: "prospects-followup", category: "Acquisizione", label: "Follow-up scaduti", description: "Prospect con prossima azione già dovuta", count: dueProspects.length, accountIds: [], prospectCount: dueProspects.length },
    { id: "prospects-engaged", category: "Acquisizione", label: "Prospect ingaggiati", description: "Contatto avviato, follow-up o qualificazione", count: engaged.length, accountIds: [], prospectCount: engaged.length },
    segment("customers-all", "Clienti", "Clienti suite", "Account cliente attivi nel registro 4BID", customers),
    segment("customers-new", "Clienti", "Nuovi clienti 30 giorni", "Account creati negli ultimi 30 giorni", newCustomers),
    segment("customers-multi", "Clienti", "Multi-prodotto", "Clienti con almeno 2 prodotti 4BID", multi),
    segment("customers-suite", "Clienti", "Suite completa", "HotelAccelerator + Santaddeo + HotelProfitAI + ManuBot", complete),
    segment("xsell-ha", "Cross-sell", "Alta probabilità HotelAccelerator", "Già nella suite ma senza HotelAccelerator", cross("hotelaccelerator", 55)),
    segment("xsell-snt", "Cross-sell", "Alta probabilità Santaddeo", "Profilo hospitality compatibile con RMS", cross("santaddeo", 55)),
    segment("xsell-hpa", "Cross-sell", "Alta probabilità HotelProfitAI", "Potenziale controllo di gestione", cross("hotelprofitai", 50)),
    segment("xsell-mb", "Cross-sell", "Alta probabilità ManuBot", "Strutture con complessità manutentiva potenziale", cross("manubot", 55)),
    segment("health-risk", "Customer Health", "Clienti a rischio", "Health risk/critical o lifecycle at-risk", risk),
    segment("health-churn-high", "Customer Health", "Rischio churn elevato", "Churn risk automatico ≥ 60", highChurnRisk),
    segment("health-snt-low-usage", "Customer Health", "Santaddeo poco utilizzato", "RMS attivo con usage score sotto 30", santaddeoLowUsage),
    segment("health-hpa-onboarding", "Customer Health", "HotelProfitAI da sbloccare", "Onboarding o integrazione HotelProfitAI incompleta", hotelProfitOnboardingBlocked),
    segment("health-mb-idle", "Customer Health", "ManuBot inattivo", "ManuBot configurato ma senza attività significativa", manuBotIdle),
    segment("health-stale", "Customer Health", "Prodotto inattivo da 14+ giorni", "Almeno un prodotto attivo senza attività recente", staleProducts),
    segment("renewal-30", "Rinnovi", "Rinnovi entro 30 giorni", "Scadenze prodotto/account nei prossimi 30 giorni", renewal30),
    segment("renewal-payment-risk", "Rinnovi", "Pagamenti da recuperare", "Almeno un prodotto in stato past due", paymentRisk),
  ]
}
