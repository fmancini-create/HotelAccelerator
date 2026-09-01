"use client"

import { useEffect, useMemo, useState } from "react"
import { AlertTriangle, Ban, CheckCircle2, Circle, Code2, Loader2, PauseCircle, Rocket, Search } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"

type DevelopmentStatus = "planned" | "in_progress" | "blocked" | "abandoned" | "completed"

type RoadmapItem = {
  roadmap_key: string
  area: string
  capability: string
  code_ready: boolean
  online_ready: boolean
  development_status: DevelopmentStatus
  branch_name: string | null
  pr_number: number | null
  started_at: string | null
  completed_at: string | null
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

const DEVELOPMENT_LABELS: Record<DevelopmentStatus, string> = {
  planned: "Da fare",
  in_progress: "In sviluppo",
  blocked: "Bloccato",
  abandoned: "Abbandonato",
  completed: "Online",
}

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

function statusClasses(status: DevelopmentStatus) {
  switch (status) {
    case "completed":
      return "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300"
    case "in_progress":
      return "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-300"
    case "blocked":
      return "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300"
    case "abandoned":
      return "border-muted bg-muted/40 text-muted-foreground"
    default:
      return "border-border bg-background text-muted-foreground"
  }
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
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  const updateStatus = async (item: RoadmapItem, value: DevelopmentStatus) => {
    if (value === "completed") return
    const previous = item
    const optimistic = { ...item, development_status: value }
    setError(null)
    setSavingKey(item.roadmap_key)
    setItems((current) => current.map((row) => (row.roadmap_key === item.roadmap_key ? optimistic : row)))

    try {
      const response = await fetch("/api/super-admin/roadmap", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roadmapKey: item.roadmap_key, field: "status", value }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || "Aggiornamento non riuscito")
      setItems((current) => current.map((row) => (row.roadmap_key === item.roadmap_key ? payload.item : row)))
    } catch (saveError) {
      setItems((current) => current.map((row) => (row.roadmap_key === item.roadmap_key ? previous : row)))
      setError(saveError instanceof Error ? saveError.message : "Errore durante il salvataggio")
    } finally {
      setSavingKey(null)
    }
  }

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return items
    return items.filter((item) =>
      `${item.area} ${item.capability} ${item.note ?? ""} ${item.branch_name ?? ""} ${item.pr_number ?? ""} ${DEVELOPMENT_LABELS[item.development_status]}`
        .toLowerCase()
        .includes(needle),
    )
  }, [items, query])

  const counts = useMemo(() => {
    return items.reduce<Record<DevelopmentStatus, number>>(
      (acc, item) => {
        acc[item.development_status] += 1
        return acc
      },
      { planned: 0, in_progress: 0, blocked: 0, abandoned: 0, completed: 0 },
    )
  }, [items])

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="space-y-4">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Governance prodotto</p>
          <h1 className="text-2xl font-semibold tracking-tight">Roadmap HotelAccelerator</h1>
          <p className="mt-1 max-w-4xl text-sm text-muted-foreground">
            Questa pagina e la memoria operativa degli sviluppi. Ogni nuova funzionalita o PR dedicata deve comparire
            qui appena parte. Una riga diventa <strong className="text-emerald-700 dark:text-emerald-400">verde / Online</strong>
            solo dopo merge in <strong>main</strong> e deploy di produzione verificato.
          </p>
        </div>

        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <div className="rounded-lg border bg-card px-4 py-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground"><Circle className="h-4 w-4" />Da fare</div>
            <div className="mt-1 text-2xl font-semibold">{counts.planned}</div>
          </div>
          <div className="rounded-lg border border-blue-200 bg-blue-50/60 px-4 py-3 dark:border-blue-900 dark:bg-blue-950/20">
            <div className="flex items-center gap-2 text-xs text-blue-700 dark:text-blue-300"><Code2 className="h-4 w-4" />In sviluppo</div>
            <div className="mt-1 text-2xl font-semibold">{counts.in_progress}</div>
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50/60 px-4 py-3 dark:border-amber-900 dark:bg-amber-950/20">
            <div className="flex items-center gap-2 text-xs text-amber-800 dark:text-amber-300"><AlertTriangle className="h-4 w-4" />Bloccati</div>
            <div className="mt-1 text-2xl font-semibold">{counts.blocked}</div>
          </div>
          <div className="rounded-lg border bg-muted/30 px-4 py-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground"><Ban className="h-4 w-4" />Abbandonati</div>
            <div className="mt-1 text-2xl font-semibold">{counts.abandoned}</div>
          </div>
          <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 px-4 py-3 dark:border-emerald-900 dark:bg-emerald-950/20">
            <div className="flex items-center gap-2 text-xs text-emerald-700 dark:text-emerald-300"><Rocket className="h-4 w-4" />Online</div>
            <div className="mt-1 text-2xl font-semibold">{counts.completed}</div>
          </div>
        </div>
      </div>

      <div className="rounded-lg border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
        <strong>Regola:</strong> l agente che apre uno sviluppo deve creare o aggiornare la riga nello stesso momento.
        Se il lavoro si ferma, va marcato <strong>Bloccato</strong> o <strong>Abbandonato</strong>. Il livello tecnico
        ufficiale resta separato: Idea, Specifica, UI/mock, Codice, Demo, Tenant reale, Multi-tenant,
        Production-ready, Vendibile.
      </div>

      <div className="relative max-w-lg">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Cerca funzione, area, stato, branch o PR..."
          className="pl-9"
        />
      </div>

      {error && (
        <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="hidden grid-cols-[120px_1fr_160px_130px] gap-4 border-b bg-muted/40 px-4 py-3 text-xs font-medium uppercase tracking-wide text-muted-foreground lg:grid">
          <span>Area</span>
          <span>Funzione / cosa manca</span>
          <span>Lavoro</span>
          <span>Codice</span>
        </div>
        {loading ? (
          <div className="flex items-center justify-center gap-2 px-4 py-12 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />Caricamento roadmap...
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-muted-foreground">Nessuna funzione trovata.</div>
        ) : (
          <div className="divide-y">
            {filtered.map((item) => {
              const saving = savingKey === item.roadmap_key
              const officialState = readOfficialState(item.note)
              const evidence = withoutOfficialState(item.note)
              const trulyOnline = item.development_status === "completed" && item.code_ready && item.online_ready

              return (
                <div
                  key={item.roadmap_key}
                  className={`grid gap-4 px-4 py-4 lg:grid-cols-[120px_1fr_160px_130px] lg:items-start ${
                    trulyOnline ? "bg-emerald-50/40 dark:bg-emerald-950/15" : item.development_status === "abandoned" ? "opacity-65" : ""
                  }`}
                >
                  <div className="text-xs font-medium text-muted-foreground">{item.area}</div>

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`text-sm font-medium ${item.development_status === "abandoned" ? "line-through" : ""}`}>
                        {item.capability}
                      </span>
                      {officialState && <Badge variant="outline">{officialState}</Badge>}
                      {item.pr_number && <Badge variant="secondary">PR #{item.pr_number}</Badge>}
                    </div>
                    {evidence && <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{evidence}</p>}
                    {item.branch_name && (
                      <p className="mt-2 break-all font-mono text-[11px] text-muted-foreground">{item.branch_name}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <div className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs font-medium ${statusClasses(item.development_status)}`}>
                      {saving ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : item.development_status === "completed" ? (
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      ) : item.development_status === "blocked" ? (
                        <PauseCircle className="h-3.5 w-3.5" />
                      ) : item.development_status === "abandoned" ? (
                        <Ban className="h-3.5 w-3.5" />
                      ) : (
                        <Circle className="h-3.5 w-3.5" />
                      )}
                      {DEVELOPMENT_LABELS[item.development_status]}
                    </div>

                    {item.development_status !== "completed" && (
                      <select
                        value={item.development_status}
                        disabled={saving}
                        onChange={(event) => void updateStatus(item, event.target.value as DevelopmentStatus)}
                        aria-label={`Stato lavoro ${item.capability}`}
                        className="h-8 w-full rounded-md border bg-background px-2 text-xs"
                      >
                        <option value="planned">Da fare</option>
                        <option value="in_progress">In sviluppo</option>
                        <option value="blocked">Bloccato</option>
                        <option value="abandoned">Abbandonato</option>
                      </select>
                    )}
                  </div>

                  <div className="space-y-2 text-xs">
                    <div className="flex items-center gap-2">
                      <span className={`h-2.5 w-2.5 rounded-full ${item.code_ready ? "bg-emerald-500" : "bg-muted-foreground/25"}`} />
                      <span className="text-muted-foreground">{item.code_ready ? "In main" : "Non in main"}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`h-2.5 w-2.5 rounded-full ${item.online_ready ? "bg-emerald-500" : "bg-muted-foreground/25"}`} />
                      <span className="text-muted-foreground">{item.online_ready ? "Deploy prod" : "Non online"}</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Il verde non e modificabile manualmente dalla pagina: viene assegnato soltanto a sviluppo chiuso, mergiato in main e presente nel deploy di produzione verificato.
      </p>
    </div>
  )
}
