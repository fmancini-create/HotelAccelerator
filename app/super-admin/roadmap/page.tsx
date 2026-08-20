"use client"

import { useEffect, useMemo, useState } from "react"
import { CheckCircle2, Circle, Loader2, Search } from "lucide-react"
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
    return () => { cancelled = true }
  }, [])

  const update = async (item: RoadmapItem, field: "code" | "online", value: boolean) => {
    const previous = item
    const optimistic: RoadmapItem = {
      ...item,
      code_ready: field === "code" ? value : item.code_ready,
      online_ready: field === "online" ? value : item.online_ready,
    }

    if (optimistic.online_ready && !optimistic.code_ready) {
      setError("Prima attiva Codice: una funzione non puo essere Online senza codice.")
      return
    }

    setError(null)
    setSavingKey(item.roadmap_key)
    setItems((current) => current.map((row) => row.roadmap_key === item.roadmap_key ? optimistic : row))

    try {
      const response = await fetch("/api/super-admin/roadmap", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roadmapKey: item.roadmap_key, field, value }),
      })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || "Aggiornamento non riuscito")
      setItems((current) => current.map((row) => row.roadmap_key === item.roadmap_key ? payload.item : row))
    } catch (saveError) {
      setItems((current) => current.map((row) => row.roadmap_key === item.roadmap_key ? previous : row))
      setError(saveError instanceof Error ? saveError.message : "Errore durante il salvataggio")
    } finally {
      setSavingKey(null)
    }
  }

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return items
    return items.filter((item) => `${item.area} ${item.capability}`.toLowerCase().includes(needle))
  }, [items, query])

  const onlineCount = items.filter((item) => item.code_ready && item.online_ready).length
  const percentage = items.length ? Math.round((onlineCount / items.length) * 100) : 0

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Governance prodotto</p>
          <h1 className="text-2xl font-semibold tracking-tight">Roadmap HotelAccelerator</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">Una riga per funzione. Verde significa Codice + Online. Ogni modifica viene salvata centralmente e registrata nell'audit.</p>
        </div>
        <div className="rounded-lg border bg-card px-4 py-3 text-right">
          <div className="text-2xl font-semibold">{percentage}%</div>
          <div className="text-xs text-muted-foreground">{onlineCount} di {items.length} online</div>
        </div>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cerca funzione..." className="pl-9" />
      </div>

      {error && <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>}

      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="hidden grid-cols-[140px_1fr_100px_100px_120px] gap-3 border-b bg-muted/40 px-4 py-3 text-xs font-medium uppercase tracking-wide text-muted-foreground md:grid">
          <span>Area</span><span>Funzione</span><span>Codice</span><span>Online</span><span>Stato</span>
        </div>
        {loading ? (
          <div className="flex items-center justify-center gap-2 px-4 py-12 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Caricamento roadmap...</div>
        ) : filtered.length === 0 ? (
          <div className="px-4 py-12 text-center text-sm text-muted-foreground">Nessuna funzione trovata.</div>
        ) : (
          <div className="divide-y">
            {filtered.map((item) => {
              const complete = item.code_ready && item.online_ready
              const saving = savingKey === item.roadmap_key
              return (
                <div key={item.roadmap_key} className={`grid gap-3 px-4 py-4 md:grid-cols-[140px_1fr_100px_100px_120px] md:items-center ${complete ? "bg-emerald-50/60 dark:bg-emerald-950/20" : ""}`}>
                  <div className="text-xs font-medium text-muted-foreground">{item.area}</div>
                  <div className="text-sm font-medium">{item.capability}</div>
                  <label className="flex items-center gap-2 text-xs text-muted-foreground"><Switch checked={item.code_ready} disabled={saving || item.online_ready} onCheckedChange={(value) => update(item, "code", value)} aria-label={`Codice ${item.capability}`} />Codice</label>
                  <label className="flex items-center gap-2 text-xs text-muted-foreground"><Switch checked={item.online_ready} disabled={saving || !item.code_ready} onCheckedChange={(value) => update(item, "online", value)} aria-label={`Online ${item.capability}`} />Online</label>
                  <div className={`flex items-center gap-2 text-sm font-medium ${complete ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground"}`}>
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : complete ? <CheckCircle2 className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
                    {saving ? "Salvataggio" : complete ? "Online" : item.code_ready ? "In sviluppo" : "Da fare"}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <p className="text-xs text-muted-foreground">I flag sono un promemoria operativo. Il livello tecnico ufficiale resta documentato in MODULE_REGISTRY.md e richiede evidenze, test e verifiche prima di essere promosso.</p>
    </div>
  )
}
