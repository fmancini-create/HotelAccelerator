import "server-only"
import { interpretScoutSearch } from "@/lib/crm/scout-search"

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

export type ApolloCreditBucket = {
  limit: number
  consumed: number
  leftOver: number
}

export type ApolloCreditUsageStats = {
  credits: Record<string, ApolloCreditBucket>
  currentCycle: {
    startDate: string | null
    endDate: string | null
  }
  fetchedAt: string
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null
}

function finiteNumber(value: unknown, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? number : fallback
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

function normalizeCreditBucket(value: unknown): ApolloCreditBucket {
  const row = value && typeof value === "object" ? value as Record<string, unknown> : {}
  return {
    limit: finiteNumber(row.limit),
    consumed: finiteNumber(row.consumed),
    leftOver: finiteNumber(row.left_over),
  }
}

/**
 * Saldo crediti ufficiale del team Apollo. L'endpoint non consuma crediti e
 * aggiorna i contatori entro pochi secondi dalle operazioni fatturabili.
 */
export async function getApolloCreditUsageStats(): Promise<ApolloCreditUsageStats> {
  const payload = await apolloPost("/usage_stats/credit_usage_stats", {})
  const root = payload && typeof payload === "object" ? payload as Record<string, unknown> : {}
  const rawStats = root.credit_usage_stats && typeof root.credit_usage_stats === "object"
    ? root.credit_usage_stats as Record<string, unknown>
    : {}
  const rawCycle = root.current_credit_cycle && typeof root.current_credit_cycle === "object"
    ? root.current_credit_cycle as Record<string, unknown>
    : {}

  return {
    credits: Object.fromEntries(Object.entries(rawStats).map(([key, value]) => [key, normalizeCreditBucket(value)])),
    currentCycle: {
      startDate: text(rawCycle.start_date),
      endDate: text(rawCycle.end_date),
    },
    fetchedAt: new Date().toISOString(),
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
  const { providerInput } = interpretScoutSearch(input)
  const keywordTags = organizationKeywordTags(providerInput.keywords)
  const payload = await apolloPost("/mixed_people/api_search", {
    q_organization_keyword_tags: keywordTags.length ? keywordTags : undefined,
    person_titles: providerInput.titles.length ? providerInput.titles : undefined,
    person_seniorities: providerInput.seniorities.length ? providerInput.seniorities : undefined,
    organization_locations: providerInput.organizationLocations.length ? providerInput.organizationLocations : undefined,
    page: providerInput.page,
    per_page: providerInput.perPage,
  })
  const root = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {}
  const people = Array.isArray(root.people) ? root.people.map(normalizePerson).filter(Boolean) as ApolloPerson[] : []
  const pagination =
    root.pagination && typeof root.pagination === "object"
      ? (root.pagination as Record<string, unknown>)
      : {}
  return {
    people,
    page: Number(pagination.page ?? root.page ?? providerInput.page),
    perPage: Number(pagination.per_page ?? root.per_page ?? providerInput.perPage),
    totalEntries: Number(pagination.total_entries ?? root.total_entries ?? people.length),
    totalPages: Number(pagination.total_pages ?? root.total_pages ?? 1),
  }
}

/**
 * Usa bulk_match anche per il singolo profilo perche' la risposta espone
 * `credits_consumed`. In questo modo il metering non assume piu' "1 credito"
 * ma salva esattamente il consumo dichiarato dal provider, anche su piani che
 * usano crediti frazionari.
 */
export async function enrichApolloPersonWithUsage(apolloPersonId: string) {
  const payload = await apolloPost("/people/bulk_match", {
    details: [{ id: apolloPersonId }],
    reveal_personal_emails: false,
    reveal_phone_number: false,
  })
  const root = payload && typeof payload === "object" ? payload as Record<string, unknown> : {}
  const matches = Array.isArray(root.matches) ? root.matches : []
  const person = matches
    .map((value) => {
      if (value && typeof value === "object" && "person" in (value as Record<string, unknown>)) {
        return normalizePerson((value as Record<string, unknown>).person)
      }
      return normalizePerson(value)
    })
    .find(Boolean) ?? null

  return {
    person,
    creditsConsumed: finiteNumber(root.credits_consumed, person ? 1 : 0),
  }
}

/** Compatibilita' per eventuali chiamanti legacy. */
export async function enrichApolloPerson(apolloPersonId: string) {
  return (await enrichApolloPersonWithUsage(apolloPersonId)).person
}
