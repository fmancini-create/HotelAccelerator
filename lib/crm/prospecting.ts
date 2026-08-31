export type ProspectLike = {
  job_title?: string | null
  seniority?: string | null
  linkedin_url?: string | null
  email?: string | null
  email_status?: string | null
  organization_name?: string | null
  organization_domain?: string | null
  city?: string | null
  country?: string | null
}

export type ProspectAction =
  | "linkedin_invite"
  | "linkedin_check"
  | "linkedin_message"
  | "email_intro"
  | "email_followup"
  | "call"
  | "review"

const DECISION_TITLES = [
  "owner",
  "proprietario",
  "founder",
  "ceo",
  "general manager",
  "hotel manager",
  "direttore",
  "director",
  "revenue manager",
  "commercial",
  "sales manager",
]

export function computeProspectScore(prospect: ProspectLike) {
  const title = `${prospect.job_title ?? ""} ${prospect.seniority ?? ""}`.toLowerCase()
  let score = 20
  const signals: string[] = []

  if (DECISION_TITLES.some((needle) => title.includes(needle))) {
    score += 30
    signals.push("decision maker")
  }
  if (prospect.linkedin_url) {
    score += 15
    signals.push("profilo LinkedIn")
  }
  if (prospect.email) {
    score += 15
    signals.push("email disponibile")
  }
  if ((prospect.email_status ?? "").toLowerCase().includes("verified")) {
    score += 5
    signals.push("email verificata")
  }
  if (prospect.organization_name) {
    score += 8
    signals.push("hotel identificato")
  }
  if (prospect.organization_domain) {
    score += 5
    signals.push("dominio aziendale")
  }
  if (prospect.city || prospect.country) score += 2

  return { score: Math.max(0, Math.min(100, score)), signals }
}

export function firstProspectAction(prospect: ProspectLike): ProspectAction {
  if (prospect.linkedin_url) return "linkedin_invite"
  if (prospect.email) return "email_intro"
  return "review"
}

export function actionChannel(action: ProspectAction) {
  if (action.startsWith("linkedin_")) return "linkedin" as const
  if (action.startsWith("email_")) return "email" as const
  if (action === "call") return "phone" as const
  return "system" as const
}

export function actionLabel(action: ProspectAction) {
  const labels: Record<ProspectAction, string> = {
    linkedin_invite: "Invia richiesta di collegamento LinkedIn",
    linkedin_check: "Controlla esito LinkedIn",
    linkedin_message: "Invia messaggio LinkedIn",
    email_intro: "Invia prima email",
    email_followup: "Invia follow-up email",
    call: "Chiama il prospect",
    review: "Completa i dati del prospect",
  }
  return labels[action]
}

export function defaultLinkedInDraft(action: ProspectAction, name: string, company?: string | null) {
  const firstName = name.trim().split(/\s+/)[0] || name
  const hotel = company ? ` di ${company}` : ""
  if (action === "linkedin_invite") {
    return `Ciao ${firstName}, lavoro anch'io nel mondo alberghiero e sto seguendo progetti sull'automazione commerciale degli hotel. Mi farebbe piacere aggiungerti alla mia rete.`
  }
  return `Grazie per il collegamento, ${firstName}. Ti faccio una domanda curiosa: sai come siamo riusciti a individuare proprio te come referente${hotel}? È uno dei casi d'uso del nostro motore di vendita intelligente per hotel.`
}

export function defaultEmailDraft(name: string, company?: string | null, followup = false) {
  const firstName = name.trim().split(/\s+/)[0] || name
  const hotel = company || "la tua struttura"
  if (followup) {
    return {
      subject: `Un ultimo spunto per ${hotel}`,
      body: `Ciao ${firstName},\n\ntorno sul messaggio precedente con una cosa molto concreta: HotelAccelerator unisce CRM, omnichannel e automazione commerciale in un unico flusso, così il team vede chi contattare, perché e con quale prossima azione.\n\nSe vuoi, ti mostro il sistema su un caso reale in 15 minuti.\n\nFilippo`,
    }
  }
  return {
    subject: `Una domanda su ${hotel}`,
    body: `Ciao ${firstName},\n\nti contatto perché stiamo usando HotelAccelerator per trasformare il CRM degli hotel in un motore operativo: individua i prospect, li qualifica e coordina LinkedIn, email e telefonate senza perdere i follow-up.\n\nLa cosa curiosa è che lo stiamo usando noi stessi per trovare e contattare strutture come ${hotel}.\n\nSe ti va, ti faccio vedere come funziona in 15 minuti.\n\nFilippo`,
  }
}

export function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 86_400_000)
}
