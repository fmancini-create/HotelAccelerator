export type SalesContact = {
  id: string
  name?: string | null
  email?: string | null
  phone?: string | null
  company?: string | null
  country?: string | null
  city?: string | null
  source?: string | null
  vip_level?: string | null
  lead_score?: number | null
  total_bookings?: number | null
  total_revenue_cents?: number | null
  last_booking_date?: string | null
  marketing_consent?: boolean | null
  unsubscribed?: boolean | null
  interests?: string[] | null
  email_opens_count?: number | null
  email_clicks_count?: number | null
  created_at?: string | null
}

export type SalesActionKind = "call" | "email" | "relationship" | "review"
export type SalesPriority = "alta" | "media" | "bassa"

export type SalesRecommendation = {
  contactId: string
  contactName: string
  company: string | null
  score: number
  priority: SalesPriority
  action: SalesActionKind
  actionLabel: string
  reason: string
  signals: string[]
  channel: "telefono" | "email" | "relazione" | "verifica"
  canExecute: boolean
}

const clamp = (value: number, min = 0, max = 100) => Math.min(max, Math.max(min, value))

function daysSince(value?: string | null, now = new Date()) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return Math.max(0, Math.floor((now.getTime() - date.getTime()) / 86_400_000))
}

function money(cents?: number | null) {
  return Math.max(0, Number(cents ?? 0)) / 100
}

export function scoreSalesContact(contact: SalesContact, now = new Date()) {
  let score = clamp(Number(contact.lead_score ?? 0)) * 0.45
  const signals: string[] = []

  const revenue = money(contact.total_revenue_cents)
  if (revenue >= 5000) {
    score += 18
    signals.push("cliente ad alto valore")
  } else if (revenue >= 1500) {
    score += 12
    signals.push("valore storico interessante")
  } else if (revenue > 0) {
    score += 6
    signals.push("ha già generato ricavi")
  }

  const bookings = Number(contact.total_bookings ?? 0)
  if (bookings >= 5) {
    score += 12
    signals.push("cliente ricorrente")
  } else if (bookings >= 2) {
    score += 7
    signals.push("più soggiorni registrati")
  }

  const vip = String(contact.vip_level ?? "standard").toLowerCase()
  if (vip === "platinum") {
    score += 12
    signals.push("profilo Platinum")
  } else if (vip === "gold") {
    score += 9
    signals.push("profilo Gold")
  } else if (vip === "silver") {
    score += 5
    signals.push("profilo Silver")
  }

  const clicks = Number(contact.email_clicks_count ?? 0)
  const opens = Number(contact.email_opens_count ?? 0)
  if (clicks > 0) {
    score += Math.min(10, 4 + clicks)
    signals.push("ha cliccato comunicazioni")
  } else if (opens >= 2) {
    score += Math.min(6, opens)
    signals.push("interagisce con le email")
  }

  const recency = daysSince(contact.last_booking_date, now)
  if (recency !== null && recency <= 90) {
    score += 8
    signals.push("soggiorno recente")
  } else if (recency !== null && recency <= 365) {
    score += 4
    signals.push("soggiorno nell'ultimo anno")
  } else if (recency !== null && recency > 730 && bookings > 0) {
    score -= 5
    signals.push("cliente da riattivare")
  }

  if (contact.phone) score += 3
  if (contact.email) score += 2

  if (contact.unsubscribed) {
    score -= 25
    signals.push("disiscritto dalle comunicazioni")
  } else if (contact.marketing_consent) {
    score += 6
    signals.push("consenso marketing disponibile")
  }

  return { score: Math.round(clamp(score)), signals }
}

export function recommendSalesAction(contact: SalesContact, now = new Date()): SalesRecommendation {
  const { score, signals } = scoreSalesContact(contact, now)
  const hasPhone = Boolean(String(contact.phone ?? "").trim())
  const hasEmail = Boolean(String(contact.email ?? "").trim())
  const consent = contact.marketing_consent === true && contact.unsubscribed !== true
  const recency = daysSince(contact.last_booking_date, now)
  const bookings = Number(contact.total_bookings ?? 0)
  const clicks = Number(contact.email_clicks_count ?? 0)

  let action: SalesActionKind = "review"
  let channel: SalesRecommendation["channel"] = "verifica"
  let actionLabel = "Rivedi il profilo"
  let reason = "Il profilo ha dati utili, ma non abbastanza segnali per suggerire un contatto automatico."
  let canExecute = false

  // La disiscrizione prevale sempre sul punteggio e su qualsiasi recapito disponibile.
  if (contact.unsubscribed) {
    reason = "Il contatto risulta disiscritto: non proporre comunicazioni marketing e verifica solo eventuali esigenze operative consentite."
  } else if (score >= 70 && hasPhone) {
    action = "call"
    channel = "telefono"
    actionLabel = "Chiama oggi"
    reason = "Profilo ad alta priorità con recapito telefonico disponibile: conviene un contatto umano diretto."
    canExecute = true
  } else if (score >= 55 && hasEmail && consent) {
    action = "email"
    channel = "email"
    actionLabel = "Prepara un'email personale"
    reason = "Il contatto mostra interesse e ha consenso marketing: prepara un messaggio personalizzato da approvare prima dell'invio."
    canExecute = true
  } else if (bookings > 0 && recency !== null && recency > 365 && (hasPhone || (hasEmail && consent))) {
    action = "relationship"
    channel = hasPhone ? "telefono" : "relazione"
    actionLabel = "Riattiva la relazione"
    reason = "È un cliente già acquisito che non soggiorna da tempo: vale la pena riaprire la relazione con un contatto mirato."
    canExecute = true
  } else if (clicks > 0 && hasPhone) {
    action = "call"
    channel = "telefono"
    actionLabel = "Richiama il contatto"
    reason = "Ha interagito con una comunicazione e dispone di telefono: il segnale è più forte di una semplice apertura email."
    canExecute = true
  } else if (!hasPhone && !hasEmail) {
    reason = "Manca un recapito utilizzabile: completa prima l'anagrafica."
  } else if (hasEmail && !consent) {
    reason = "È disponibile un'email, ma non un consenso marketing utilizzabile: verifica base giuridica e preferenze prima di contattarlo."
  }

  const priority: SalesPriority = score >= 70 ? "alta" : score >= 45 ? "media" : "bassa"

  return {
    contactId: contact.id,
    contactName: String(contact.name ?? "Contatto senza nome"),
    company: contact.company ?? null,
    score,
    priority,
    action,
    actionLabel,
    reason,
    signals: signals.slice(0, 5),
    channel,
    canExecute,
  }
}

export function buildSalesRecommendations(contacts: SalesContact[], now = new Date(), limit = 20) {
  return contacts
    .map((contact) => recommendSalesAction(contact, now))
    .sort((a, b) => b.score - a.score || a.contactName.localeCompare(b.contactName, "it"))
    .slice(0, limit)
}
