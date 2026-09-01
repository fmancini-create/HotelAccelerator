export type OpenAICostScope =
  | { kind: "organization"; label: string }
  | { kind: "project"; label: string; projectId: string }
  | { kind: "api_key"; label: string; apiKeyId: string; projectId?: string }

export type OpenAICostResult = {
  object?: string
  amount?: {
    value?: number
    currency?: string
  } | null
  line_item?: string | null
  project_id?: string | null
  api_key_id?: string | null
  quantity?: number | null
}

export type OpenAICostBucket = {
  object?: string
  start_time?: number
  end_time?: number
  results?: OpenAICostResult[]
}

export type OpenAICostsPage = {
  object?: string
  data?: OpenAICostBucket[]
  has_more?: boolean
  next_page?: string | null
}

export type OpenAICostDaily = {
  date: string
  startTime: number
  endTime: number
  amount: number
}

export type OpenAICostLineItem = {
  name: string
  amount: number
}

export type OpenAICostAggregation = {
  currency: string
  total: number
  daily: OpenAICostDaily[]
  lineItems: OpenAICostLineItem[]
}

function addArrayParam(params: URLSearchParams, key: string, values: string[]) {
  for (const value of values) {
    const trimmed = value.trim()
    if (trimmed) params.append(key, trimmed)
  }
}

export function buildOpenAICostsUrl(input: {
  startTime: number
  endTime?: number
  limit: number
  page?: string | null
  projectIds?: string[]
  apiKeyIds?: string[]
}): string {
  const url = new URL("https://api.openai.com/v1/organization/costs")
  url.searchParams.set("start_time", String(Math.floor(input.startTime)))
  if (typeof input.endTime === "number") {
    url.searchParams.set("end_time", String(Math.floor(input.endTime)))
  }
  url.searchParams.set("bucket_width", "1d")
  url.searchParams.set("limit", String(Math.max(1, Math.min(180, Math.floor(input.limit)))))
  url.searchParams.append("group_by", "line_item")
  addArrayParam(url.searchParams, "project_ids", input.projectIds ?? [])
  addArrayParam(url.searchParams, "api_key_ids", input.apiKeyIds ?? [])
  if (input.page?.trim()) url.searchParams.set("page", input.page.trim())
  return url.toString()
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

export function aggregateOpenAICostPages(pages: OpenAICostsPage[]): OpenAICostAggregation {
  const daily = new Map<number, OpenAICostDaily>()
  const lineItems = new Map<string, number>()
  const currencies = new Set<string>()

  for (const page of pages) {
    for (const bucket of page.data ?? []) {
      if (typeof bucket.start_time !== "number" || typeof bucket.end_time !== "number") continue
      let bucketAmount = 0

      for (const result of bucket.results ?? []) {
        if (result.object && result.object !== "organization.costs.result") continue
        const amount = finiteNumber(result.amount?.value)
        if (amount === null) continue

        bucketAmount += amount
        const currency = result.amount?.currency?.trim().toLowerCase()
        if (currency) currencies.add(currency)

        const lineItem = result.line_item?.trim() || "Altro OpenAI"
        lineItems.set(lineItem, (lineItems.get(lineItem) ?? 0) + amount)
      }

      const existing = daily.get(bucket.start_time)
      if (existing) {
        existing.amount += bucketAmount
        existing.endTime = Math.max(existing.endTime, bucket.end_time)
      } else {
        daily.set(bucket.start_time, {
          date: new Date(bucket.start_time * 1000).toISOString().slice(0, 10),
          startTime: bucket.start_time,
          endTime: bucket.end_time,
          amount: bucketAmount,
        })
      }
    }
  }

  if (currencies.size > 1) {
    throw new Error("OpenAI ha restituito costi in più valute nello stesso intervallo")
  }

  const orderedDaily = [...daily.values()].sort((a, b) => a.startTime - b.startTime)
  const orderedLineItems = [...lineItems.entries()]
    .map(([name, amount]) => ({ name, amount }))
    .sort((a, b) => b.amount - a.amount)

  return {
    currency: [...currencies][0] ?? "usd",
    total: orderedDaily.reduce((sum, item) => sum + item.amount, 0),
    daily: orderedDaily,
    lineItems: orderedLineItems,
  }
}

export function summarizeOpenAICosts(input: {
  aggregation: OpenAICostAggregation
  now?: Date
}) {
  const now = input.now ?? new Date()
  const todayStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) / 1000
  const monthStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) / 1000
  const last30Start = todayStart - 29 * 24 * 60 * 60

  const sumFrom = (start: number) =>
    input.aggregation.daily
      .filter((item) => item.startTime >= start)
      .reduce((sum, item) => sum + item.amount, 0)

  return {
    currency: input.aggregation.currency,
    total: input.aggregation.total,
    today: sumFrom(todayStart),
    monthToDate: sumFrom(monthStart),
    last30Days: sumFrom(last30Start),
    daily: input.aggregation.daily,
    lineItems: input.aggregation.lineItems,
  }
}
