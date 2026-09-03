"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { AlertCircle, BarChart3, Bot, Link2, Megaphone, MousePointerClick, RefreshCw, Sparkles, WalletCards } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
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

function money(value: number, currency = "EUR") {
  return new Intl.NumberFormat("it-IT", { style: "currency", currency }).format(value)
}

function modeLabel(mode: AdvertisingManagementMode) {
  if (mode === "assist") return "Assistita"
  if (mode === "autopilot") return "Autopilot"
  return "Solo osservazione"
}

export default function SmartAdsPage() {
  const [accounts, setAccounts] = useState<AdvertisingAccount[]>([])
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [accountsRes, campaignsRes] = await Promise.all([
        fetch("/api/admin/marketing/ads/accounts", { cache: "no-store" }),
        fetch("/api/admin/marketing/ads/campaigns", { cache: "no-store" }),
      ])
      if (!accountsRes.ok || !campaignsRes.ok) throw new Error("Impossibile caricare Smart Ads")
      setAccounts(await accountsRes.json())
      setCampaigns(await campaignsRes.json())
    } catch (e) {
      setError(e instanceof Error ? e.message : "Errore durante il caricamento")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
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
    } catch (e) {
      setError(e instanceof Error ? e.message : "Modifica non riuscita")
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
            Collega Google, Meta e TikTok, importa le campagne esistenti e gestiscile senza entrare nei pannelli pubblicitari.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Aggiorna
          </Button>
          <Button disabled title="Il wizard di creazione campagne viene collegato nella fase provider/OAuth">
            <Sparkles className="mr-2 h-4 w-4" />
            Crea campagna
          </Button>
        </div>
      </div>

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
            Gli account del cliente restano separati. In modalita gestita 4BID ogni tenant avra comunque un proprio ad account dedicato.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {accounts.length === 0 ? (
            <div className="rounded-lg border border-dashed p-6 text-center">
              <p className="font-medium">Nessun account pubblicitario collegato</p>
              <p className="mt-1 text-sm text-muted-foreground">
                La UI e il modello dati sono pronti; il collegamento OAuth provider viene abilitato solo quando le relative credenziali e autorizzazioni sono configurate.
              </p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <Button variant="outline" disabled>Collega Google Ads</Button>
                <Button variant="outline" disabled>Collega Meta</Button>
                <Button variant="outline" disabled>Collega TikTok</Button>
              </div>
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-3">
              {accounts.map((account) => (
                <div key={account.id} className="rounded-lg border p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold">{providerLabel(account.provider)}</p>
                    <Badge variant={account.status === "connected" ? "default" : "secondary"}>{account.status}</Badge>
                  </div>
                  <p className="mt-2 text-sm">{account.name}</p>
                  <p className="text-xs text-muted-foreground">{account.external_account_id}</p>
                  <p className="mt-3 text-xs text-muted-foreground">
                    {account.connection_mode === "managed_4bid" ? "Gestito da 4BID" : "Account del cliente"}
                  </p>
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
            Le campagne importate sono sempre in sola osservazione finche il cliente non autorizza esplicitamente la gestione HotelAccelerator.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="py-8 text-center text-muted-foreground">Caricamento...</p>
          ) : campaigns.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
              Collega un account e importa le campagne esistenti. Nessun dato demo viene generato.
            </div>
          ) : (
            <div className="space-y-3">
              {campaigns.map((campaign) => {
                const currency = campaign.currency || "EUR"
                return (
                  <div key={campaign.id} className="rounded-lg border p-4">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold">{campaign.name}</p>
                          <Badge variant="outline">{providerLabel(campaign.provider)}</Badge>
                          <Badge variant={campaign.origin === "hotelaccelerator" ? "default" : "secondary"}>
                            {campaign.origin === "hotelaccelerator" ? "Creata da HA" : "Importata"}
                          </Badge>
                          <Badge variant="outline">{campaign.status}</Badge>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">ID provider: {campaign.external_campaign_id}</p>
                      </div>

                      <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
                        <div><p className="text-muted-foreground">Spesa 30 gg</p><p className="font-semibold">{money(campaign.metrics_30d.spend, currency)}</p></div>
                        <div><p className="text-muted-foreground">Click</p><p className="font-semibold">{campaign.metrics_30d.clicks.toLocaleString("it-IT")}</p></div>
                        <div><p className="text-muted-foreground">Conversioni</p><p className="font-semibold">{campaign.metrics_30d.conversions.toLocaleString("it-IT")}</p></div>
                        <div><p className="text-muted-foreground">Valore</p><p className="font-semibold">{money(campaign.metrics_30d.conversion_value, currency)}</p></div>
                      </div>

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
                          <Button size="sm" variant="outline" onClick={() => void setMode(campaign.id, "observe")} disabled={savingId === campaign.id}>
                            Torna a sola osservazione
                          </Button>
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

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><WalletCards className="h-5 w-5" />Modalita Managed 4BID</CardTitle>
          <CardDescription>
            Fondazione pronta per wallet prepagato e ad account separato per tenant. La regola commerciale 50 euro incassati / massimo 40 euro di media spend sara applicata dal ledger, non dalla UI.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  )
}
