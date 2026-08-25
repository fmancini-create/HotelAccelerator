"use client"

import { useCallback, useEffect, useState } from "react"
import { AlertCircle, CheckCircle2, Loader2, Route, Save } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

type KnowledgeBase = {
  id: string
  name: string
  source_count: number
}

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

const STATUS_LABELS: Record<VoiceRoute["status"], string> = {
  ready: "Pronto",
  missing_primary: "Scegli la base primaria",
  empty_primary: "Base primaria senza fonti",
  invalid_reference: "Riferimento non valido",
  dynamic_tenant: "Tenant cliente",
}

const SYNC_STATUS_LABELS: Record<InternalKnowledgeSource["status"], string> = {
  pending: "In attesa di indicizzazione",
  processing: "Indicizzazione in corso",
  ready: "Pronta",
  error: "Errore di indicizzazione",
}

export function VoiceIvrRoutingCard() {
  const [payload, setPayload] = useState<Payload | null>(null)
  const [hidden, setHidden] = useState(false)
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [savedId, setSavedId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    setLoading(true)
    try {
      const response = await fetch("/api/telephony/3cx/voice/routes", { cache: "no-store" })
      if (response.status === 403 || response.status === 409) {
        setHidden(true)
        return
      }
      const data = await response.json().catch(() => null)
      if (!response.ok) {
        setError(data?.error || "Impossibile leggere la mappa IVR.")
        return
      }
      setPayload(data as Payload)
    } catch {
      setError("Impossibile contattare il servizio di configurazione IVR.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  function patchRoute(routeId: string, patch: Partial<VoiceRoute>) {
    setPayload((current) =>
      current
        ? { ...current, routes: current.routes.map((route) => (route.id === routeId ? { ...route, ...patch } : route)) }
        : current,
    )
    setSavedId(null)
  }

  function toggleShared(route: VoiceRoute, base: KnowledgeBase, checked: boolean) {
    const shared = checked
      ? [...route.shared_knowledge_bases, base]
      : route.shared_knowledge_bases.filter((candidate) => candidate.id !== base.id)
    patchRoute(route.id, { shared_knowledge_bases: shared })
  }

  async function save(route: VoiceRoute) {
    setSavingId(route.id)
    setError(null)
    setSavedId(null)
    try {
      const response = await fetch("/api/telephony/3cx/voice/routes", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          route_id: route.id,
          agent_label: route.agent_label,
          primary_knowledge_base_id:
            route.knowledge_scope === "hub_selected" ? route.primary_knowledge_base_id : null,
          shared_knowledge_base_ids:
            route.knowledge_scope === "hub_selected" ? route.shared_knowledge_bases.map((base) => base.id) : [],
          fallback_destination: route.fallback_destination,
          is_active: route.is_active,
        }),
      })
      const data = await response.json().catch(() => null)
      if (!response.ok) {
        setError(data?.error || "Salvataggio della route non riuscito.")
        return
      }
      setPayload(data as Payload)
      setSavedId(route.id)
    } catch {
      setError("Impossibile contattare il servizio di configurazione IVR.")
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
            <Route className="h-5 w-5 text-ha-brand-soft-foreground" aria-hidden="true" />
          </div>
          <div>
            <CardTitle className="text-lg">Mappa IVR 4 BID</CardTitle>
            <CardDescription className="text-pretty">
              Configurazione superadmin dei due menu: intento, agente, basi autorizzate, tool CRM e destinazione di
              fallback.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Caricamento della mappa IVR…
          </div>
        ) : null}

        {error ? (
          <Alert variant="destructive">
            <AlertCircle aria-hidden="true" />
            <AlertTitle>Configurazione non disponibile</AlertTitle>
            <AlertDescription>
              <p>{error}</p>
              <Button variant="outline" size="sm" onClick={() => void load()}>
                Riprova
              </Button>
            </AlertDescription>
          </Alert>
        ) : null}

        {!loading && payload?.routes.length === 0 ? (
          <Alert>
            <AlertCircle aria-hidden="true" />
            <AlertTitle>Nessun percorso configurato</AlertTitle>
            <AlertDescription>Applica la migrazione IVR e ricarica questa pagina.</AlertDescription>
          </Alert>
        ) : null}

        {payload?.routes.map((route) => {
          const isProspect = route.knowledge_scope === "hub_selected"
          const internalPrimary = payload.internal_sources.find((source) => source.product_key === route.product_key)
          const internalPrimaryBase = internalPrimary
            ? payload.knowledge_bases.find((base) => base.id === internalPrimary.knowledge_base_id) ?? null
            : null
          const readyInternalBases = payload.internal_sources
            .filter((source) => source.status === "ready" && source.knowledge_base_id !== route.primary_knowledge_base_id)
            .flatMap((source) => {
              const base = payload.knowledge_bases.find((candidate) => candidate.id === source.knowledge_base_id)
              return base ? [base] : []
            })
          const readyInternalBaseIds = new Set(readyInternalBases.map((base) => base.id))
          const invalidSelectedShared = route.shared_knowledge_bases.filter((base) => !readyInternalBaseIds.has(base.id))
          const availableShared = [
            ...readyInternalBases,
            ...invalidSelectedShared.filter((base) => !readyInternalBaseIds.has(base.id)),
          ]
          const prospectReady =
            !isProspect
            || (internalPrimary?.status === "ready" && route.primary_knowledge_base_id === internalPrimary.knowledge_base_id)
          const ready = route.status === "ready" || route.status === "dynamic_tenant"
          return (
            <section key={route.id} className="space-y-4 rounded-lg border p-4" aria-labelledby={`route-${route.id}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p id={`route-${route.id}`} className="font-medium">
                    {route.ivr_path} · {route.agent_label}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {route.intent_key === "customer_support" ? "Assistenza clienti" : "Informazioni commerciali"}
                    {" · "}tool CRM: {route.crm_tool_key === "customer_code_lookup" ? "codice cliente" : "riconoscimento chiamante"}
                  </p>
                </div>
                <Badge variant={ready && route.is_active ? "default" : "secondary"}>
                  {route.is_active ? STATUS_LABELS[route.status] : "Disattivato"}
                </Badge>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor={`agent-${route.id}`}>Nome agente vocale</Label>
                  <Input
                    id={`agent-${route.id}`}
                    value={route.agent_label}
                    maxLength={120}
                    onChange={(event) => patchRoute(route.id, { agent_label: event.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor={`fallback-${route.id}`}>Interno di fallback</Label>
                  <Input
                    id={`fallback-${route.id}`}
                    value={route.fallback_destination}
                    maxLength={30}
                    onChange={(event) => patchRoute(route.id, { fallback_destination: event.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">
                    {route.fallback_mode === "tenant_policy"
                      ? "Fuori orario prevale la politica del tenant cliente."
                      : "Usato quando la risposta non è fondata o viene chiesto un operatore."}
                  </p>
                </div>
              </div>

              {isProspect ? (
                <div className="space-y-3 rounded-md bg-muted/40 p-3">
                  {!payload.internal_sync_available ? (
                    <Alert variant="destructive">
                      <AlertCircle aria-hidden="true" />
                      <AlertTitle>Sincronizzazione interna non disponibile</AlertTitle>
                      <AlertDescription>Applica prima la migrazione delle fonti interne 4BID.</AlertDescription>
                    </Alert>
                  ) : !internalPrimary || !internalPrimaryBase ? (
                    <Alert variant="destructive">
                      <AlertCircle aria-hidden="true" />
                      <AlertTitle>Fonte interna del prodotto assente</AlertTitle>
                      <AlertDescription>
                        Esegui il workflow di sincronizzazione su <code>main</code> per questo prodotto prima di configurare
                        il percorso.
                      </AlertDescription>
                    </Alert>
                  ) : internalPrimary.status !== "ready" ? (
                    <Alert>
                      <Loader2 className="h-4 w-4" aria-hidden="true" />
                      <AlertTitle>Fonte interna: {SYNC_STATUS_LABELS[internalPrimary.status]}</AlertTitle>
                      <AlertDescription>
                        Attendi una fonte pronta prima di assegnarla al centralino. Il percorso continuerà a usare il fallback.
                      </AlertDescription>
                    </Alert>
                  ) : (
                    <div className="grid gap-2">
                      <Label>Knowledge base primaria 4 BID</Label>
                      <Select
                        value={route.primary_knowledge_base_id ?? "none"}
                        onValueChange={(value) =>
                          patchRoute(route.id, {
                            primary_knowledge_base_id: value === "none" ? null : value,
                            shared_knowledge_bases: route.shared_knowledge_bases.filter((base) => base.id !== value),
                          })
                        }
                      >
                        <SelectTrigger className="w-full" aria-label={`Base primaria per ${route.agent_label}`}>
                          <SelectValue placeholder="Scegli la base primaria" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Nessuna base selezionata</SelectItem>
                          <SelectItem value={internalPrimaryBase.id}>
                            {internalPrimaryBase.name} · fonte interna pronta
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <fieldset className="space-y-2">
                    <legend className="text-sm font-medium">Knowledge base condivise interne 4 BID</legend>
                    {availableShared.length === 0 ? (
                      <p className="text-xs text-muted-foreground">Non ci sono altre fonti interne pronte disponibili.</p>
                    ) : (
                      availableShared.map((base) => {
                        const checked = route.shared_knowledge_bases.some((candidate) => candidate.id === base.id)
                        const eligible = readyInternalBaseIds.has(base.id)
                        return (
                          <div key={base.id} className="flex items-center gap-2">
                            <Checkbox
                              id={`shared-${route.id}-${base.id}`}
                              checked={checked}
                              disabled={!eligible && !checked}
                              onCheckedChange={(value) => {
                                if (eligible || checked) toggleShared(route, base, value === true)
                              }}
                            />
                            <Label htmlFor={`shared-${route.id}-${base.id}`} className="font-normal">
                              {base.name} · {eligible ? "fonte interna pronta" : "riferimento da rimuovere"}
                            </Label>
                          </div>
                        )
                      })
                    )}
                  </fieldset>
                </div>
              ) : (
                <Alert>
                  <AlertCircle aria-hidden="true" />
                  <AlertTitle>Basi del tenant cliente, mai basi 4 BID</AlertTitle>
                  <AlertDescription>
                    Dopo la verifica del codice cliente, la primaria usa il marker <code>[voice:{route.product_key}]</code>
                    {" "}e le condivise <code>[voice-shared:{route.product_key}]</code>, cercati soltanto nel tenant risolto.
                  </AlertDescription>
                </Alert>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id={`active-${route.id}`}
                    checked={route.is_active}
                    onCheckedChange={(value) => patchRoute(route.id, { is_active: value === true })}
                  />
                  <Label htmlFor={`active-${route.id}`} className="font-normal">Percorso attivo</Label>
                </div>
                <div className="flex items-center gap-2">
                  {savedId === route.id ? (
                    <span className="flex items-center gap-1 text-xs text-ha-success" role="status">
                      <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Salvato
                    </span>
                  ) : null}
                  <Button
                    size="sm"
                    onClick={() => save(route)}
                    disabled={
                      savingId !== null
                      || !route.agent_label.trim()
                      || !route.fallback_destination.trim()
                      || !prospectReady
                      || invalidSelectedShared.length > 0
                    }
                  >
                    {savingId === route.id ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <Save className="mr-2 h-4 w-4" aria-hidden="true" />
                    )}
                    Salva percorso
                  </Button>
                </div>
              </div>
            </section>
          )
        })}
      </CardContent>
    </Card>
  )
}
