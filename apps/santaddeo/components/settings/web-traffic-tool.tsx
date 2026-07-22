"use client"

import { useEffect, useState } from "react"
import {
  Activity,
  Eye,
  Users,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Code2,
  TrendingUp,
  Clock,
  Zap,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { AddonLocked } from "@/components/accelerator/addon-locked"

interface TrafficStats {
  locked: boolean
  days?: number
  totals?: { pageviews: number; sessions: number }
  series?: Array<{ day: string; pageviews: number; sessions: number }>
  installed?: boolean
  receiving?: boolean
  lastDataDay?: string | null
  publicToken?: string | null
}

const WEB_TRAFFIC_FEATURES = [
  "Tracciamento visite cookieless (no dati personali)",
  "Trend visite giornaliero e ultimi 30 giorni",
  "Si attiva con lo stesso script del widget recensioni",
  "Stato installazione e ricezione dati in tempo reale",
  "Segnale di domanda diretta pronto per il motore prezzi",
]

export function WebTrafficTool({ hotelId }: { hotelId: string }) {
  const [stats, setStats] = useState<TrafficStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!hotelId) return
    let cancelled = false
    setLoading(true)
    fetch(`/api/web-traffic/stats?hotelId=${hotelId}&days=30`)
      .then((r) => (r.ok ? r.json() : { locked: true }))
      .then((d) => {
        if (!cancelled) setStats(d)
      })
      .catch((e) => {
        console.error("[v0] web-traffic stats error:", e)
        if (!cancelled) setStats({ locked: true })
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [hotelId])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    )
  }

  if (!stats || stats.locked) {
    return (
      <AddonLocked
        title="Traffico Web"
        description="Misura le visite al tuo sito in forma anonima e aggregata tramite il widget recensioni, e trasforma la domanda diretta in un segnale per il pricing."
        features={WEB_TRAFFIC_FEATURES}
        priceLabel="19 €/mese"
        addonType="web_traffic"
      />
    )
  }

  const series = stats.series || []
  const max = Math.max(1, ...series.map((s) => s.pageviews))
  const totals = stats.totals || { pageviews: 0, sessions: 0 }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-teal-600" />
          Traffico Web
        </CardTitle>
        <CardDescription>
          Visite al tuo sito misurate in forma anonima e aggregata tramite il widget recensioni.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Stato installazione / ricezione dati */}
        {stats.receiving ? (
          <div className="flex items-center gap-2 rounded-lg border border-teal-200 bg-teal-50 p-3 text-sm text-teal-800">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            Stiamo ricevendo i dati di traffico dal tuo sito.
          </div>
        ) : (
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>
              Nessun dato recente. Assicurati di aver installato lo script del{" "}
              <strong>widget recensioni</strong> sul tuo sito (sezione Recensioni → “Widget per il tuo
              sito”): è lo stesso script che attiva il tracciamento. Per catturare le{" "}
              <strong>date di soggiorno cercate</strong> nel booking engine, installa anche il tag
              dedicato (vedi sotto).
            </span>
          </div>
        )}

        {/* Totali */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl border bg-card p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Eye className="h-4 w-4" />
              <span className="text-xs">Visite (30gg)</span>
            </div>
            <div className="text-2xl font-bold">{totals.pageviews.toLocaleString("it-IT")}</div>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Users className="h-4 w-4" />
              <span className="text-xs">Sessioni (30gg)</span>
            </div>
            <div className="text-2xl font-bold">{totals.sessions.toLocaleString("it-IT")}</div>
          </div>
        </div>

        {/* Grafico a barre giornaliero */}
        <div>
          <div className="text-xs text-muted-foreground mb-2">Visite giornaliere (ultimi 30 giorni)</div>
          <div className="flex items-end gap-0.5 h-28">
            {series.map((s) => (
              <div
                key={s.day}
                className="flex-1 rounded-t bg-teal-500/80 hover:bg-teal-600 transition-colors"
                style={{ height: `${Math.max(2, (s.pageviews / max) * 100)}%` }}
                title={`${s.day}: ${s.pageviews} visite, ${s.sessions} sessioni`}
              />
            ))}
          </div>
        </div>

        {/* Snippet per il BOOKING ENGINE (dove avvengono le ricerche con date) */}
        <BookingEngineSnippet publicToken={stats.publicToken ?? null} />

        {/* Attivazione domanda diretta nel pricing */}
        <PricingActivationCard hotelId={hotelId} />
      </CardContent>
    </Card>
  )
}

function CopyBlock({ code, label }: { code: string; label: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (e) {
      console.error("[v0] copy snippet error:", e)
    }
  }
  return (
    <div className="space-y-2">
      <pre className="overflow-x-auto rounded-md bg-foreground/90 p-3 text-xs leading-relaxed text-background">
        <code>{code}</code>
      </pre>
      <Button variant="outline" size="sm" onClick={copy}>
        {copied ? (
          <>
            <CheckCircle2 className="h-4 w-4" /> Copiato
          </>
        ) : (
          <>
            <Code2 className="h-4 w-4" /> {label}
          </>
        )}
      </Button>
    </div>
  )
}

function BookingEngineSnippet({ publicToken }: { publicToken: string | null }) {
  const [origin, setOrigin] = useState("https://santaddeo.com")

  useEffect(() => {
    if (typeof window !== "undefined") setOrigin(window.location.origin)
  }, [])

  if (!publicToken) return null

  // Tag UNIVERSALE: un'unica riga che vale per qualsiasi booking engine. Lo
  // script (data-widget="track") rileva da solo le date di soggiorno da: URL,
  // hash (SPA) e CAMPI del form (booking engine che tengono le date in
  // sessione). Nessuna logica per-engine qui dentro. Funziona sia incollato
  // direttamente nelle pagine, sia caricato via Tag Manager (es. GTM) quando il
  // booking engine e' su un dominio esterno. L'endpoint /api/public/track e'
  // CORS-aperto, quindi accetta i dati da qualunque dominio.
  const snippet =
    `<script src="${origin}/embed/santaddeo.js"\n` +
    `        data-token="${publicToken}" data-widget="track" async></script>`

  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 space-y-4">
      <div className="flex items-start gap-2 text-sm">
        <Code2 className="h-4 w-4 mt-0.5 shrink-0 text-blue-600" />
        <div>
          <div className="font-medium text-foreground">
            Cattura le date cercate nel motore di prenotazione (booking engine)
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">
            Le ricerche con le date di soggiorno avvengono nel <strong>booking engine</strong>. Con
            questo unico tag le catturiamo per alimentare il segnale di domanda diretta del pricing.
            Funziona con qualsiasi motore di prenotazione: rileva le date da URL e dai campi di
            ricerca, da solo. È in sola lettura: nessun widget visibile, niente cookie, nessun dato
            personale.
          </p>
        </div>
      </div>

      <CopyBlock code={snippet} label="Copia tag" />

      {/* DOVE METTERLO: due scenari, vale per tutti */}
      <div className="rounded-md border border-blue-100 bg-card p-3 space-y-3">
        <div className="text-xs font-semibold text-foreground">Dove inserirlo</div>
        <div className="space-y-1.5 text-xs text-muted-foreground leading-relaxed">
          <p className="font-medium text-foreground">
            Se il booking engine è sul tuo sito / tuo dominio
          </p>
          <p>
            Incolla il tag nel <code className="rounded bg-muted px-1">&lt;head&gt;</code> (o prima
            di <code className="rounded bg-muted px-1">&lt;/body&gt;</code>) delle pagine del motore
            di prenotazione, incluse quelle di ricerca/disponibilità. Una sola installazione basta.
          </p>
        </div>
        <div className="space-y-1.5 text-xs text-muted-foreground leading-relaxed">
          <p className="font-medium text-foreground">
            Se il booking engine è su un dominio esterno (es. Scidoo)
          </p>
          <p>
            Non potendo modificarne le pagine, installa il tag tramite il loro{" "}
            <strong>Tag Manager</strong> (es. Google Tag Manager): crea un tag{" "}
            <strong>“HTML personalizzato”</strong>, incolla il codice, attivazione su{" "}
            <strong>“Tutte le pagine”</strong>, poi <strong>Salva</strong> e{" "}
            <strong>Pubblica</strong> il container.
          </p>
        </div>
      </div>

      <p className="text-xs text-muted-foreground leading-relaxed">
        <strong className="text-foreground">Come verificare:</strong> fai una ricerca di prova con
        delle date sul tuo booking engine. Entro qualche minuto questa sezione mostrerà i dati in
        arrivo e la variabile “Domanda diretta” nel pricing passerà a stato attivo.
      </p>
    </div>
  )
}

interface PricingStatus {
  locked: boolean
  mode?: "now" | "after_10_days"
  status?: "off" | "pending" | "active"
  weight?: number
  dataDays?: number
  daysNeeded?: number
}

function PricingActivationCard({ hotelId }: { hotelId: string }) {
  const [data, setData] = useState<PricingStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [choice, setChoice] = useState<"now" | "after_10_days">("after_10_days")

  const load = () => {
    fetch(`/api/web-traffic/pricing?hotelId=${hotelId}`)
      .then((r) => (r.ok ? r.json() : { locked: true }))
      .then((d) => {
        setData(d)
        if (d?.mode) setChoice(d.mode)
      })
      .catch((e) => console.error("[v0] pricing status error:", e))
  }

  useEffect(() => {
    if (hotelId) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hotelId])

  const apply = async (mode: "now" | "after_10_days") => {
    setBusy(true)
    try {
      const r = await fetch("/api/web-traffic/pricing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hotelId, mode }),
      })
      if (r.ok) setData(await r.json())
    } catch (e) {
      console.error("[v0] pricing activate error:", e)
    } finally {
      setBusy(false)
    }
  }

  const turnOff = async () => {
    setBusy(true)
    try {
      const r = await fetch(`/api/web-traffic/pricing?hotelId=${hotelId}`, { method: "DELETE" })
      if (r.ok) setData(await r.json())
    } catch (e) {
      console.error("[v0] pricing off error:", e)
    } finally {
      setBusy(false)
    }
  }

  if (!data || data.locked) return null

  const status = data.status ?? "off"
  const dataDays = data.dataDays ?? 0
  const daysNeeded = data.daysNeeded ?? 10

  // ATTIVO
  if (status === "active") {
    return (
      <div className="rounded-lg border border-teal-200 bg-teal-50 p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium text-teal-800">
          <TrendingUp className="h-4 w-4 shrink-0" />
          La domanda diretta sta influenzando i prezzi suggeriti
        </div>
        <p className="text-xs text-teal-700 leading-relaxed">
          Il motore di pricing usa il trend delle visite al tuo sito come segnale di domanda
          (peso {data.weight ?? 4}/10). Si applica solo alle strutture in modalità avanzata
          (K-driven) e modula i suggerimenti in modo contenuto.
        </p>
        <Button variant="outline" size="sm" onClick={turnOff} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Disattiva dal pricing"}
        </Button>
      </div>
    )
  }

  // PENDING (scelto "dopo 10 giorni", soglia non ancora raggiunta)
  if (status === "pending") {
    const pct = Math.min(100, Math.round((dataDays / daysNeeded) * 100))
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-medium text-amber-800">
          <Clock className="h-4 w-4 shrink-0" />
          In attesa di dati sufficienti ({dataDays}/{daysNeeded} giorni)
        </div>
        <div className="h-2 w-full rounded-full bg-amber-200 overflow-hidden">
          <div className="h-full rounded-full bg-amber-500 transition-all" style={{ width: `${pct}%` }} />
        </div>
        <p className="text-xs text-amber-700 leading-relaxed">
          Appena raccogliamo {daysNeeded} giorni di visite, la domanda diretta inizierà
          automaticamente a influenzare i prezzi. Non vuoi aspettare?
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => apply("now")} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Attiva subito"}
          </Button>
          <Button variant="ghost" size="sm" onClick={turnOff} disabled={busy}>
            Annulla
          </Button>
        </div>
      </div>
    )
  }

  // OFF: scelta iniziale
  return (
    <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
      <div className="flex items-start gap-2 text-sm">
        <Code2 className="h-4 w-4 mt-0.5 shrink-0 text-teal-600" />
        <div>
          <div className="font-medium text-foreground">Usa la domanda diretta nel pricing</div>
          <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">
            Trasforma il trend delle visite al tuo sito in un segnale per il motore di pricing.
            Più interesse diretto può tradursi in suggerimenti tariffari più reattivi.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <button
          type="button"
          onClick={() => setChoice("after_10_days")}
          className={`flex w-full items-start gap-2 rounded-lg border p-3 text-left transition-colors ${
            choice === "after_10_days" ? "border-teal-500 bg-teal-50" : "border-border hover:bg-muted"
          }`}
        >
          <Clock className="h-4 w-4 mt-0.5 shrink-0 text-teal-600" />
          <div>
            <div className="text-sm font-medium">
              Attiva dopo 10 giorni di dati{" "}
              <span className="text-teal-600">(consigliato)</span>
            </div>
            <div className="text-xs text-muted-foreground">
              Aspetta dati sufficienti per un segnale affidabile prima di toccare i prezzi.
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setChoice("now")}
          className={`flex w-full items-start gap-2 rounded-lg border p-3 text-left transition-colors ${
            choice === "now" ? "border-teal-500 bg-teal-50" : "border-border hover:bg-muted"
          }`}
        >
          <Zap className="h-4 w-4 mt-0.5 shrink-0 text-teal-600" />
          <div>
            <div className="text-sm font-medium">Attiva subito</div>
            <div className="text-xs text-muted-foreground">
              Inizia immediatamente, anche con pochi giorni di dati.
            </div>
          </div>
        </button>
      </div>

      <Button size="sm" onClick={() => apply(choice)} disabled={busy}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Attiva nel pricing"}
      </Button>
    </div>
  )
}
