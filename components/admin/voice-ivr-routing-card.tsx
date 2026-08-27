"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { AlertCircle, CheckCircle2, Loader2, Save, Settings2 } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

type KnowledgeBase = { id: string; name: string; source_count: number }
type VoiceRoute = {
  id: string
  ivr_path: string
  intent_key: "customer_support" | "prospect_information"
  product_key: string
  agent_label: string
  knowledge_scope: "customer_product" | "hub_selected"
  primary_knowledge_base_id: string | null
  crm_tool_key: "customer_code_lookup" | "caller_lookup"
  fallback_mode: "tenant_policy" | "transfer"
  fallback_destination: string
  is_active: boolean
  status: "ready" | "missing_primary" | "empty_primary" | "invalid_reference" | "dynamic_tenant"
  shared_knowledge_bases: KnowledgeBase[]
}
type InternalKnowledgeSource = {
  product_key: string
  knowledge_base_id: string
  status: "pending" | "processing" | "ready" | "error"
}
type Payload = {
  routes: VoiceRoute[]
  knowledge_bases: KnowledgeBase[]
  internal_sync_available: boolean
  internal_sources: InternalKnowledgeSource[]
}

const PRODUCTS = [
  { key: "hotel-accelerator", label: "Hotel Accelerator" },
  { key: "santaddeo-rms", label: "Santaddeo RMS" },
  { key: "hotel-profit-ai", label: "Hotel Profit AI" },
  { key: "manubot", label: "ManuBot" },
] as const

function routeReady(route: VoiceRoute | undefined, bases: KnowledgeBase[]) {
  if (!route || !route.is_active) return false
  if (route.intent_key === "customer_support") return true
  const base = bases.find((candidate) => candidate.id === route.primary_knowledge_base_id)
  return Boolean(base && base.source_count > 0)
}

export function VoiceIvrRoutingCard() {
  const [payload, setPayload] = useState<Payload | null>(null)
  const [hidden, setHidden] = useState(false)
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [savedId, setSavedId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch("/api/telephony/3cx/voice/routes", { cache: "no-store" })
      if (response.status === 403 || response.status === 409) {
        setHidden(true)
        return
      }
      const data = await response.json().catch(() => null)
      if (!response.ok) {
        setError(data?.error || "Impossibile leggere la configurazione vocale 4BID.")
        return
      }
      setPayload(data as Payload)
    } catch {
      setError("Impossibile contattare il servizio di configurazione vocale.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const usableBases = useMemo(
    () => (payload?.knowledge_bases ?? []).filter((base) => base.source_count > 0),
    [payload?.knowledge_bases],
  )

  function patchRoute(routeId: string, patch: Partial<VoiceRoute>) {
    setPayload((current) =>
      current
        ? { ...current, routes: current.routes.map((route) => (route.id === routeId ? { ...route, ...patch } : route)) }
        : current,
    )
    setSavedId(null)
  }

  async function save(route: VoiceRoute) {
    setSavingId(route.id)
    setSavedId(null)
    setError(null)
    try {
      const response = await fetch("/api/telephony/3cx/voice/routes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          route_id: route.id,
          agent_label: route.agent_label,
          primary_knowledge_base_id: route.knowledge_scope === "hub_selected" ? route.primary_knowledge_base_id : null,
          shared_knowledge_base_ids:
            route.knowledge_scope === "hub_selected" ? route.shared_knowledge_bases.map((base) => base.id) : [],
          fallback_destination: route.fallback_destination,
          is_active: route.is_active,
        }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) {
        setError(data?.error || "Salvataggio non riuscito.")
        return
      }
      setPayload(data as Payload)
      setSavedId(route.id)
    } catch {
      setError("Impossibile salvare la configurazione vocale.")
    } finally {
      setSavingId(null)
    }
  }

  if (hidden) return null

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ha-brand-soft">
            <Settings2 className="h-5 w-5 text-ha-brand-soft-foreground" aria-hidden="true" />
          </div>
          <div>
            <CardTitle className="text-lg">Assistente vocale 4BID · configurazione avanzata</CardTitle>
            <CardDescription className="text-pretty">
              Area riservata al superadmin 4BID. Il chiamante parla liberamente: il sistema distingue supporto e
              informazioni e instrada il prodotto corretto senza menu a tasti.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Caricamento configurazione…
          </div>
        ) : null}

        {error ? (
          <Alert variant="destructive">
            <AlertCircle aria-hidden="true" />
            <AlertTitle>Configurazione non disponibile</AlertTitle>
            <AlertDescription className="space-y-2">
              <p>{error}</p>
              <Button variant="outline" size="sm" onClick={() => void load()}>Riprova</Button>
            </AlertDescription>
          </Alert>
        ) : null}

        {!loading && payload?.routes.length === 0 ? (
          <Alert>
            <AlertCircle aria-hidden="true" />
            <AlertTitle>Nessun prodotto vocale configurato</AlertTitle>
            <AlertDescription>La configurazione avanzata 4BID non contiene ancora percorsi vocali.</AlertDescription>
          </Alert>
        ) : null}

        {payload && PRODUCTS.map((product) => {
          const support = payload.routes.find(
            (route) => route.product_key === product.key && route.intent_key === "customer_support",
          )
          const prospect = payload.routes.find(
            (route) => route.product_key === product.key && route.intent_key === "prospect_information",
          )
          const supportReady = routeReady(support, payload.knowledge_bases)
          const prospectReady = routeReady(prospect, payload.knowledge_bases)
          const sync = prospect?.primary_knowledge_base_id
            ? payload.internal_sources.find(
                (source) =>
                  source.product_key === product.key && source.knowledge_base_id === prospect.primary_knowledge_base_id,
              )
            : undefined

          return (
            <section key={product.key} className="space-y-4 rounded-lg border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="font-semibold">{product.label}</h3>
                  <p className="text-xs text-muted-foreground">Supporto clienti + informazioni commerciali</p>
                </div>
                <div className="flex gap-2">
                  <Badge variant={supportReady ? "default" : "secondary"}>Supporto {supportReady ? "pronto" : "off"}</Badge>
                  <Badge variant={prospectReady ? "default" : "secondary"}>Info {prospectReady ? "pronte" : "da configurare"}</Badge>
                </div>
              </div>

              {support ? (
                <div className="rounded-md bg-muted/40 p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-medium">Assistenza clienti</p>
                      <p className="text-xs text-muted-foreground">
                        Il numero di licenza identifica il tenant; la risposta usa le basi del cliente, non quelle 4BID.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id={`support-active-${support.id}`}
                        checked={support.is_active}
                        onCheckedChange={(value) => patchRoute(support.id, { is_active: value === true })}
                      />
                      <Label htmlFor={`support-active-${support.id}`} className="font-normal">Attivo</Label>
                    </div>
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_140px_auto]">
                    <Input
                      aria-label={`Nome agente supporto ${product.label}`}
                      value={support.agent_label}
                      onChange={(event) => patchRoute(support.id, { agent_label: event.target.value })}
                    />
                    <Input
                      aria-label={`Fallback supporto ${product.label}`}
                      value={support.fallback_destination}
                      onChange={(event) => patchRoute(support.id, { fallback_destination: event.target.value })}
                    />
                    <Button size="sm" onClick={() => void save(support)} disabled={savingId !== null}>
                      {savingId === support.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                      Salva
                    </Button>
                  </div>
                  {savedId === support.id ? <p className="mt-2 flex items-center gap-1 text-xs text-ha-success"><CheckCircle2 className="h-4 w-4" /> Salvato</p> : null}
                </div>
              ) : null}

              {prospect ? (
                <div className="space-y-3 rounded-md bg-muted/40 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-medium">Informazioni commerciali</p>
                      <p className="text-xs text-muted-foreground">
                        Scegli una base 4BID già popolata. La sincronizzazione da repository è opzionale e viene mostrata solo come diagnostica.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id={`prospect-active-${prospect.id}`}
                        checked={prospect.is_active}
                        onCheckedChange={(value) => patchRoute(prospect.id, { is_active: value === true })}
                      />
                      <Label htmlFor={`prospect-active-${prospect.id}`} className="font-normal">Attivo</Label>
                    </div>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="grid gap-2">
                      <Label>Knowledge base</Label>
                      <Select
                        value={prospect.primary_knowledge_base_id ?? "none"}
                        onValueChange={(value) =>
                          patchRoute(prospect.id, {
                            primary_knowledge_base_id: value === "none" ? null : value,
                            shared_knowledge_bases: prospect.shared_knowledge_bases.filter((base) => base.id !== value),
                          })
                        }
                      >
                        <SelectTrigger><SelectValue placeholder="Scegli una base" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Nessuna base</SelectItem>
                          {usableBases.map((base) => (
                            <SelectItem key={base.id} value={base.id}>{base.name} · {base.source_count} fonti</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {sync ? (
                        <p className="text-xs text-muted-foreground">Fonte repository: {sync.status === "ready" ? "sincronizzata" : sync.status}</p>
                      ) : null}
                    </div>
                    <div className="grid gap-2">
                      <Label>Interno operatore</Label>
                      <Input
                        value={prospect.fallback_destination}
                        onChange={(event) => patchRoute(prospect.id, { fallback_destination: event.target.value })}
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <Input
                      className="max-w-md"
                      aria-label={`Nome agente informazioni ${product.label}`}
                      value={prospect.agent_label}
                      onChange={(event) => patchRoute(prospect.id, { agent_label: event.target.value })}
                    />
                    <Button
                      size="sm"
                      onClick={() => void save(prospect)}
                      disabled={savingId !== null || !prospect.primary_knowledge_base_id}
                    >
                      {savingId === prospect.id ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                      Salva informazioni
                    </Button>
                  </div>
                  {savedId === prospect.id ? <p className="flex items-center gap-1 text-xs text-ha-success"><CheckCircle2 className="h-4 w-4" /> Salvato</p> : null}
                </div>
              ) : null}
            </section>
          )
        })}
      </CardContent>
    </Card>
  )
}
