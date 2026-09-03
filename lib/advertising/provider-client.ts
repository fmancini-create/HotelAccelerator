import "server-only"

import { createServiceClient } from "@/lib/supabase/server"
import { decryptSecretIfNeeded, encryptSecret } from "@/lib/crypto/secrets"
import type { AdvertisingProvider } from "@/lib/advertising/types"

type JsonRecord = Record<string, unknown>

type TokenBundle = {
  accessToken: string
  refreshToken?: string | null
  expiresIn?: number | null
  refreshExpiresIn?: number | null
  scope?: string | null
  metadata?: JsonRecord
}

type RemoteAccount = {
  externalAccountId: string
  name: string
  currency: string | null
  timezone: string | null
  metadata: JsonRecord
}

type RemoteCampaign = {
  externalCampaignId: string
  name: string
  status: string
  objective: string | null
  budgetAmount: number | null
  budgetPeriod: "daily" | "lifetime" | "total" | null
  startsAt: string | null
  endsAt: string | null
  rawConfig: JsonRecord
}

type RemoteMetric = {
  externalCampaignId: string
  date: string
  spend: number
  impressions: number
  clicks: number
  conversions: number
  conversionValue: number
  cpc: number | null
  ctr: number | null
  cpm: number | null
  rawMetrics: JsonRecord
}

type AccountRow = {
  id: string
  property_id: string
  provider: AdvertisingProvider
  external_account_id: string
  name: string
  currency: string | null
  timezone: string | null
  status: string
  connection_mode: string
  metadata: JsonRecord | null
}

type CredentialRow = {
  advertising_account_id: string
  access_token_encrypted: string
  refresh_token_encrypted: string | null
  access_token_expires_at: string | null
  refresh_token_expires_at: string | null
  scopes: string | null
  metadata: JsonRecord | null
}

type CampaignRow = {
  id: string
  property_id: string
  advertising_account_id: string
  provider: AdvertisingProvider
  external_campaign_id: string
  name: string
  status: string
  objective: string | null
  origin: "imported" | "hotelaccelerator"
  management_mode: "observe" | "assist" | "autopilot"
  budget_amount: number | null
  budget_period: "daily" | "lifetime" | "total" | null
  currency: string | null
  raw_config: JsonRecord | null
}

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as JsonRecord) : {}
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" || typeof value === "number" ? String(value) : fallback
}

function numberValue(value: unknown, fallback = 0): number {
  const parsed = typeof value === "number" ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function optionalIsoDate(value: unknown): string | null {
  const text = stringValue(value)
  if (!text) return null
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(text) ? `${text}T00:00:00.000Z` : text.replace(" ", "T")
  const date = new Date(normalized)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function yyyyMmDd(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function trailing30Days(): { start: string; end: string } {
  const end = new Date()
  const start = new Date(end)
  start.setUTCDate(start.getUTCDate() - 29)
  return { start: yyyyMmDd(start), end: yyyyMmDd(end) }
}

function apiErrorMessage(body: unknown, fallback: string): string {
  const root = record(body)
  const error = record(root.error)
  return (
    stringValue(error.message) ||
    stringValue(root.message) ||
    stringValue(root.error_description) ||
    stringValue(root.error) ||
    fallback
  )
}

async function fetchJson(url: string | URL, init: RequestInit, fallbackError: string): Promise<JsonRecord> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 30_000)
  try {
    const response = await fetch(url, { ...init, signal: controller.signal, cache: "no-store" })
    const body = (await response.json().catch(() => ({}))) as unknown
    if (!response.ok) throw new Error(apiErrorMessage(body, fallbackError))
    return record(body)
  } finally {
    clearTimeout(timeout)
  }
}

function googleApiVersion(): string {
  const version = process.env.GOOGLE_ADS_API_VERSION || "v25"
  return /^v\d+$/.test(version) ? version : "v25"
}

function metaGraphVersion(): string {
  const version = process.env.META_GRAPH_VERSION || "v26.0"
  return /^v\d+\.\d+$/.test(version) ? version : "v26.0"
}

function googleHeaders(accessToken: string, loginCustomerId?: string | null): Record<string, string> {
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN
  if (!developerToken) throw new Error("GOOGLE_ADS_DEVELOPER_TOKEN non configurato")
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    "developer-token": developerToken,
    "Content-Type": "application/json",
  }
  if (loginCustomerId) headers["login-customer-id"] = loginCustomerId.replace(/-/g, "")
  return headers
}

async function googleSearch(
  accessToken: string,
  customerId: string,
  query: string,
  loginCustomerId?: string | null,
): Promise<JsonRecord[]> {
  const results: JsonRecord[] = []
  let pageToken: string | null = null
  for (let page = 0; page < 30; page += 1) {
    const body: JsonRecord = { query, pageSize: 1000 }
    if (pageToken) body.pageToken = pageToken
    const response = await fetchJson(
      `https://googleads.googleapis.com/${googleApiVersion()}/customers/${customerId.replace(/-/g, "")}/googleAds:search`,
      {
        method: "POST",
        headers: googleHeaders(accessToken, loginCustomerId),
        body: JSON.stringify(body),
      },
      "Google Ads non ha restituito i dati richiesti",
    )
    results.push(...array(response.results).map(record))
    pageToken = stringValue(response.nextPageToken) || null
    if (!pageToken) break
  }
  return results
}

async function exchangeGoogleCode(code: string, redirectUri: string): Promise<TokenBundle> {
  const clientId = process.env.GOOGLE_ADS_CLIENT_ID || process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret || !process.env.GOOGLE_ADS_DEVELOPER_TOKEN) {
    throw new Error("Credenziali Google Ads non configurate")
  }
  const params = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  })
  const body = await fetchJson(
    "https://oauth2.googleapis.com/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params,
    },
    "Token Google Ads non ottenuto",
  )
  const accessToken = stringValue(body.access_token)
  if (!accessToken) throw new Error("Token Google Ads non ottenuto")
  return {
    accessToken,
    refreshToken: stringValue(body.refresh_token) || null,
    expiresIn: numberValue(body.expires_in) || null,
    scope: stringValue(body.scope) || null,
  }
}

async function refreshGoogleToken(refreshToken: string): Promise<TokenBundle> {
  const clientId = process.env.GOOGLE_ADS_CLIENT_ID || process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) throw new Error("Credenziali Google Ads non configurate")
  const params = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token",
  })
  const body = await fetchJson(
    "https://oauth2.googleapis.com/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params,
    },
    "Impossibile rinnovare il token Google Ads",
  )
  const accessToken = stringValue(body.access_token)
  if (!accessToken) throw new Error("Impossibile rinnovare il token Google Ads")
  return {
    accessToken,
    refreshToken,
    expiresIn: numberValue(body.expires_in) || null,
    scope: stringValue(body.scope) || null,
  }
}

async function exchangeMetaCode(code: string, redirectUri: string): Promise<TokenBundle> {
  const appId = process.env.META_APP_ID
  const appSecret = process.env.META_APP_SECRET
  if (!appId || !appSecret) throw new Error("Credenziali Meta non configurate")
  const shortUrl = new URL(`https://graph.facebook.com/${metaGraphVersion()}/oauth/access_token`)
  shortUrl.searchParams.set("client_id", appId)
  shortUrl.searchParams.set("client_secret", appSecret)
  shortUrl.searchParams.set("redirect_uri", redirectUri)
  shortUrl.searchParams.set("code", code)
  const shortBody = await fetchJson(shortUrl, { method: "GET" }, "Token Meta Ads non ottenuto")
  const shortToken = stringValue(shortBody.access_token)
  if (!shortToken) throw new Error("Token Meta Ads non ottenuto")

  const longUrl = new URL(`https://graph.facebook.com/${metaGraphVersion()}/oauth/access_token`)
  longUrl.searchParams.set("grant_type", "fb_exchange_token")
  longUrl.searchParams.set("client_id", appId)
  longUrl.searchParams.set("client_secret", appSecret)
  longUrl.searchParams.set("fb_exchange_token", shortToken)
  try {
    const longBody = await fetchJson(longUrl, { method: "GET" }, "Token Meta long-lived non ottenuto")
    return {
      accessToken: stringValue(longBody.access_token) || shortToken,
      expiresIn: numberValue(longBody.expires_in) || numberValue(shortBody.expires_in) || null,
      scope: null,
    }
  } catch {
    return {
      accessToken: shortToken,
      expiresIn: numberValue(shortBody.expires_in) || null,
      scope: null,
    }
  }
}

async function exchangeTikTokCode(code: string): Promise<TokenBundle> {
  const appId = process.env.TIKTOK_ADS_APP_ID || process.env.TIKTOK_APP_ID
  const secret = process.env.TIKTOK_ADS_APP_SECRET || process.env.TIKTOK_APP_SECRET
  if (!appId || !secret) throw new Error("Credenziali TikTok Ads non configurate")
  const body = await fetchJson(
    "https://business-api.tiktok.com/open_api/v1.3/oauth2/access_token/",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ app_id: appId, secret, auth_code: code }),
    },
    "Token TikTok Ads non ottenuto",
  )
  if (numberValue(body.code) !== 0) throw new Error(apiErrorMessage(body, "Token TikTok Ads non ottenuto"))
  const data = record(body.data)
  const accessToken = stringValue(data.access_token)
  if (!accessToken) throw new Error("Token TikTok Ads non ottenuto")
  return {
    accessToken,
    refreshToken: stringValue(data.refresh_token) || null,
    expiresIn: numberValue(data.expires_in) || null,
    refreshExpiresIn: numberValue(data.refresh_token_expires_in) || null,
    scope: stringValue(data.scope) || null,
    metadata: { advertiser_ids: array(data.advertiser_ids).map((id) => stringValue(id)).filter(Boolean) },
  }
}

export async function exchangeAdvertisingCode(
  provider: AdvertisingProvider,
  code: string,
  redirectUri: string,
): Promise<TokenBundle> {
  if (provider === "google") return exchangeGoogleCode(code, redirectUri)
  if (provider === "meta") return exchangeMetaCode(code, redirectUri)
  return exchangeTikTokCode(code)
}

async function discoverGoogleAccounts(accessToken: string): Promise<RemoteAccount[]> {
  const listBody = await fetchJson(
    `https://googleads.googleapis.com/${googleApiVersion()}/customers:listAccessibleCustomers`,
    { method: "GET", headers: googleHeaders(accessToken) },
    "Account Google Ads non leggibili",
  )
  const directIds = array(listBody.resourceNames)
    .map((value) => stringValue(value).split("/").pop() || "")
    .filter(Boolean)

  const accounts = new Map<string, RemoteAccount>()
  for (const directId of directIds) {
    const infoRows = await googleSearch(
      accessToken,
      directId,
      "SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.time_zone, customer.manager, customer.status FROM customer LIMIT 1",
    )
    const customer = record(infoRows[0]?.customer)
    const isManager = customer.manager === true
    if (!isManager) {
      accounts.set(directId, {
        externalAccountId: directId,
        name: stringValue(customer.descriptiveName) || `Google Ads ${directId}`,
        currency: stringValue(customer.currencyCode) || null,
        timezone: stringValue(customer.timeZone) || null,
        metadata: { login_customer_id: null, manager: false, customer_status: stringValue(customer.status) || null },
      })
      continue
    }

    const clientRows = await googleSearch(
      accessToken,
      directId,
      "SELECT customer_client.id, customer_client.descriptive_name, customer_client.currency_code, customer_client.time_zone, customer_client.manager, customer_client.status, customer_client.level FROM customer_client",
      directId,
    )
    for (const row of clientRows) {
      const client = record(row.customerClient)
      const clientId = stringValue(client.id)
      if (!clientId || client.manager === true || stringValue(client.status) === "CANCELED") continue
      accounts.set(clientId, {
        externalAccountId: clientId,
        name: stringValue(client.descriptiveName) || `Google Ads ${clientId}`,
        currency: stringValue(client.currencyCode) || null,
        timezone: stringValue(client.timeZone) || null,
        metadata: {
          login_customer_id: directId,
          manager: false,
          customer_status: stringValue(client.status) || null,
          hierarchy_level: numberValue(client.level),
        },
      })
    }
  }
  return Array.from(accounts.values())
}

async function metaPaged(url: URL, accessToken: string): Promise<JsonRecord[]> {
  const rows: JsonRecord[] = []
  url.searchParams.set("access_token", accessToken)
  let next: string | null = url.toString()
  for (let page = 0; page < 30 && next; page += 1) {
    const parsed = new URL(next)
    if (parsed.protocol !== "https:" || parsed.hostname !== "graph.facebook.com") {
      throw new Error("Meta ha restituito una paginazione non valida")
    }
    const body = await fetchJson(parsed, { method: "GET" }, "Meta Ads non ha restituito i dati richiesti")
    rows.push(...array(body.data).map(record))
    const paging = record(body.paging)
    next = stringValue(paging.next) || null
  }
  return rows
}

async function discoverMetaAccounts(accessToken: string): Promise<RemoteAccount[]> {
  const url = new URL(`https://graph.facebook.com/${metaGraphVersion()}/me/adaccounts`)
  url.searchParams.set("fields", "id,account_id,name,currency,timezone_name,account_status,business_name")
  url.searchParams.set("limit", "200")
  const rows = await metaPaged(url, accessToken)
  return rows
    .map((row): RemoteAccount | null => {
      const externalAccountId = stringValue(row.account_id) || stringValue(row.id).replace(/^act_/, "")
      if (!externalAccountId) return null
      return {
        externalAccountId,
        name: stringValue(row.name) || stringValue(row.business_name) || `Meta Ads ${externalAccountId}`,
        currency: stringValue(row.currency) || null,
        timezone: stringValue(row.timezone_name) || null,
        metadata: { graph_account_id: stringValue(row.id) || `act_${externalAccountId}`, account_status: row.account_status ?? null },
      }
    })
    .filter((value): value is RemoteAccount => value !== null)
}

async function discoverTikTokAccounts(accessToken: string, tokenMetadata: JsonRecord): Promise<RemoteAccount[]> {
  const appId = process.env.TIKTOK_ADS_APP_ID || process.env.TIKTOK_APP_ID
  const secret = process.env.TIKTOK_ADS_APP_SECRET || process.env.TIKTOK_APP_SECRET
  if (!appId || !secret) throw new Error("Credenziali TikTok Ads non configurate")

  const authUrl = new URL("https://business-api.tiktok.com/open_api/v1.3/oauth2/advertiser/get/")
  authUrl.searchParams.set("app_id", appId)
  authUrl.searchParams.set("secret", secret)
  const authBody = await fetchJson(
    authUrl,
    { method: "GET", headers: { "Access-Token": accessToken } },
    "Account TikTok Ads non leggibili",
  )
  if (numberValue(authBody.code) !== 0) throw new Error(apiErrorMessage(authBody, "Account TikTok Ads non leggibili"))
  const authRows = array(record(authBody.data).list).map(record)
  const tokenIds = array(tokenMetadata.advertiser_ids).map((id) => stringValue(id)).filter(Boolean)
  const ids = Array.from(
    new Set([
      ...authRows.map((row) => stringValue(row.advertiser_id)).filter(Boolean),
      ...tokenIds,
    ]),
  )
  if (ids.length === 0) return []

  const infoUrl = new URL("https://business-api.tiktok.com/open_api/v1.3/advertiser/info/")
  infoUrl.searchParams.set("advertiser_ids", JSON.stringify(ids))
  infoUrl.searchParams.set("fields", JSON.stringify(["advertiser_id", "name", "currency", "timezone", "status", "company", "country_code"]))
  try {
    const infoBody = await fetchJson(
      infoUrl,
      { method: "GET", headers: { "Access-Token": accessToken } },
      "Dettagli account TikTok Ads non leggibili",
    )
    if (numberValue(infoBody.code) !== 0) throw new Error(apiErrorMessage(infoBody, "Dettagli TikTok non leggibili"))
    const infoRows = array(record(infoBody.data).list).map(record)
    return infoRows.map((row) => {
      const externalAccountId = stringValue(row.advertiser_id)
      const auth = authRows.find((candidate) => stringValue(candidate.advertiser_id) === externalAccountId)
      return {
        externalAccountId,
        name: stringValue(row.name) || stringValue(auth?.advertiser_name) || `TikTok Ads ${externalAccountId}`,
        currency: stringValue(row.currency) || null,
        timezone: stringValue(row.timezone) || null,
        metadata: { advertiser_status: row.status ?? null, company: row.company ?? null, country_code: row.country_code ?? null },
      }
    })
  } catch {
    return ids.map((externalAccountId) => {
      const auth = authRows.find((candidate) => stringValue(candidate.advertiser_id) === externalAccountId)
      return {
        externalAccountId,
        name: stringValue(auth?.advertiser_name) || `TikTok Ads ${externalAccountId}`,
        currency: null,
        timezone: null,
        metadata: {},
      }
    })
  }
}

export async function discoverAdvertisingAccounts(
  provider: AdvertisingProvider,
  token: TokenBundle,
): Promise<RemoteAccount[]> {
  if (provider === "google") return discoverGoogleAccounts(token.accessToken)
  if (provider === "meta") return discoverMetaAccounts(token.accessToken)
  return discoverTikTokAccounts(token.accessToken, token.metadata || {})
}

async function persistCredential(accountId: string, propertyId: string, token: TokenBundle): Promise<void> {
  const supabase = createServiceClient()
  const { data: existingData, error: existingError } = await supabase
    .from("advertising_account_credentials")
    .select("refresh_token_encrypted")
    .eq("advertising_account_id", accountId)
    .maybeSingle()
  if (existingError) throw existingError
  const existing = (existingData || null) as { refresh_token_encrypted?: string | null } | null
  const refreshEncrypted = token.refreshToken
    ? encryptSecret(token.refreshToken)
    : existing?.refresh_token_encrypted || null
  const now = Date.now()
  const accessExpiresAt = token.expiresIn ? new Date(now + token.expiresIn * 1000).toISOString() : null
  const refreshExpiresAt = token.refreshExpiresIn ? new Date(now + token.refreshExpiresIn * 1000).toISOString() : null
  const { error } = await supabase.from("advertising_account_credentials").upsert(
    {
      advertising_account_id: accountId,
      property_id: propertyId,
      access_token_encrypted: encryptSecret(token.accessToken),
      refresh_token_encrypted: refreshEncrypted,
      access_token_expires_at: accessExpiresAt,
      refresh_token_expires_at: refreshExpiresAt,
      scopes: token.scope || null,
      metadata: token.metadata || {},
      updated_at: new Date().toISOString(),
    },
    { onConflict: "advertising_account_id" },
  )
  if (error) throw error
}

export async function connectAdvertisingProvider(
  propertyId: string,
  provider: AdvertisingProvider,
  token: TokenBundle,
): Promise<{ connected: number; campaigns: number; metrics: number; syncErrors: string[] }> {
  const accounts = await discoverAdvertisingAccounts(provider, token)
  if (accounts.length === 0) return { connected: 0, campaigns: 0, metrics: 0, syncErrors: [] }
  const supabase = createServiceClient()
  let campaignCount = 0
  let metricCount = 0
  const syncErrors: string[] = []

  for (const remote of accounts) {
    const { data: existingData } = await supabase
      .from("advertising_accounts")
      .select("connection_mode")
      .eq("property_id", propertyId)
      .eq("provider", provider)
      .eq("external_account_id", remote.externalAccountId)
      .maybeSingle()
    const existing = (existingData || null) as { connection_mode?: string | null } | null
    const { data: accountData, error: accountError } = await supabase
      .from("advertising_accounts")
      .upsert(
        {
          property_id: propertyId,
          provider,
          external_account_id: remote.externalAccountId,
          name: remote.name,
          currency: remote.currency,
          timezone: remote.timezone,
          status: "connected",
          connection_mode: existing?.connection_mode || "own_account",
          last_error: null,
          metadata: remote.metadata,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "property_id,provider,external_account_id" },
      )
      .select("id")
      .single()
    if (accountError) throw accountError
    const accountId = stringValue(record(accountData).id)
    if (!accountId) throw new Error("Account advertising salvato senza ID")
    await persistCredential(accountId, propertyId, token)
    try {
      const result = await syncAdvertisingAccount(propertyId, accountId)
      campaignCount += result.campaigns
      metricCount += result.metrics
    } catch (error) {
      syncErrors.push(`${remote.name}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  return { connected: accounts.length, campaigns: campaignCount, metrics: metricCount, syncErrors }
}

async function resolveAccessToken(account: AccountRow): Promise<{ accessToken: string; credential: CredentialRow }> {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from("advertising_account_credentials")
    .select("advertising_account_id, access_token_encrypted, refresh_token_encrypted, access_token_expires_at, refresh_token_expires_at, scopes, metadata")
    .eq("advertising_account_id", account.id)
    .eq("property_id", account.property_id)
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error("Credenziali advertising mancanti: ricollega l'account")
  const credential = data as CredentialRow
  let accessToken = decryptSecretIfNeeded(credential.access_token_encrypted)
  if (!accessToken) throw new Error("Token advertising non disponibile: ricollega l'account")

  const expiresAt = credential.access_token_expires_at ? new Date(credential.access_token_expires_at).getTime() : null
  const expiring = expiresAt !== null && expiresAt <= Date.now() + 5 * 60 * 1000
  if (!expiring) return { accessToken, credential }

  if (account.provider !== "google") {
    throw new Error("Token advertising scaduto: ricollega l'account")
  }
  const refreshToken = decryptSecretIfNeeded(credential.refresh_token_encrypted)
  if (!refreshToken) throw new Error("Refresh token Google Ads mancante: ricollega l'account")
  const refreshed = await refreshGoogleToken(refreshToken)
  accessToken = refreshed.accessToken
  await persistCredential(account.id, account.property_id, refreshed)
  return { accessToken, credential: { ...credential, access_token_encrypted: encryptSecret(accessToken) || credential.access_token_encrypted } }
}

async function fetchGoogleCampaigns(account: AccountRow, accessToken: string): Promise<{ campaigns: RemoteCampaign[]; metrics: RemoteMetric[] }> {
  const loginCustomerId = stringValue(record(account.metadata).login_customer_id) || null
  const rows = await googleSearch(
    accessToken,
    account.external_account_id,
    "SELECT campaign.id, campaign.resource_name, campaign.name, campaign.status, campaign.advertising_channel_type, campaign.start_date, campaign.end_date, campaign_budget.resource_name, campaign_budget.amount_micros, campaign_budget.total_amount_micros FROM campaign ORDER BY campaign.id",
    loginCustomerId,
  )
  const campaigns = rows.map((row): RemoteCampaign => {
    const campaign = record(row.campaign)
    const budget = record(row.campaignBudget)
    const total = numberValue(budget.totalAmountMicros) / 1_000_000
    const daily = numberValue(budget.amountMicros) / 1_000_000
    return {
      externalCampaignId: stringValue(campaign.id),
      name: stringValue(campaign.name) || `Google Campaign ${stringValue(campaign.id)}`,
      status: stringValue(campaign.status) || "UNKNOWN",
      objective: stringValue(campaign.advertisingChannelType) || null,
      budgetAmount: total > 0 ? total : daily > 0 ? daily : null,
      budgetPeriod: total > 0 ? "total" : daily > 0 ? "daily" : null,
      startsAt: optionalIsoDate(campaign.startDate),
      endsAt: optionalIsoDate(campaign.endDate),
      rawConfig: {
        campaign_resource_name: stringValue(campaign.resourceName) || null,
        campaign_budget_resource_name: stringValue(budget.resourceName) || null,
        amount_micros: budget.amountMicros ?? null,
        total_amount_micros: budget.totalAmountMicros ?? null,
      },
    }
  })

  const metricRows = await googleSearch(
    accessToken,
    account.external_account_id,
    "SELECT campaign.id, segments.date, metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions, metrics.conversions_value FROM campaign WHERE segments.date DURING LAST_30_DAYS",
    loginCustomerId,
  )
  const metrics = metricRows.map((row): RemoteMetric => {
    const campaign = record(row.campaign)
    const segments = record(row.segments)
    const rawMetrics = record(row.metrics)
    const spend = numberValue(rawMetrics.costMicros) / 1_000_000
    const impressions = numberValue(rawMetrics.impressions)
    const clicks = numberValue(rawMetrics.clicks)
    return {
      externalCampaignId: stringValue(campaign.id),
      date: stringValue(segments.date),
      spend,
      impressions,
      clicks,
      conversions: numberValue(rawMetrics.conversions),
      conversionValue: numberValue(rawMetrics.conversionsValue),
      cpc: clicks > 0 ? spend / clicks : null,
      ctr: impressions > 0 ? clicks / impressions : null,
      cpm: impressions > 0 ? (spend / impressions) * 1000 : null,
      rawMetrics,
    }
  })
  return { campaigns, metrics: metrics.filter((metric) => Boolean(metric.externalCampaignId && metric.date)) }
}

function metaActionValue(value: unknown, candidates: string[]): number {
  const actions = array(value).map(record)
  for (const candidate of candidates) {
    const match = actions.find((action) => stringValue(action.action_type) === candidate)
    if (match) return numberValue(match.value)
  }
  return 0
}

async function fetchMetaCampaigns(account: AccountRow, accessToken: string): Promise<{ campaigns: RemoteCampaign[]; metrics: RemoteMetric[] }> {
  const graphId = stringValue(record(account.metadata).graph_account_id) || `act_${account.external_account_id}`
  const campaignUrl = new URL(`https://graph.facebook.com/${metaGraphVersion()}/${graphId}/campaigns`)
  campaignUrl.searchParams.set("fields", "id,name,status,effective_status,objective,start_time,stop_time,daily_budget,lifetime_budget,budget_remaining")
  campaignUrl.searchParams.set("limit", "200")
  const rows = await metaPaged(campaignUrl, accessToken)
  const campaigns = rows.map((row): RemoteCampaign => {
    const lifetimeMinor = numberValue(row.lifetime_budget)
    const dailyMinor = numberValue(row.daily_budget)
    return {
      externalCampaignId: stringValue(row.id),
      name: stringValue(row.name) || `Meta Campaign ${stringValue(row.id)}`,
      status: stringValue(row.effective_status) || stringValue(row.status) || "UNKNOWN",
      objective: stringValue(row.objective) || null,
      budgetAmount: lifetimeMinor > 0 ? lifetimeMinor / 100 : dailyMinor > 0 ? dailyMinor / 100 : null,
      budgetPeriod: lifetimeMinor > 0 ? "lifetime" : dailyMinor > 0 ? "daily" : null,
      startsAt: optionalIsoDate(row.start_time),
      endsAt: optionalIsoDate(row.stop_time),
      rawConfig: {
        configured_status: row.status ?? null,
        effective_status: row.effective_status ?? null,
        daily_budget_minor: row.daily_budget ?? null,
        lifetime_budget_minor: row.lifetime_budget ?? null,
        budget_remaining_minor: row.budget_remaining ?? null,
      },
    }
  })

  const range = trailing30Days()
  const insightUrl = new URL(`https://graph.facebook.com/${metaGraphVersion()}/${graphId}/insights`)
  insightUrl.searchParams.set("level", "campaign")
  insightUrl.searchParams.set("fields", "campaign_id,date_start,spend,impressions,clicks,actions,action_values,cpc,ctr,cpm")
  insightUrl.searchParams.set("time_range", JSON.stringify({ since: range.start, until: range.end }))
  insightUrl.searchParams.set("time_increment", "1")
  insightUrl.searchParams.set("limit", "500")
  const insightRows = await metaPaged(insightUrl, accessToken)
  const conversionCandidates = [
    "offsite_conversion.fb_pixel_purchase",
    "omni_purchase",
    "purchase",
    "offsite_conversion.fb_pixel_lead",
    "lead",
  ]
  const valueCandidates = ["offsite_conversion.fb_pixel_purchase", "omni_purchase", "purchase"]
  const metrics = insightRows.map((row): RemoteMetric => ({
    externalCampaignId: stringValue(row.campaign_id),
    date: stringValue(row.date_start),
    spend: numberValue(row.spend),
    impressions: numberValue(row.impressions),
    clicks: numberValue(row.clicks),
    conversions: metaActionValue(row.actions, conversionCandidates),
    conversionValue: metaActionValue(row.action_values, valueCandidates),
    cpc: stringValue(row.cpc) ? numberValue(row.cpc) : null,
    ctr: stringValue(row.ctr) ? numberValue(row.ctr) / 100 : null,
    cpm: stringValue(row.cpm) ? numberValue(row.cpm) : null,
    rawMetrics: row,
  }))
  return { campaigns, metrics: metrics.filter((metric) => Boolean(metric.externalCampaignId && metric.date)) }
}

async function tiktokGet(accessToken: string, path: string, params: Record<string, string>): Promise<JsonRecord> {
  const url = new URL(`https://business-api.tiktok.com/open_api/v1.3/${path.replace(/^\//, "")}`)
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value)
  const body = await fetchJson(url, { method: "GET", headers: { "Access-Token": accessToken } }, "TikTok Ads non ha restituito i dati richiesti")
  if (numberValue(body.code) !== 0) throw new Error(apiErrorMessage(body, "TikTok Ads non ha restituito i dati richiesti"))
  return body
}

async function fetchTikTokCampaigns(account: AccountRow, accessToken: string): Promise<{ campaigns: RemoteCampaign[]; metrics: RemoteMetric[] }> {
  const campaignRows: JsonRecord[] = []
  const fields = [
    "campaign_id",
    "campaign_name",
    "objective_type",
    "operation_status",
    "secondary_status",
    "budget",
    "budget_mode",
    "budget_optimize_on",
    "create_time",
    "modify_time",
  ]
  for (let page = 1; page <= 30; page += 1) {
    const body = await tiktokGet(accessToken, "campaign/get/", {
      advertiser_id: account.external_account_id,
      page: String(page),
      page_size: "1000",
      fields: JSON.stringify(fields),
    })
    const rows = array(record(body.data).list).map(record)
    campaignRows.push(...rows)
    if (rows.length < 1000) break
  }
  const campaigns = campaignRows.map((row): RemoteCampaign => {
    const budget = numberValue(row.budget)
    const budgetMode = stringValue(row.budget_mode)
    return {
      externalCampaignId: stringValue(row.campaign_id),
      name: stringValue(row.campaign_name) || `TikTok Campaign ${stringValue(row.campaign_id)}`,
      status: stringValue(row.operation_status) || stringValue(row.secondary_status) || "UNKNOWN",
      objective: stringValue(row.objective_type) || null,
      budgetAmount: budget > 0 ? budget : null,
      budgetPeriod: budgetMode.includes("TOTAL") ? "total" : budgetMode.includes("DAILY") ? "daily" : null,
      startsAt: null,
      endsAt: null,
      rawConfig: {
        budget_mode: row.budget_mode ?? null,
        budget_optimize_on: row.budget_optimize_on ?? null,
        secondary_status: row.secondary_status ?? null,
      },
    }
  })

  const range = trailing30Days()
  const metricRows: JsonRecord[] = []
  for (let page = 1; page <= 30; page += 1) {
    const body = await tiktokGet(accessToken, "report/integrated/get/", {
      advertiser_id: account.external_account_id,
      report_type: "BASIC",
      data_level: "AUCTION_CAMPAIGN",
      dimensions: JSON.stringify(["campaign_id", "stat_time_day"]),
      metrics: JSON.stringify(["spend", "impressions", "clicks", "conversion", "cpc", "ctr", "cpm"]),
      start_date: range.start,
      end_date: range.end,
      page: String(page),
      page_size: "1000",
    })
    const rows = array(record(body.data).list).map(record)
    metricRows.push(...rows)
    if (rows.length < 1000) break
  }
  const metrics = metricRows.map((row): RemoteMetric => {
    const dimensions = record(row.dimensions)
    const rawMetrics = record(row.metrics)
    return {
      externalCampaignId: stringValue(dimensions.campaign_id),
      date: stringValue(dimensions.stat_time_day),
      spend: numberValue(rawMetrics.spend),
      impressions: numberValue(rawMetrics.impressions),
      clicks: numberValue(rawMetrics.clicks),
      conversions: numberValue(rawMetrics.conversion),
      conversionValue: 0,
      cpc: stringValue(rawMetrics.cpc) ? numberValue(rawMetrics.cpc) : null,
      ctr: stringValue(rawMetrics.ctr) ? numberValue(rawMetrics.ctr) : null,
      cpm: stringValue(rawMetrics.cpm) ? numberValue(rawMetrics.cpm) : null,
      rawMetrics,
    }
  })
  return { campaigns, metrics: metrics.filter((metric) => Boolean(metric.externalCampaignId && metric.date)) }
}

async function fetchProviderCampaigns(account: AccountRow, accessToken: string): Promise<{ campaigns: RemoteCampaign[]; metrics: RemoteMetric[] }> {
  if (account.provider === "google") return fetchGoogleCampaigns(account, accessToken)
  if (account.provider === "meta") return fetchMetaCampaigns(account, accessToken)
  return fetchTikTokCampaigns(account, accessToken)
}

export async function syncAdvertisingAccount(
  propertyId: string,
  accountId: string,
): Promise<{ campaigns: number; metrics: number }> {
  const supabase = createServiceClient()
  const { data: accountData, error: accountError } = await supabase
    .from("advertising_accounts")
    .select("id, property_id, provider, external_account_id, name, currency, timezone, status, connection_mode, metadata")
    .eq("id", accountId)
    .eq("property_id", propertyId)
    .maybeSingle()
  if (accountError) throw accountError
  if (!accountData) throw new Error("Account advertising non trovato")
  const account = accountData as AccountRow

  try {
    const { accessToken } = await resolveAccessToken(account)
    const remote = await fetchProviderCampaigns(account, accessToken)
    const { data: existingData, error: existingError } = await supabase
      .from("advertising_campaigns")
      .select("id, external_campaign_id, origin, management_mode")
      .eq("property_id", propertyId)
      .eq("advertising_account_id", accountId)
    if (existingError) throw existingError
    const existingRows = (existingData || []) as Array<{
      id: string
      external_campaign_id: string
      origin: "imported" | "hotelaccelerator"
      management_mode: "observe" | "assist" | "autopilot"
    }>
    const existingMap = new Map(existingRows.map((row) => [row.external_campaign_id, row]))
    const now = new Date().toISOString()
    const campaignPayload = remote.campaigns
      .filter((campaign) => Boolean(campaign.externalCampaignId))
      .map((campaign) => {
        const existing = existingMap.get(campaign.externalCampaignId)
        return {
          property_id: propertyId,
          advertising_account_id: accountId,
          provider: account.provider,
          external_campaign_id: campaign.externalCampaignId,
          name: campaign.name,
          status: campaign.status,
          objective: campaign.objective,
          origin: existing?.origin || "imported",
          management_mode: existing?.management_mode || "observe",
          budget_amount: campaign.budgetAmount,
          budget_period: campaign.budgetPeriod,
          currency: account.currency,
          starts_at: campaign.startsAt,
          ends_at: campaign.endsAt,
          last_synced_at: now,
          raw_config: campaign.rawConfig,
          updated_at: now,
        }
      })

    let localCampaignRows: Array<{ id: string; external_campaign_id: string }> = []
    if (campaignPayload.length > 0) {
      const { data: upsertedData, error: upsertError } = await supabase
        .from("advertising_campaigns")
        .upsert(campaignPayload, { onConflict: "advertising_account_id,external_campaign_id" })
        .select("id, external_campaign_id")
      if (upsertError) throw upsertError
      localCampaignRows = (upsertedData || []) as Array<{ id: string; external_campaign_id: string }>
    }
    const localByExternal = new Map(localCampaignRows.map((row) => [row.external_campaign_id, row.id]))

    const metricPayload = remote.metrics
      .map((metric) => {
        const campaignId = localByExternal.get(metric.externalCampaignId) || existingMap.get(metric.externalCampaignId)?.id
        if (!campaignId) return null
        return {
          property_id: propertyId,
          campaign_id: campaignId,
          metric_date: metric.date,
          spend: metric.spend,
          impressions: Math.round(metric.impressions),
          clicks: Math.round(metric.clicks),
          conversions: metric.conversions,
          conversion_value: metric.conversionValue,
          cpc: metric.cpc,
          ctr: metric.ctr,
          cpm: metric.cpm,
          raw_metrics: metric.rawMetrics,
          updated_at: now,
        }
      })
      .filter((value): value is NonNullable<typeof value> => value !== null)

    if (metricPayload.length > 0) {
      const { error: metricError } = await supabase
        .from("advertising_campaign_metrics")
        .upsert(metricPayload, { onConflict: "campaign_id,metric_date" })
      if (metricError) throw metricError
    }

    const { error: accountUpdateError } = await supabase
      .from("advertising_accounts")
      .update({ status: "connected", last_synced_at: now, last_error: null, updated_at: now })
      .eq("id", accountId)
      .eq("property_id", propertyId)
    if (accountUpdateError) throw accountUpdateError
    return { campaigns: campaignPayload.length, metrics: metricPayload.length }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await supabase
      .from("advertising_accounts")
      .update({ status: "error", last_error: message.slice(0, 1000), updated_at: new Date().toISOString() })
      .eq("id", accountId)
      .eq("property_id", propertyId)
    throw error
  }
}

async function loadCampaignForMutation(propertyId: string, campaignId: string): Promise<{ campaign: CampaignRow; account: AccountRow; accessToken: string }> {
  const supabase = createServiceClient()
  const { data: campaignData, error: campaignError } = await supabase
    .from("advertising_campaigns")
    .select("id, property_id, advertising_account_id, provider, external_campaign_id, name, status, objective, origin, management_mode, budget_amount, budget_period, currency, raw_config")
    .eq("id", campaignId)
    .eq("property_id", propertyId)
    .maybeSingle()
  if (campaignError) throw campaignError
  if (!campaignData) throw new Error("Campagna non trovata")
  const campaign = campaignData as CampaignRow
  if (campaign.management_mode === "observe") {
    throw new Error("La campagna e in sola osservazione. Abilita prima la gestione HotelAccelerator.")
  }
  const { data: accountData, error: accountError } = await supabase
    .from("advertising_accounts")
    .select("id, property_id, provider, external_account_id, name, currency, timezone, status, connection_mode, metadata")
    .eq("id", campaign.advertising_account_id)
    .eq("property_id", propertyId)
    .maybeSingle()
  if (accountError) throw accountError
  if (!accountData) throw new Error("Account advertising della campagna non trovato")
  const account = accountData as AccountRow
  const { accessToken } = await resolveAccessToken(account)
  return { campaign, account, accessToken }
}

async function googleMutate(account: AccountRow, accessToken: string, service: string, body: JsonRecord): Promise<void> {
  const loginCustomerId = stringValue(record(account.metadata).login_customer_id) || null
  await fetchJson(
    `https://googleads.googleapis.com/${googleApiVersion()}/customers/${account.external_account_id}/${service}:mutate`,
    {
      method: "POST",
      headers: googleHeaders(accessToken, loginCustomerId),
      body: JSON.stringify(body),
    },
    "Modifica Google Ads non riuscita",
  )
}

async function tiktokPost(accessToken: string, path: string, payload: JsonRecord): Promise<void> {
  const body = await fetchJson(
    `https://business-api.tiktok.com/open_api/v1.3/${path.replace(/^\//, "")}`,
    {
      method: "POST",
      headers: { "Access-Token": accessToken, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
    "Modifica TikTok Ads non riuscita",
  )
  if (numberValue(body.code) !== 0) throw new Error(apiErrorMessage(body, "Modifica TikTok Ads non riuscita"))
}

export async function updateAdvertisingCampaignStatus(
  propertyId: string,
  campaignId: string,
  active: boolean,
): Promise<void> {
  const { campaign, account, accessToken } = await loadCampaignForMutation(propertyId, campaignId)
  if (campaign.provider === "google") {
    const resourceName =
      stringValue(record(campaign.raw_config).campaign_resource_name) ||
      `customers/${account.external_account_id}/campaigns/${campaign.external_campaign_id}`
    await googleMutate(account, accessToken, "campaigns", {
      operations: [{ update: { resourceName, status: active ? "ENABLED" : "PAUSED" }, updateMask: "status" }],
    })
  } else if (campaign.provider === "meta") {
    const url = new URL(`https://graph.facebook.com/${metaGraphVersion()}/${campaign.external_campaign_id}`)
    const body = new URLSearchParams({ status: active ? "ACTIVE" : "PAUSED", access_token: accessToken })
    await fetchJson(
      url,
      { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body },
      "Modifica Meta Ads non riuscita",
    )
  } else {
    await tiktokPost(accessToken, "campaign/status/update/", {
      advertiser_id: account.external_account_id,
      campaign_ids: [campaign.external_campaign_id],
      operation_status: active ? "ENABLE" : "DISABLE",
    })
  }
  await syncAdvertisingAccount(propertyId, account.id)
}

export async function updateAdvertisingCampaignBudget(
  propertyId: string,
  campaignId: string,
  amount: number,
): Promise<void> {
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000) {
    throw new Error("Budget non valido")
  }
  const { campaign, account, accessToken } = await loadCampaignForMutation(propertyId, campaignId)
  if (campaign.provider === "google") {
    const budgetResource = stringValue(record(campaign.raw_config).campaign_budget_resource_name)
    if (!budgetResource) throw new Error("Budget Google Ads non modificabile a livello campagna")
    await googleMutate(account, accessToken, "campaignBudgets", {
      operations: [
        {
          update: { resourceName: budgetResource, amountMicros: String(Math.round(amount * 1_000_000)) },
          updateMask: "amount_micros",
        },
      ],
    })
  } else if (campaign.provider === "meta") {
    if (campaign.budget_period !== "daily" && campaign.budget_period !== "lifetime") {
      throw new Error("Questa campagna Meta usa il budget a livello Ad Set: modificalo dalla gestione avanzata")
    }
    const body = new URLSearchParams({ access_token: accessToken })
    body.set(campaign.budget_period === "daily" ? "daily_budget" : "lifetime_budget", String(Math.round(amount * 100)))
    await fetchJson(
      `https://graph.facebook.com/${metaGraphVersion()}/${campaign.external_campaign_id}`,
      { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body },
      "Modifica budget Meta Ads non riuscita",
    )
  } else {
    const payload: JsonRecord = {
      advertiser_id: account.external_account_id,
      campaign_id: campaign.external_campaign_id,
      budget: amount,
    }
    const budgetMode = stringValue(record(campaign.raw_config).budget_mode)
    if (budgetMode) payload.budget_mode = budgetMode
    await tiktokPost(accessToken, "campaign/update/", payload)
  }
  await syncAdvertisingAccount(propertyId, account.id)
}
