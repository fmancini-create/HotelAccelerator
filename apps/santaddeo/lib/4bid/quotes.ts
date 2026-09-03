export type FourBidQuote = {
  id: string
  quote_number: string | null
  client_name: string | null
  client_company: string | null
  client_email: string | null
  title: string | null
  description: string | null
  line_items: unknown[]
  total_amount: number | null
  deposit_amount: number | null
  vat_included: boolean
  currency: string
  payment_terms: string | null
  presentation_mode: "classic" | "virtual"
  requested_fields: unknown[]
  status: string
  payment_status: string | null
  accepted_at: string | null
  paid_at: string | null
  sent_at: string | null
  expires_at: string | null
  source_record_id: string
  source_parent_id: string
  public_url: string | null
  updated_at: string
}

export type FourBidQuoteCallMessage = {
  role: "user" | "assistant"
  content: string
  createdAt?: string
}

export type FourBidQuoteCallIntelligence = {
  engagement_score: number | null
  temperature: string | null
  intent: string | null
  primary_product: string | null
  interested_products: string[] | null
  objections: string[] | null
  positive_signals: string[] | null
  next_best_action: string | null
  rationale: string | null
  last_user_message: string | null
  updated_at: string | null
}

export type FourBidQuoteCall = {
  id: string
  quote_id: string
  quote_number: string | null
  client_name: string | null
  client_company: string | null
  provider_conversation_id: string
  status: string
  started_at: string | null
  ended_at: string | null
  duration_seconds: number | null
  transcript: FourBidQuoteCallMessage[]
  intelligence: FourBidQuoteCallIntelligence | null
  last_event_at: string | null
}

type Json = Record<string, any>

function config() {
  const baseUrl = (process.env.FOURBID_QUOTES_API_URL || "https://4bid.it/api/integrations/hotelaccelerator/quotes").replace(/\/$/, "")
  const callsUrl = (
    process.env.FOURBID_QUOTE_CALLS_API_URL ||
    baseUrl.replace(/\/quotes$/, "/quote-calls")
  ).replace(/\/$/, "")
  const apiKey = process.env.FOURBID_QUOTES_API_KEY?.trim()
  if (!apiKey) throw new Error("FOURBID_QUOTES_API_KEY non configurata")
  return { baseUrl, callsUrl, apiKey }
}

async function requestAt<T>(baseUrl: string, path: string, init: RequestInit = {}): Promise<T> {
  const { apiKey } = config()
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      ...(init.headers || {}),
    },
    cache: "no-store",
  })
  const payload = await response.json().catch(() => ({})) as Json
  if (!response.ok) throw new Error(payload.error || `4BID quote API error ${response.status}`)
  return payload as T
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { baseUrl } = config()
  return requestAt<T>(baseUrl, path, init)
}

async function requestCalls<T>(path: string): Promise<T> {
  const { callsUrl } = config()
  return requestAt<T>(callsUrl, path)
}

export async function listFourBidQuotesForDeal(dealId: string): Promise<FourBidQuote[]> {
  const result = await request<{ quotes: FourBidQuote[] }>(`?source_parent_id=${encodeURIComponent(dealId)}`)
  return result.quotes || []
}

export async function listFourBidQuoteCallsForDeal(dealId: string): Promise<FourBidQuoteCall[]> {
  const result = await requestCalls<{ calls: FourBidQuoteCall[] }>(`?source_parent_id=${encodeURIComponent(dealId)}`)
  return result.calls || []
}

export async function listFourBidQuoteCallsForQuote(quoteId: string): Promise<FourBidQuoteCall[]> {
  const result = await requestCalls<{ calls: FourBidQuoteCall[] }>(`?quote_id=${encodeURIComponent(quoteId)}`)
  return result.calls || []
}

export async function createFourBidQuote(payload: Json): Promise<FourBidQuote> {
  const result = await request<{ quote: FourBidQuote }>("", {
    method: "POST",
    body: JSON.stringify(payload),
  })
  return result.quote
}

export async function updateFourBidQuote(quoteId: string, payload: Json): Promise<FourBidQuote> {
  const result = await request<{ quote: FourBidQuote }>("", {
    method: "PATCH",
    body: JSON.stringify({ ...payload, quote_id: quoteId }),
  })
  return result.quote
}

export async function sendFourBidQuote(quoteId: string, payload: { cc?: string[]; bcc?: string[] } = {}) {
  return request<{
    success: true
    quote_id: string
    quote_number: string | null
    status: string
    sent_at: string | null
    public_url: string
    copies: { sent: string[]; failed: string[] }
  }>("/send", {
    method: "POST",
    body: JSON.stringify({ quote_id: quoteId, ...payload }),
  })
}
