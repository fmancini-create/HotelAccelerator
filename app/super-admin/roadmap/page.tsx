"use client"

import { useEffect, useMemo, useState } from "react"
import { CheckCircle2, Circle, Code2, Loader2, Rocket, Search } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"

type RoadmapItem = {
  roadmap_key: string
  area: string
  capability: string
  code_ready: boolean
  online_ready: boolean
  note: string | null
  sort_order: number
  updated_by_email: string | null
  updated_at: string
}

const OFFICIAL_STATES = [
  "Idea",
  "Specifica",
  "UI/mock",
  "Codice",
  "Demo",
  "Tenant reale",
  "Multi-tenant",
  "Production-ready",
  "Vendibile",
] as const

type OfficialState = (typeof OFFICIAL_STATES)[number]

function readOfficialState(note: string | null): OfficialState | null {
  if (!note) return null
  const prefix = "Stato ufficiale:"
  if (!note.startsWith(prefix)) return null
  const candidate = note.slice(prefix.length).trim().split(/[.;]/, 1)[0]?.trim()
  return OFFICIAL_STATES.find((state) => state === candidate) ?? null
}

function withoutOfficialState(note: string | null) {
  if (!note) return null
  return note.replace(/^Stato ufficiale:\s*[^.;]+[.;]?\s*/i, "").trim() || null
}

export default function ProductRoadmapPage() {
  const [items, setItems] = useState<RoadmapItem[]>([])
  const [query, setQuery] = useState("")
  const [loading, setLoading] = useState(true)
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const response = await fetch("/api/super-admin/roadmap", { cache: "no-store" })
        if (!response.ok) throw new Error("Impossibile caricare la roadmap")
        const payload = await response.json()
        if (!cancelled) setItems(payload.items ?? [])
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Errore caricamento roadmap")
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  const update = async (item: RoadmapItem, field: "code" | "online", value: boolean) => {
    const previous = item
    const optimistic: RoadmapItem = {
      ...item,
      code_ready: field === "code" ? value : item.code_ready,
      online_ready: field === "online" ? value : item.online_ready,
    }

    if (optimistic.online_ready && !optimistic.code_ready) {
      setError("Prima attiva In main: un deploy non puo essere segnato senza implementazione nel repository.")
      return
    }

    setError(null)
    setSavingKey(item.roadmap_key)
    setItems((current) =>
      current.map((row) => (row.roadmap_key === item.roadmap_key ? optimistic : row)),
    )

    try {
      const response = await fetch("/api/super-admin/roadmap", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roadmapKey: item.roadmap_key, field, value }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || "Aggiornamento non riuscito")
      setItems((current) =>
        current.map((row) => (row.roadmap_key === item.roadmap_key ? payload.item : row)),
      )
    } catch (saveError) {
      setItems((current) =>
        current.map((row) => (row.roadmap_key === item.roadmap_key ? previous : row)),
      )
      setError(saveError instanceof Error ? saveError.message : "Errore durante il salvataggio")
    } finally {
      setSavingKey(null)
    }
  }

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return items
    return items.filter((item) =>
      `${item.area} ${item.capability} ${item.note ?? ""}`.toLowerCase().includes(needle),
    )
  }, [items, query])

  const codeCount = items.filter((item) => item.code_ready).length
  const deployedCount = items.filter((item) => item.code_ready && item.online_ready).length

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Governance prodotto</p>
          <h1 className="text-2xl font-semibold tracking-tight">Roadmap HotelAccelerator</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Snapshot tecnico riallineato al repository. <strong>In main</strong> significa che esiste
            implementazione verificabile nel codice; <strong>Deploy prod</strong> significa soltanto che quella
            implementazione e inclusa nel deploy di produzione. Non equivale a Production-ready o Vendibile.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:min-w-[310px]">
          <div className="rounded-lg border bg-card px-4 py-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Code2 className="h-4 w-4" aria-hidden /> In main
            </div>
            <div className="mt-1 text-2xl font-semibold">{codeCount}</div>
            <div className="text-xs text-muted-foreground">su {items.length} capability</div>
          </div>
          <div className="rounded-lg border bg-card px-4 py-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Rocket className="h-4 w-4" aria-hidden /> Deploy prod
            </div>
            <div className="mt-1 text-2xl font-semibold">{deployedCount}</div>
            <div className="text-xs text-muted-foreground">senza promozione automatica</div>
          </div>
        </div>
      </div>

      <div className="rounded-lg border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
        Il <strong>livello ufficiale</strong> e mostrato per ogni riga e segue esclusivamente: Idea, Specifica,
        UI/mock, Codice, Demo, Tenant reale, Multi-tenant, Production-ready, Vendibile. Le note indicano evidenza e
        verifica residua.
      </div>

      <div className="relative max-w-lg">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Cerca funzione, area, stato o PR..."
          className="pl-9"
        />
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="hidden grid-cols-[130px_1fr_110px_110px_140px] gap-3 border-b bg-muted/40 px-4 py-3 text-xs font-medium uppercase tracking-wide text-muted-foreground md:grid">
          <span>Area</span>
          <span>Funzione / evidenza</span>
          <span>In main</span>
          <span>Deploy prod</span>
          <span>Snapshot</span>
        </div>
        {loading ? (
          <div className="flex items-center justify-center gap-2 px-4 py-12 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Caricamento roadmap...
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-muted-foreground">Nessuna funzione trovata.</div>
        ) : (
          <div className="divide-y">
            {filtered.map((item) => {
              const deployed = item.code_ready && item.online_ready
              const saving = savingKey === item.roadmap_key
              const officialState = readOfficialState(item.note)
              const evidence = withoutOfficialState(item.note)

              return (
                <div
                  key={item.roadmap_key}
                  className={`grid gap-3 px-4 py-4 md:grid-cols-[130px_1fr_110px_110px_140px] md:items-center ${
                    deployed ? "bg-emerald-50/40 dark:bg-emerald-950/15" : ""
                  }`}
                >
                  <div className="text-xs font-medium text-muted-foreground">{item.area}</div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{item.capability}</span>
                      {officialState && <Badge variant="outline">{officialState}</Badge>}
                    </div>
                    {evidence && <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{evidence}</p>}
                  </div>
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Switch
                      checked={item.code_ready}
                      disabled={saving || item.online_ready}
                      onCheckedChange={(value) => update(item, "code", value)}
                      aria-label={`In main ${item.capability}`}
                    />
                    In main
                  </label>
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Switch
                      checked={item.online_ready}
                      disabled={saving || !item.code_ready}
                      onCheckedChange={(value) => update(item, "online", value)}
                      aria-label={`Deploy prod ${item.capability}`}
                    />
                    Prod
                  </label>
                  <div
                    className={`flex items-center gap-2 text-sm font-medium ${
                      deployed ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground"
                    }`}
                  >
                    {saving ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : deployed ? (
                      <CheckCircle2 className="h-4 w-4" />
                    ) : (
                      <Circle className="h-4 w-4" />
                    )}
                    {saving ? "Salvataggio" : deployed ? "Deploy prod" : item.code_ready ? "Solo main" : "Non in main"}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        I due switch sono flag operativi e vengono auditati. Il livello tecnico ufficiale resta documentato in
        MODULE_REGISTRY.md: un deploy riuscito non promuove automaticamente una funzione a Tenant reale,
        Multi-tenant o Production-ready.
      </p>
    </div>
  )
}
