import "server-only"

const APOLLO_BASE_URL = "https://api.apollo.io/api/v1"
const REQUEST_TIMEOUT_MS = 15_000

export class ApolloConfigurationError extends Error {
  constructor() {
    super("Apollo non è configurato per HotelAccelerator. Imposta APOLLO_API_KEY nelle variabili server.")
    this.name = "ApolloConfigurationError"
  }
}

export class ApolloRequestError extends Error {
  status: number
  retryAfter: string | null

  constructor(message: string, status: number, retryAfter: string | null = null) {
    super(message)
    this.name = "ApolloRequestError"
    this.status = status
    this.retryAfter = retryAfter
  }
}

function apiKey() {
  const value = process.env.APOLLO_API_KEY?.trim()
  if (!value) throw new ApolloConfigurationError()
  return value
}

async function apolloPost(path: string, body: Record<string, unknown>) {
  const response = await fetch(`${APOLLO_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "x-api-key": apiKey(),
    },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })

  const payload = await response.json().catch(() => null)
  if (!response.ok) {
    const providerMessage =
      payload && typeof payload === "object" && "error" in payload ? String(payload.error) : null
    const safeMessage =
      response.status === 401 || response.status === 403
        ? "Apollo ha rifiutato la credenziale o il piano non abilita questa API."
        : response.status === 429
          ? "Limite Apollo raggiunto. Riprova più tardi."
          : providerMessage || "Apollo non ha completato la richiesta."
    throw new ApolloRequestError(safeMessage, response.status, response.headers.get("retry-after"))
  }
  return payload
}

export type ApolloPerson = {
  id: string
  firstName: string | null
  lastName: string | null
  lastNameObfuscated: boolean
  fullName: string
  title: string | null
  seniority: string | null
  linkedinUrl: string | null
  city: string | null
  region: string | null
  country: string | null
  organizationName: string | null
  organizationDomain: string | null
  email: string | null
  emailStatus: string | null
}

export type ApolloCreditUsageItem = {
  limit: number
  consumed: number
  leftOver: number
}

export type ApolloCreditUsageStats = {
  creditTypes: Record<string, ApolloCreditUsageItem>
  cycleStart: string | null
  cycleEnd: string | null
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function numberOrZero(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function organizationKeywordTags(value: string) {
  const seen = new Set<string>()
  return value
    .split(/[,;\n]+/)
    .map((item) => item.trim())
    .filter((item) => {
      if (!item) return false
      const normalized = item.toLocaleLowerCase("en")
      if (seen.has(normalized)) return false
      seen.add(normalized)
      return true
    })
    .slice(0, 12)
}

function normalizePerson(value: unknown): ApolloPerson | null {
  if (!value || typeof value !== "object") return null
  const row = value as Record<string, unknown>
  const id = text(row.id)
  if (!id) return null
  const organization =
    row.organization && typeof row.organization === "object"
      ? (row.organization as Record<string, unknown>)
      : {}
  const firstName = text(row.first_name)
  const clearLastName = text(row.last_name)
  const obfuscatedLastName = text(row.last_name_obfuscated)
  const lastName = clearLastName || obfuscatedLastName
  return {
    id,
    firstName,
    lastName,
    lastNameObfuscated: !clearLastName && Boolean(obfuscatedLastName),
    fullName: text(row.name) || [firstName, lastName].filter(Boolean).join(" ") || "Profilo Scout",
    title: text(row.title),
    seniority: text(row.seniority),
    linkedinUrl: text(row.linkedin_url),
    city: text(row.city),
    region: text(row.state),
    country: text(row.country),
    organizationName: text(organization.name) || text(row.organization_name),
    organizationDomain: text(organization.primary_domain) || text(organization.website_url),
    email: text(row.email),
    emailStatus: text(row.email_status),
  }
}

export async function searchApolloPeople(input: {
  keywords: string
  titles: string[]
  seniorities: string[]
  organizationLocations: string[]
  page: number
  perPage: number
}) {
  const keywordTags = organizationKeywordTags(input.keywords)
  const payload = await apolloPost("/mixed_people/api_search", {
    q_organization_keyword_tags: keywordTags.length ? keywordTags : undefined,
    person_titles: input.titles.length ? input.titles : undefined,
    person_seniorities: input.seniorities.length ? input.seniorities : undefined,
    organization_locations: input.organizationLocations.length ? input.organizationLocations : undefined,
    page: input.page,
    per_page: input.perPage,
  })
  const root = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {}
  const people = Array.isArray(root.people) ? root.people.map(normalizePerson).filter(Boolean) as ApolloPerson[] : []
  const pagination =
    root.pagination && typeof root.pagination === "object"
      ? (root.pagination as Record<string, unknown>)
      : {}
  return {
    people,
    page: Number(pagination.page ?? root.page ?? input.page),
    perPage: Number(pagination.per_page ?? root.per_page ?? input.perPage),
    totalEntries: Number(pagination.total_entries ?? root.total_entries ?? people.length),
    totalPages: Number(pagination.total_pages ?? root.total_pages ?? 1),
  }
}

export async function enrichApolloPerson(apolloPersonId: string) {
  const payload = await apolloPost("/people/match", {
    id: apolloPersonId,
    reveal_personal_emails: false,
    reveal_phone_number: false,
  })
  const root = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {}
  return normalizePerson(root.person)
}

/**
 * Endpoint gratuito Apollo per monitorare il consumo reale del piano.
 * Solo backend/superadmin: non serializzare questi dati verso i tenant.
 */
export async function getApolloCreditUsageStats(): Promise<ApolloCreditUsageStats> {
  const payload = await apolloPost("/usage_stats/credit_usage_stats", {})
  const root = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {}
  const usage =
    root.credit_usage_stats && typeof root.credit_usage_stats === "object"
      ? (root.credit_usage_stats as Record<string, unknown>)
      : root
  const cycle =
    root.current_credit_cycle && typeof root.current_credit_cycle === "object"
      ? (root.current_credit_cycle as Record<string, unknown>)
      : usage.current_credit_cycle && typeof usage.current_credit_cycle === "object"
        ? (usage.current_credit_cycle as Record<string, unknown>)
        : {}

  const creditTypes: Record<string, ApolloCreditUsageItem> = {}
  for (const [key, value] of Object.entries(usage)) {
    if (key === "current_credit_cycle" || !value || typeof value !== "object") continue
    const row = value as Record<string, unknown>
    if (!("limit" in row) && !("consumed" in row) && !("left_over" in row)) continue
    creditTypes[key] = {
      limit: numberOrZero(row.limit),
      consumed: numberOrZero(row.consumed),
      leftOver: numberOrZero(row.left_over),
    }
  }

  return {
    creditTypes,
    cycleStart: text(cycle.start_date),
    cycleEnd: text(cycle.end_date),
  }
}
