export type ScoutSearchInput = {
  keywords: string
  titles: string[]
  seniorities: string[]
  organizationLocations: string[]
  page: number
  perPage: number
}

export type ScoutInterpretedSearch = {
  organizationKeywords: string[]
  titles: string[]
  seniorities: string[]
  organizationLocations: string[]
}

type SemanticCluster = {
  match: string[]
  expand: string[]
}

const INDUSTRY_CLUSTERS: SemanticCluster[] = [
  {
    match: [
      "settore nautico",
      "nautico",
      "nautica",
      "settore navale",
      "navale",
      "cantieristica navale",
      "marittimo",
      "marittima",
      "maritime",
      "marine",
      "nautical",
      "yacht",
      "yachting",
      "shipyard",
      "shipbuilding",
    ],
    expand: ["maritime", "marine", "nautical", "yachting", "shipbuilding"],
  },
  {
    match: ["alberghiero", "alberghi", "hotel", "hospitality", "ricettivo", "strutture ricettive"],
    expand: ["hospitality", "hotel", "lodging", "resort"],
  },
  {
    match: ["turismo", "turistico", "travel", "tour operator", "agenzie di viaggio", "agenzia viaggi"],
    expand: ["travel", "tourism", "tour operator", "travel agency"],
  },
  {
    match: ["ristorazione", "ristorante", "ristoranti", "food beverage", "food and beverage", "f&b"],
    expand: ["restaurants", "food & beverages", "food service", "hospitality"],
  },
  {
    match: ["spa", "benessere", "wellness", "centro benessere"],
    expand: ["wellness", "health & wellness", "spa"],
  },
  {
    match: ["immobiliare", "real estate"],
    expand: ["real estate", "property management"],
  },
  {
    match: ["automotive", "auto", "automobili", "concessionari", "concessionarie"],
    expand: ["automotive", "motor vehicle manufacturing", "car dealerships"],
  },
  {
    match: ["logistica", "trasporti", "transport", "logistics"],
    expand: ["logistics & supply chain", "transportation", "freight"],
  },
  {
    match: ["edilizia", "costruzioni", "construction"],
    expand: ["construction", "building materials", "civil engineering"],
  },
  {
    match: ["sanita", "sanitario", "healthcare", "medicale"],
    expand: ["hospital & health care", "medical practice", "healthcare"],
  },
  {
    match: ["software", "saas", "tecnologia", "tech", "information technology"],
    expand: ["software", "SaaS", "information technology & services"],
  },
  {
    match: ["industria", "industriale", "manifattura", "manufacturing"],
    expand: ["manufacturing", "industrial automation", "machinery"],
  },
]

const TITLE_CLUSTERS: SemanticCluster[] = [
  {
    match: [
      "responsabile della sicurezza",
      "responsabile sicurezza",
      "sicurezza sul lavoro",
      "salute e sicurezza",
      "hse manager",
      "ehs manager",
      "hsse manager",
      "qhse manager",
      "rspp",
      "health and safety manager",
      "safety manager",
      "safety officer",
    ],
    expand: [
      "safety manager",
      "HSE manager",
      "EHS manager",
      "HSSE manager",
      "QHSE manager",
      "health and safety manager",
      "safety officer",
      "RSPP",
    ],
  },
  {
    match: ["sicurezza informatica", "cybersicurezza", "cyber security", "cybersecurity"],
    expand: ["cyber security manager", "cybersecurity manager", "information security manager", "CISO"],
  },
  {
    match: ["direttore generale", "general manager", "direttore", "direzione generale"],
    expand: ["general manager", "managing director", "director", "CEO"],
  },
  {
    match: ["titolare", "proprietario", "owner", "founder", "fondatore"],
    expand: ["owner", "founder", "CEO", "managing director"],
  },
  {
    match: ["responsabile acquisti", "ufficio acquisti", "procurement", "buyer", "purchasing"],
    expand: ["procurement manager", "purchasing manager", "head of procurement", "buyer"],
  },
  {
    match: ["responsabile commerciale", "direttore commerciale", "sales manager", "vendite"],
    expand: ["sales manager", "sales director", "commercial director", "head of sales"],
  },
  {
    match: ["responsabile marketing", "direttore marketing", "marketing manager"],
    expand: ["marketing manager", "marketing director", "head of marketing", "CMO"],
  },
  {
    match: ["responsabile risorse umane", "risorse umane", "hr manager", "personale"],
    expand: ["HR manager", "human resources manager", "HR director", "head of human resources"],
  },
  {
    match: ["responsabile manutenzione", "manutenzione", "facility manager", "facility"],
    expand: ["maintenance manager", "facility manager", "facilities manager", "technical manager"],
  },
  {
    match: ["responsabile it", "direttore it", "it manager", "information technology"],
    expand: ["IT manager", "information technology manager", "IT director", "CIO"],
  },
  {
    match: ["responsabile amministrativo", "direttore finanziario", "finance manager", "cfo", "amministrazione"],
    expand: ["finance manager", "finance director", "CFO", "administration manager"],
  },
  {
    match: ["revenue manager", "responsabile revenue", "revenue"],
    expand: ["revenue manager", "director of revenue", "revenue management director"],
  },
  {
    match: ["operations manager", "responsabile operativo", "direttore operativo", "operations"],
    expand: ["operations manager", "operations director", "COO", "head of operations"],
  },
]

const LOCATION_ALIASES = new Map<string, string>([
  ["italia", "Italy"],
  ["italy", "Italy"],
  ["regno unito", "United Kingdom"],
  ["uk", "United Kingdom"],
  ["stati uniti", "United States"],
  ["usa", "United States"],
  ["united states", "United States"],
])

function normalizeForMatch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("it")
    .replace(/[^a-z0-9&+]+/g, " ")
    .trim()
    .replace(/\s+/g, " ")
}

function splitTerms(value: string) {
  return value
    .split(/[,;\n]+/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function containsPhrase(value: string, phrase: string) {
  return value === phrase || ` ${value} `.includes(` ${phrase} `)
}

function dedupe(values: string[], max: number) {
  const seen = new Set<string>()
  const result: string[] = []
  for (const value of values) {
    const trimmed = value.trim()
    if (!trimmed) continue
    const key = normalizeForMatch(trimmed)
    if (!key || seen.has(key)) continue
    seen.add(key)
    result.push(trimmed)
    if (result.length >= max) break
  }
  return result
}

function expandTerms(values: string[], clusters: SemanticCluster[], max: number) {
  const expanded: string[] = []
  for (const raw of values) {
    const normalized = normalizeForMatch(raw)
    const cluster = clusters.find((candidate) =>
      candidate.match.some((term) => containsPhrase(normalized, normalizeForMatch(term))),
    )
    if (cluster) expanded.push(...cluster.expand)
    else expanded.push(raw)
  }
  return dedupe(expanded, max)
}

function normalizeLocations(values: string[]) {
  return dedupe(
    values.map((value) => LOCATION_ALIASES.get(normalizeForMatch(value)) ?? value.trim()),
    8,
  )
}

export function interpretScoutSearch(input: ScoutSearchInput) {
  const titles = expandTerms(input.titles, TITLE_CLUSTERS, 12)
  const interpreted: ScoutInterpretedSearch = {
    organizationKeywords: expandTerms(splitTerms(input.keywords), INDUSTRY_CLUSTERS, 12),
    titles,
    // Explicit roles are more precise than Apollo's seniority taxonomy. Keeping the hidden
    // default seniority filter here caused valid roles such as RSPP/HSE to disappear entirely.
    seniorities: titles.length ? [] : dedupe(input.seniorities, 10),
    organizationLocations: normalizeLocations(input.organizationLocations),
  }

  return {
    providerInput: {
      ...input,
      keywords: interpreted.organizationKeywords.join(","),
      titles: interpreted.titles,
      seniorities: interpreted.seniorities,
      organizationLocations: interpreted.organizationLocations,
    },
    interpreted,
  }
}
