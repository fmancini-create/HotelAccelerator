import "server-only"

import {
  aggregateOpenAICostPages,
  buildOpenAICostsUrl,
  summarizeOpenAICosts,
  type OpenAICostScope,
  type OpenAICostsPage,
} from "@/lib/integrations/openai/costs-utils"

const REQUEST_TIMEOUT_MS = 12_000
const MAX_PAGES = 5

export class OpenAICostConfigurationError extends Error {
  constructor() {
    super("Costi OpenAI non configurati: manca OPENAI_ADMIN_KEY")
    this.name = "OpenAICostConfigurationError"
  }
}

export class OpenAICostRequestError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = "OpenAICostRequestError"
    this.status = status
  }
}

function adminKey() {
  const value = process.env.OPENAI_ADMIN_KEY?.trim()
  if (!value) throw new OpenAICostConfigurationError()
  return value
}

function configuredScope(): OpenAICostScope {
  const apiKeyId = process.env.OPENAI_VOICE_API_KEY_ID?.trim()
  const projectId = process.env.OPENAI_VOICE_PROJECT_ID?.trim()

  if (apiKeyId) {
    return {
      kind: "api_key",
      label: "OpenAI Voice · API key dedicata",
      apiKeyId,
      projectId: projectId || undefined,
    }
  }

  if (projectId) {
    return {
      kind: "project",
      label: "OpenAI Voice · progetto dedicato",
      projectId,
    }
  }

  return {
    kind: "organization",
    label: "Intera organizzazione OpenAI",
  }
}

function publicScope(scope: OpenAICostScope) {
  return {
    kind: scope.kind,
    label: scope.label,
    isVoiceExact: scope.kind !== "organization",
  }
}

function scopeFilters(scope: OpenAICostScope) {
  if (scope.kind === "api_key") {
    return {
      apiKeyIds: [scope.apiKeyId],
      projectIds: scope.projectId ? [scope.projectId] : [],
    }
  }
  if (scope.kind === "project") {
    return { apiKeyIds: [], projectIds: [scope.projectId] }
  }
  return { apiKeyIds: [], projectIds: [] }
}

function safeProviderMessage(status: number) {
  if (status === 401 || status === 403) {
    return "OpenAI ha rifiutato la chiave amministrativa o i suoi permessi."
  }
  if (status === 429) return "OpenAI ha temporaneamente limitato la lettura dei costi."
  return `OpenAI non ha restituito i costi (HTTP ${status}).`
}

async function fetchCostsPage(input: {
  startTime: number
  endTime: number
  limit: number
  page?: string | null
  scope: OpenAICostScope
}): Promise<OpenAICostsPage> {
  const filters = scopeFilters(input.scope)
  const url = buildOpenAICostsUrl({
    startTime: input.startTime,
    endTime: input.endTime,
    limit: input.limit,
    page: input.page,
    projectIds: filters.projectIds,
    apiKeyIds: filters.apiKeyIds,
  })

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${adminKey()}`,
      Accept: "application/json",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })

  if (!response.ok) {
    throw new OpenAICostRequestError(safeProviderMessage(response.status), response.status)
  }

  const payload = (await response.json().catch(() => null)) as OpenAICostsPage | null
  if (!payload || payload.object !== "page" || !Array.isArray(payload.data)) {
    throw new OpenAICostRequestError("OpenAI ha restituito una risposta costi non valida.", 502)
  }
  return payload
}

export async function getOpenAICostSummary(days = 90) {
  const normalizedDays = Math.max(1, Math.min(180, Math.floor(days)))
  const now = new Date()
  const endTime = Math.floor(now.getTime() / 1000) + 1
  const startTime = endTime - normalizedDays * 24 * 60 * 60
  const scope = configuredScope()
  const pages: OpenAICostsPage[] = []
  let page: string | null = null

  for (let index = 0; index < MAX_PAGES; index += 1) {
    const payload = await fetchCostsPage({
      startTime,
      endTime,
      limit: normalizedDays,
      page,
      scope,
    })
    pages.push(payload)

    if (!payload.has_more || !payload.next_page) break
    page = payload.next_page
  }

  const summary = summarizeOpenAICosts({
    aggregation: aggregateOpenAICostPages(pages),
    now,
  })

  return {
    ...summary,
    scope: publicScope(scope),
    periodDays: normalizedDays,
    fetchedAt: now.toISOString(),
  }
}
