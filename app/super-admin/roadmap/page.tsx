"use client"

import { useEffect, useMemo, useState } from "react"
import { CheckCircle2, Circle, Search } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"

const STORAGE_KEY = "hotelaccelerator:super-admin:product-roadmap:v1"

type RoadmapItem = {
  id: string
  area: string
  capability: string
  codeBaseline?: boolean
  onlineBaseline?: boolean
}

type RoadmapState = Record<string, { code: boolean; online: boolean }>

const items: RoadmapItem[] = [
  { id: "core-tenant", area: "Core", capability: "Tenant, utenti, ruoli e permessi" },
  { id: "suite-access", area: "Core", capability: "Accesso unico alla suite per ruolo, modulo e abbonamento" },
  { id: "inbox-gmail", area: "Inbox", capability: "Gmail: OAuth, import, sincronizzazione e riconciliazione", codeBaseline: true, onlineBaseline: true },
  { id: "inbox-omnichannel", area: "Inbox", capability: "Inbox omnicanale: email, WhatsApp, social, OTA e VoIP" },
  { id: "operator-presence", area: "Inbox", capability: "Presenza operatore e instradamento in tempo reale", codeBaseline: true },
  { id: "ai-voice", area: "AI", capability: "Assistente vocale AI per chiamate e messaggi vocali" },
  { id: "conversation-analysis", area: "AI", capability: "Analisi conversazioni, richieste, qualità e insight di mercato" },
  { id: "crm", area: "CRM", capability: "CRM ospite unico, deduplica, soggiorni, consensi e segmenti" },
  { id: "marketing-hub", area: "Marketing", capability: "Marketing Hub AI per contenuti social e comunicazioni" },
  { id: "ads", area: "Marketing", capability: "Campagne Meta e Google Ads con interfaccia semplificata" },
  { id: "email-marketing", area: "Marketing", capability: "Email marketing automatico basato sui profili CRM" },
  { id: "cms", area: "CMS", capability: "Sito e CMS AI-first multilingua con SEO/GEO" },
  { id: "booking", area: "Booking", capability: "Booking widget, preventivi, pagamenti, alternative ed extra" },
  { id: "hr", area: "HR", capability: "Dipendenti, reparti e turni", codeBaseline: true },
  { id: "hr-time", area: "HR", capability: "Check-in/check-out dipendente con geolocalizzazione" },
  { id: "work-session", area: "HR", capability: "Sessione di lavoro collegata a turni, presenza e assegnazione attività" },
  { id: "santaddeo", area: "Santaddeo", capability: "RMS, pricing, forecast e intelligence domanda" },
  { id: "hotelprofitai", area: "HotelProfitAI", capability: "Controllo economico, fatture, banche e finanza" },
  { id: "manubot", area: "ManuBot", capability: "Manutenzioni, attività operative e interventi programmati" },
  { id: "notifications-audit", area: "Core", capability: "Centro notifiche, audit trail e health connettori" },
  { id: "billing", area: "Core", capability: "Billing SaaS, piani, entitlement e onboarding" },
  { id: "roadmap", area: "Governance", capability: "Roadmap prodotto Super Admin", codeBaseline: true },
]

function baseline(): RoadmapState {
  return Object.fromEntries(
    items.map((item) => [item.id, { code: item.codeBaseline === true, online: item.onlineBaseline === true }]),
  )
}

export default function ProductRoadmapPage() {
  const [state, setState] = useState<RoadmapState>(baseline)
  const [query, setQuery] = useState("")

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY)
      if (saved) setState((current) => ({ ...current, ...JSON.parse(saved) }))
    } catch {
      // localStorage can be unavailable in hardened/private browser contexts.
    }
  }, [])

  const update = (id: string, field: "code" | "online", value: boolean) => {
    setState((current) => {
      const next = {
        ...current,
        [id]: { ...(current[id] ?? { code: false, online: false }), [field]: value },
      }
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      } catch {
        // The UI remains usable even if persistence is unavailable.
      }
      return next
    })
  }

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return items
    return items.filter((item) => `${item.area} ${item.capability}`.toLowerCase().includes(needle))
  }, [query])

  const onlineCount = items.filter((item) => state[item.id]?.code && state[item.id]?.online).length
  const percentage = Math.round((onlineCount / items.length) * 100)

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Governance prodotto</p>
          <h1 className="text-2xl font-semibold tracking-tight">Roadmap HotelAccelerator</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Una riga per funzione. Verde significa che la funzione ha codice ed e online. I flag sono un promemoria operativo e non sostituiscono test, audit o evidenze tecniche.
          </p>
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

      <div className="overflow-hidden rounded-xl border bg-card">
        <div className="hidden grid-cols-[140px_1fr_100px_100px_120px] gap-3 border-b bg-muted/40 px-4 py-3 text-xs font-medium uppercase tracking-wide text-muted-foreground md:grid">
          <span>Area</span><span>Funzione</span><span>Codice</span><span>Online</span><span>Stato</span>
        </div>
        <div className="divide-y">
          {filtered.map((item) => {
            const current = state[item.id] ?? { code: false, online: false }
            const complete = current.code && current.online
            return (
              <div key={item.id} className={`grid gap-3 px-4 py-4 md:grid-cols-[140px_1fr_100px_100px_120px] md:items-center ${complete ? "bg-emerald-50/60 dark:bg-emerald-950/20" : ""}`}>
                <div className="text-xs font-medium text-muted-foreground">{item.area}</div>
                <div className="text-sm font-medium">{item.capability}</div>
                <label className="flex items-center gap-2 text-xs text-muted-foreground"><Switch checked={current.code} onCheckedChange={(value) => update(item.id, "code", value)} aria-label={`Codice ${item.capability}`} /> Codice</label>
                <label className="flex items-center gap-2 text-xs text-muted-foreground"><Switch checked={current.online} onCheckedChange={(value) => update(item.id, "online", value)} aria-label={`Online ${item.capability}`} /> Online</label>
                <div className={`flex items-center gap-2 text-sm font-medium ${complete ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground"}`}>
                  {complete ? <CheckCircle2 className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
                  {complete ? "Online" : current.code ? "In sviluppo" : "Da fare"}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Nota: in questa prima versione i flag personali sono salvati nel browser. Lo stato tecnico ufficiale resta MODULE_REGISTRY.md finche non viene aggiunta persistenza server-side con audit.
      </p>
    </div>
  )
}
