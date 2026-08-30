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

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null
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
  const lastName = text(row.last_name)
  return {
    id,
    firstName,
    lastName,
    fullName: text(row.name) || [firstName, lastName].filter(Boolean).join(" ") || "Profilo Apollo",
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
  const payload = await apolloPost("/mixed_people/api_search", {
    q_keywords: input.keywords || undefined,
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
    page: Number(pagination.page ?? input.page),
    perPage: Number(pagination.per_page ?? input.perPage),
    totalEntries: Number(pagination.total_entries ?? people.length),
    totalPages: Number(pagination.total_pages ?? 1),
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
