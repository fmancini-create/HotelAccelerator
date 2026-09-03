"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import {
  AlertCircle,
  BarChart3,
  Bot,
  Link2,
  Megaphone,
  MousePointerClick,
  Pause,
  Play,
  RefreshCw,
  Save,
  Sparkles,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import type { AdvertisingAccount, AdvertisingManagementMode, AdvertisingProvider } from "@/lib/advertising/types"
import { providerLabel } from "@/lib/advertising/types"

type CampaignRow = {
  id: string
  advertising_account_id: string
  provider: AdvertisingProvider
  external_campaign_id: string
  name: string
  status: string
  objective: string | null
  origin: "imported" | "hotelaccelerator"
  management_mode: AdvertisingManagementMode
  budget_amount: number | null
  budget_period: "daily" | "lifetime" | "total" | null
  currency: string | null
  last_synced_at: string | null
  metrics_30d: {
    spend: number
    impressions: number
    clicks: number
    conversions: number
    conversion_value: number
  }
}

type Notice = { tone: "success" | "warning" | "error"; text: string }

function money(value: number, currency = "EUR") {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency }).format(value)
}

function modeLabel(mode: AdvertisingManagementMode) {
  if (mode === "assist") return "Assistita"
  if (mode === "autopilot") return "Autopilot"
  return "Solo osservazione"
}

function isActiveStatus(status: string) {
  const normalized = status.toUpperCase()
  return normalized === "ACTIVE" || normalized === "ENABLED" || normalized === "ENABLE"
}

export default function SmartAdsPage() {
  const [accounts, setAccounts] = useState<AdvertisingAccount[]>([])
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [syncingAccountId, setSyncingAccountId] = useState<string | null>(null)
  const [budgetDrafts, setBudgetDrafts] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<Notice | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [accountsRes, campaignsRes] = await Promise.all([
        fetch("/api/admin/marketing/ads/accounts", { cache: "no-store" }),
        fetch("/api/admin/marketing/ads/campaigns", { cache: "no-store" }),
      ])
      const accountsBody = await accountsRes.json()
      const campaignsBody = await campaignsRes.json()
      if (!accountsRes.ok) throw new Error(accountsBody.error || "Impossibile caricare gli account advertising")
      if (!campaignsRes.ok) throw new Error(campaignsBody.error || "Impossibile caricare le campagne advertising")
      setAccounts(accountsBody as AdvertisingAccount[])
      setCampaigns(campaignsBody as CampaignRow[])
      setBudgetDrafts((current) => {
        const next = { ...current }
        for (const campaign of campaignsBody as CampaignRow[]) {
          if (!(campaign.id in next) && campaign.budget_amount != null) next[campaign.id] = String(campaign.budget_amount)
        }
        return next
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore durante il caricamento")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    const params = new URLSearchParams(window.location.search)
    const callbackError = params.get("error")
    const connected = Number(params.get("connected") || 0)
    const imported = Number(params.get("imported") || 0)
    const syncErrors = Number(params.get("sync_errors") || 0)
    if (callbackError) {
      setNotice({ tone: "error", text: callbackError })
    } else if (connected > 0) {
      setNotice({
        tone: syncErrors > 0 ? "warning" : "success",
        text: `Collegati ${connected} account e importate ${imported} campagne${syncErrors > 0 ? `. ${syncErrors} account richiedono attenzione.` : "."}`,
      })
    }
  }, [load])

  const totals = useMemo(
    () =>
      campaigns.reduce(
        (acc, campaign) => {
          acc.spend += campaign.metrics_30d.spend
          acc.clicks += campaign.metrics_30d.clicks
          acc.conversions += campaign.metrics_30d.conversions
          acc.revenue += campaign.metrics_30d.conversion_value
          return acc
        },
        { spend: 0, clicks: 0, conversions: 0, revenue: 0 },
      ),
    [campaigns],
  )

  function connect(provider: AdvertisingProvider) {
    window.location.assign(`/api/admin/marketing/ads/connect/${provider}`)
  }

  async function setMode(campaignId: string, managementMode: AdvertisingManagementMode) {
    setSavingId(campaignId)
    setError(null)
    try {
      const response = await fetch(`/api/admin/marketing/ads/campaigns/${campaignId}/management`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ management_mode: managementMode }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || "Modifica non riuscita")
      setCampaigns((current) =>
        current.map((campaign) =>
          campaign.id === campaignId ? { ...campaign, management_mode: managementMode } : campaign,
        ),
      )
      setNotice({ tone: "success", text: body.notice || "Modalita di gestione aggiornata." })
    } catch (e) {
      setError(e instanceof Error ? e.message : "Modifica non riuscita")
    } finally {
      setSavingId(null)
    }
  }

  async function syncAccount(accountId: string) {
    setSyncingAccountId(accountId)
    setError(null)
    try {
      const response = await fetch(`/api/admin/marketing/ads/accounts/${accountId}/sync`, { method: "POST" })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || "Sincronizzazione non riuscita")
      setNotice({ tone: "success", text: `Sincronizzate ${body.campaigns ?? 0} campagne e ${body.metrics ?? 0} righe metriche.` })
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sincronizzazione non riuscita")
    } finally {
      setSyncingAccountId(null)
    }
  }

  async function mutateProvider(campaignId: string, payload: { active?: boolean; budget_amount?: number }) {
    setSavingId(campaignId)
    setError(null)
    try {
      const response = await fetch(`/api/admin/marketing/ads/campaigns/${campaignId}/provider`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || "Modifica provider non riuscita")
      setNotice({ tone: "success", text: "Modifica applicata al provider e risincronizzata." })
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : "Modifica provider non riuscita")
    } finally {
      setSavingId(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Megaphone className="h-6 w-6" />
            <h1 className="text-2xl font-bold">Smart Ads</h1>
          </div>
          <p className="mt-1 text-muted-foreground">
            Collega Google, Meta e TikTok, importa le campagne esistenti e gestiscile da HotelAccelerator.
          </p>
        </div>
        <Button variant="outline" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Aggiorna dashboard
        </Button>
      </div>

      {notice && (
        <div className="rounded-lg border p-3 text-sm">
          <div className="flex items-center gap-2">
            {notice.tone === "error" ? <AlertCircle className="h-4 w-4 text-destructive" /> : <Sparkles className="h-4 w-4" />}
            <span>{notice.text}</span>
          </div>
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" />
          {error}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-4">
        <Card><CardContent className="pt-5"><p className="text-sm text-muted-foreground">Spesa ultimi 30 gg</p><p className="mt-1 text-2xl font-bold">{money(totals.spend)}</p></CardContent></Card>
        <Card><CardContent className="pt-5"><p className="text-sm text-muted-foreground">Click</p><p className="mt-1 text-2xl font-bold">{totals.clicks.toLocaleString("it-IT")}</p></CardContent></Card>
        <Card><CardContent className="pt-5"><p className="text-sm text-muted-foreground">Conversioni</p><p className="mt-1 text-2xl font-bold">{totals.conversions.toLocaleString("it-IT")}</p></CardContent></Card>
        <Card><CardContent className="pt-5"><p className="text-sm text-muted-foreground">Valore conversioni</p><p className="mt-1 text-2xl font-bold">{money(totals.revenue)}</p></CardContent></Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Link2 className="h-5 w-5" />Account pubblicitari</CardTitle>
          <CardDescription>
            Ogni account resta separato per tenant. I token OAuth restano esclusivamente server-side e cifrati a riposo.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => connect("google")}>Collega Google Ads</Button>
            <Button variant="outline" onClick={() => connect("meta")}>Collega Meta Ads</Button>
            <Button variant="outline" onClick={() => connect("tiktok")}>Collega TikTok Ads</Button>
          </div>
          {accounts.length === 0 ? (
            <div className="rounded-lg border border-dashed p-6 text-center text-muted-foreground">
              Nessun account collegato. Il primo collegamento importa automaticamente campagne e metriche.
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {accounts.map((account) => (
                <div key={account.id} className="rounded-lg border p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold">{providerLabel(account.provider)}</p>
                    <Badge variant={account.status === "connected" ? "default" : "secondary"}>{account.status}</Badge>
                  </div>
                  <p className="mt-2 text-sm font-medium">{account.name}</p>
                  <p className="text-xs text-muted-foreground">{account.external_account_id}</p>
                  {account.last_error && <p className="mt-2 text-xs text-destructive">{account.last_error}</p>}
                  <div className="mt-4 flex items-center justify-between gap-2">
                    <p className="text-xs text-muted-foreground">
                      {account.last_synced_at ? `Sync ${new Date(account.last_synced_at).toLocaleString("it-IT")}` : "Mai sincronizzato"}
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void syncAccount(account.id)}
                      disabled={syncingAccountId === account.id}
                    >
                      <RefreshCw className={`mr-1 h-3 w-3 ${syncingAccountId === account.id ? "animate-spin" : ""}`} />
                      Sincronizza
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><BarChart3 className="h-5 w-5" />Campagne</CardTitle>
          <CardDescription>
            Le campagne importate partono sempre in sola osservazione. Solo dopo opt-in HotelAccelerator puo inviare modifiche al provider.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="py-8 text-center text-muted-foreground">Caricamento...</p>
          ) : campaigns.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
              Collega un account: non vengono generati dati demo.
            </div>
          ) : (
            <div className="space-y-3">
              {campaigns.map((campaign) => {
                const currency = campaign.currency || "EUR"
                const active = isActiveStatus(campaign.status)
                const managed = campaign.management_mode !== "observe"
                return (
                  <div key={campaign.id} className="rounded-lg border p-4">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                      <div className="min-w-0 xl:max-w-sm">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold">{campaign.name}</p>
                          <Badge variant="outline">{providerLabel(campaign.provider)}</Badge>
                          <Badge variant={campaign.origin === "hotelaccelerator" ? "default" : "secondary"}>
                            {campaign.origin === "hotelaccelerator" ? "Creata da HA" : "Importata"}
                          </Badge>
                          <Badge variant={active ? "default" : "secondary"}>{campaign.status}</Badge>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">ID provider: {campaign.external_campaign_id}</p>
                        {campaign.objective && <p className="mt-1 text-xs text-muted-foreground">Obiettivo: {campaign.objective}</p>}
                      </div>

                      <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
                        <div><p className="text-muted-foreground">Spesa 30 gg</p><p className="font-semibold">{money(campaign.metrics_30d.spend, currency)}</p></div>
                        <div><p className="text-muted-foreground">Click</p><p className="font-semibold">{campaign.metrics_30d.clicks.toLocaleString("it-IT")}</p></div>
                        <div><p className="text-muted-foreground">Conversioni</p><p className="font-semibold">{campaign.metrics_30d.conversions.toLocaleString("it-IT")}</p></div>
                        <div><p className="text-muted-foreground">Valore</p><p className="font-semibold">{money(campaign.metrics_30d.conversion_value, currency)}</p></div>
                      </div>

                      <div className="space-y-2 xl:min-w-80">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline" className="gap-1">
                            {campaign.management_mode === "autopilot" ? <Bot className="h-3 w-3" /> : <MousePointerClick className="h-3 w-3" />}
                            {modeLabel(campaign.management_mode)}
                          </Badge>
                          {campaign.management_mode === "observe" ? (
                            <Button size="sm" onClick={() => void setMode(campaign.id, "assist")} disabled={savingId === campaign.id}>
                              Gestisci con HotelAccelerator
                            </Button>
                          ) : (
                            <>
                              <Button size="sm" variant="outline" onClick={() => void setMode(campaign.id, "observe")} disabled={savingId === campaign.id}>
                                Solo osservazione
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => void setMode(campaign.id, campaign.management_mode === "autopilot" ? "assist" : "autopilot")} disabled={savingId === campaign.id}>
                                <Bot className="mr-1 h-3 w-3" />
                                {campaign.management_mode === "autopilot" ? "Assistita" : "Autopilot"}
                              </Button>
                            </>
                          )}
                        </div>

                        {managed && (
                          <div className="flex flex-wrap items-center gap-2 rounded-md bg-muted/40 p-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => void mutateProvider(campaign.id, { active: !active })}
                              disabled={savingId === campaign.id}
                            >
                              {active ? <Pause className="mr-1 h-3 w-3" /> : <Play className="mr-1 h-3 w-3" />}
                              {active ? "Pausa" : "Riattiva"}
                            </Button>
                            <div className="flex min-w-52 flex-1 items-center gap-2">
                              <Input
                                type="number"
                                min="0.01"
                                step="0.01"
                                value={budgetDrafts[campaign.id] ?? ""}
                                onChange={(event) => setBudgetDrafts((current) => ({ ...current, [campaign.id]: event.target.value }))}
                                placeholder={campaign.budget_amount != null ? String(campaign.budget_amount) : "Budget"}
                                className="h-8"
                              />
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => void mutateProvider(campaign.id, { budget_amount: Number(budgetDrafts[campaign.id]) })}
                                disabled={savingId === campaign.id || !Number(budgetDrafts[campaign.id])}
                                title="Aggiorna il budget sul provider quando il budget e configurato a livello campagna"
                              >
                                <Save className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
