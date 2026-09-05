"use client"

import { useEffect, useMemo, useState } from "react"
import { CalendarDays, Clock3, Eye, Gauge, Save, Target, Users } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { DASHBOARD_PANELS } from "@/lib/platform/dashboard"

type User = { id: string; name: string; email: string; role: string; kpi_enabled?: boolean }
type Settings = {
  hiddenPanels: string[]
  goals: {
    workdayResponsesTarget: number | null
    workdayConversationsTarget: number | null
    responsesTarget: number | null
    conversationsTarget: number | null
    medianResponseSecondsTarget: number | null
  }
}

const EMPTY: Settings = {
  hiddenPanels: [],
  goals: {
    workdayResponsesTarget: null,
    workdayConversationsTarget: null,
    responsesTarget: null,
    conversationsTarget: null,
    medianResponseSecondsTarget: null,
  },
}

export default function DashboardSettingsPage() {
  const [users, setUsers] = useState<User[]>([])
  const [selectedUserId, setSelectedUserId] = useState("")
  const [settings, setSettings] = useState<Settings>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")

  const selected = useMemo(() => users.find((user) => user.id === selectedUserId) ?? null, [users, selectedUserId])

  useEffect(() => {
    ;(async () => {
      try {
        const response = await fetch("/api/admin/users")
        const body = await response.json()
        if (!response.ok) throw new Error(body.error || "Impossibile leggere gli utenti")
        const list = (body.users ?? []) as User[]
        setUsers(list)
        setSelectedUserId(list[0]?.id ?? "")
      } catch (e) {
        setError(e instanceof Error ? e.message : "Impossibile leggere gli utenti")
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  useEffect(() => {
    if (!selectedUserId) return
    setMessage("")
    setError("")
    ;(async () => {
      try {
        const response = await fetch(`/api/admin/dashboard-settings?userId=${encodeURIComponent(selectedUserId)}`)
        const body = await response.json()
        if (!response.ok) throw new Error(body.error || "Impossibile leggere le impostazioni")
        setSettings(body.settings ?? EMPTY)
      } catch (e) {
        setError(e instanceof Error ? e.message : "Impossibile leggere le impostazioni")
      }
    })()
  }, [selectedUserId])

  function setPanelVisible(panelId: string, visible: boolean) {
    setSettings((current) => ({
      ...current,
      hiddenPanels: visible
        ? current.hiddenPanels.filter((id) => id !== panelId)
        : [...new Set([...current.hiddenPanels, panelId])],
    }))
  }

  function setGoal(key: keyof Settings["goals"], raw: string) {
    const value = raw === "" ? null : Number(raw)
    setSettings((current) => ({ ...current, goals: { ...current.goals, [key]: value } }))
  }

  async function save() {
    if (!selectedUserId) return
    setSaving(true)
    setMessage("")
    setError("")
    try {
      const response = await fetch("/api/admin/dashboard-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: selectedUserId, hiddenPanels: settings.hiddenPanels, goals: settings.goals }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || "Salvataggio non riuscito")
      setSettings(body.settings)
      setMessage("Dashboard aggiornata. Le modifiche saranno visibili al prossimo caricamento dell'utente.")
    } catch (e) {
      setError(e instanceof Error ? e.message : "Salvataggio non riuscito")
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <main className="mx-auto max-w-6xl p-6"><div className="h-28 animate-pulse rounded-xl bg-muted" /></main>
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 md:px-6">
      <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ha-brand">Dashboard utenti</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight md:text-3xl">Decidi cosa vede ogni persona</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Puoi scegliere le card visibili e assegnare obiettivi individuali. Queste impostazioni non modificano i permessi dell'utente e non possono dargli accesso a moduli o dati non autorizzati.
          </p>
        </div>
        <Button onClick={save} disabled={!selectedUserId || saving} className="gap-2">
          <Save className="h-4 w-4" /> {saving ? "Salvataggio..." : "Salva impostazioni"}
        </Button>
      </div>

      {error && <div className="mb-5 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>}
      {message && <div className="mb-5 rounded-lg border border-ha-success/30 bg-ha-success-soft p-3 text-sm text-ha-success-soft-foreground">{message}</div>}

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <aside className="rounded-xl border bg-card p-3">
          <div className="mb-2 flex items-center gap-2 px-2 py-1 text-sm font-medium"><Users className="h-4 w-4 text-ha-brand" /> Utenti</div>
          <div className="space-y-1">
            {users.map((user) => (
              <button
                key={user.id}
                onClick={() => setSelectedUserId(user.id)}
                className={`w-full rounded-lg px-3 py-2 text-left transition-colors ${selectedUserId === user.id ? "bg-ha-brand-soft text-ha-brand-soft-foreground" : "hover:bg-muted"}`}
              >
                <div className="truncate text-sm font-medium">{user.name || user.email}</div>
                <div className="truncate text-xs text-muted-foreground">{user.email}</div>
              </button>
            ))}
          </div>
        </aside>

        <div className="space-y-6">
          <section className="rounded-xl border bg-card p-5">
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 text-base font-semibold"><Target className="h-5 w-5 text-ha-brand" /> Obiettivi individuali</div>
                <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
                  {selected ? `Stai impostando gli obiettivi di ${selected.name || selected.email}. ` : "Seleziona un utente. "}
                  Gli obiettivi vengono confrontati con le attività realmente attribuite all'operatore e sono mostrati solo quando i suoi KPI sono attivi.
                </p>
              </div>
              {selected && (
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${selected.kpi_enabled ? "bg-ha-success-soft text-ha-success-soft-foreground" : "bg-muted text-muted-foreground"}`}>
                  {selected.kpi_enabled ? "KPI attivi" : "KPI non attivi"}
                </span>
              )}
            </div>

            <div className="mb-5 grid gap-3 md:grid-cols-3">
              <div className="rounded-lg border bg-muted/25 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold"><Clock3 className="h-4 w-4 text-ha-brand" /> Giornata lavorativa</div>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  Misura il ritmo di oggi, dalla mezzanotte nel fuso orario della struttura. Non sono le ultime 24 ore: a ogni nuova giornata il conteggio riparte da zero.
                </p>
              </div>
              <div className="rounded-lg border bg-muted/25 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold"><CalendarDays className="h-4 w-4 text-ha-brand" /> Ultimi 30 giorni</div>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  È una finestra mobile, non il mese solare. Ogni giorno considera i 30 giorni precedenti per mostrare continuità e andamento nel tempo.
                </p>
              </div>
              <div className="rounded-lg border bg-muted/25 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold"><Gauge className="h-4 w-4 text-ha-brand" /> Tempo di risposta</div>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  È una soglia massima sulla mediana: più il valore reale è basso, meglio è. La mediana riduce l'effetto di pochi casi eccezionalmente lenti.
                </p>
              </div>
            </div>

            <div className="space-y-5">
              <div>
                <h3 className="text-sm font-semibold">Obiettivo per giornata lavorativa</h3>
                <p className="mt-1 text-xs text-muted-foreground">Quanti volumi vuoi che l'operatore gestisca nell'arco della singola giornata.</p>
                <div className="mt-3 grid gap-4 md:grid-cols-2">
                  <label className="space-y-2 text-sm">
                    <span className="font-medium">Risposte nella giornata</span>
                    <Input type="number" min={1} value={settings.goals.workdayResponsesTarget ?? ""} onChange={(e) => setGoal("workdayResponsesTarget", e.target.value)} placeholder="Es. 20" />
                    <span className="block text-xs text-muted-foreground">Numero di risposte inviate dall'operatore oggi.</span>
                  </label>
                  <label className="space-y-2 text-sm">
                    <span className="font-medium">Conversazioni nella giornata</span>
                    <Input type="number" min={1} value={settings.goals.workdayConversationsTarget ?? ""} onChange={(e) => setGoal("workdayConversationsTarget", e.target.value)} placeholder="Es. 14" />
                    <span className="block text-xs text-muted-foreground">Conta conversazioni distinte: più risposte nella stessa conversazione valgono una sola conversazione gestita.</span>
                  </label>
                </div>
              </div>

              <div className="border-t pt-5">
                <h3 className="text-sm font-semibold">Obiettivo sugli ultimi 30 giorni</h3>
                <p className="mt-1 text-xs text-muted-foreground">Serve a verificare costanza e volume complessivo oltre la singola giornata.</p>
                <div className="mt-3 grid gap-4 md:grid-cols-2">
                  <label className="space-y-2 text-sm">
                    <span className="font-medium">Risposte / ultimi 30 giorni</span>
                    <Input type="number" min={1} value={settings.goals.responsesTarget ?? ""} onChange={(e) => setGoal("responsesTarget", e.target.value)} placeholder="Es. 400" />
                    <span className="block text-xs text-muted-foreground">Totale delle risposte attribuite all'operatore nella finestra mobile di 30 giorni.</span>
                  </label>
                  <label className="space-y-2 text-sm">
                    <span className="font-medium">Conversazioni / ultimi 30 giorni</span>
                    <Input type="number" min={1} value={settings.goals.conversationsTarget ?? ""} onChange={(e) => setGoal("conversationsTarget", e.target.value)} placeholder="Es. 280" />
                    <span className="block text-xs text-muted-foreground">Numero di conversazioni distinte gestite dall'operatore negli ultimi 30 giorni.</span>
                  </label>
                </div>
              </div>

              <div className="border-t pt-5">
                <label className="block max-w-md space-y-2 text-sm">
                  <span className="font-medium">Tempo mediano massimo di risposta (secondi)</span>
                  <Input type="number" min={1} value={settings.goals.medianResponseSecondsTarget ?? ""} onChange={(e) => setGoal("medianResponseSecondsTarget", e.target.value)} placeholder="Es. 600" />
                  <span className="block text-xs leading-relaxed text-muted-foreground">
                    Esempio: 600 secondi = 10 minuti. Il target è raggiunto quando il tempo mediano reale è uguale o inferiore alla soglia impostata.
                  </span>
                </label>
              </div>
            </div>
          </section>

          <section className="rounded-xl border bg-card p-5">
            <div className="mb-5">
              <div className="flex items-center gap-2 text-base font-semibold"><Eye className="h-5 w-5 text-ha-brand" /> Card visibili</div>
              <p className="mt-1 text-sm text-muted-foreground">Una card spenta scompare dalla home di questo utente. Se il modulo o il permesso manca, resta comunque invisibile.</p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {DASHBOARD_PANELS.map((panel) => {
                const visible = !settings.hiddenPanels.includes(panel.id)
                return (
                  <div key={panel.id} className="flex items-start justify-between gap-4 rounded-lg border p-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2"><Gauge className="h-4 w-4 shrink-0 text-ha-brand" /><span className="text-sm font-medium">{panel.title}</span></div>
                      <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">{panel.hint}</p>
                    </div>
                    <Switch checked={visible} onCheckedChange={(checked) => setPanelVisible(panel.id, checked)} aria-label={`${visible ? "Nascondi" : "Mostra"} ${panel.title}`} />
                  </div>
                )
              })}
            </div>
          </section>
        </div>
      </div>
    </main>
  )
}
