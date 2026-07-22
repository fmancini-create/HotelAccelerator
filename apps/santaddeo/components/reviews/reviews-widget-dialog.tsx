"use client"

import { useEffect, useMemo, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Switch } from "@/components/ui/switch"
import { Slider } from "@/components/ui/slider"
import { Checkbox } from "@/components/ui/checkbox"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Code2, Copy, Check, Star, Loader2, Activity, Mail, Zap } from "lucide-react"
import {
  DEFAULT_WIDGET_CONFIG,
  PLATFORM_LABELS,
  platformLabel,
  type WidgetConfig,
  type WidgetLayout,
  type WidgetTheme,
} from "@/lib/reviews/widget-shared"
import {
  DEFAULT_LAST_MINUTE_CONFIG,
  type LastMinuteWidgetConfig,
  type EmbedPlacement,
  type EmbedCorner,
  type EmbedShadow,
  EMBED_CORNERS,
  EMBED_CORNER_LABELS,
  EMBED_SHADOWS,
  EMBED_SHADOW_LABELS,
  EMBED_SHADOW_CSS,
} from "@/lib/embed/widgets-shared"
import type { StatsPayload } from "./reviews-kpi"

/** Stelle React per l'anteprima (scala /5, riempimento parziale via gradiente). */
function PreviewStars({ value, accent, size = 14 }: { value: number; accent: string; size?: number }) {
  const pct = Math.max(0, Math.min(100, (value / 5) * 100))
  const gid = useMemo(() => "pg" + Math.random().toString(36).slice(2, 8), [])
  const star =
    "M12 2l2.95 5.98 6.6.96-4.77 4.65 1.13 6.57L12 17.02 6.09 20.13 7.22 13.56 2.45 8.91l6.6-.96z"
  return (
    <svg width={size * 5} height={size} viewBox="0 0 120 24" aria-hidden="true">
      <defs>
        <linearGradient id={gid}>
          <stop offset={`${pct}%`} stopColor={accent} />
          <stop offset={`${pct}%`} stopColor="#d4d4d8" />
        </linearGradient>
      </defs>
      {[0, 1, 2, 3, 4].map((i) => (
        <path key={i} transform={`translate(${i * 24},0)`} d={star} fill={`url(#${gid})`} />
      ))}
    </svg>
  )
}

/** Anteprima React che replica fedelmente il widget servito dallo script. */
function WidgetPreview({
  config,
  platforms,
  overall,
  totalCount,
  fallbackTitle,
}: {
  config: WidgetConfig
  platforms: Array<{ platform: string; count: number; avg: number | null }>
  overall: number | null
  totalCount: number
  fallbackTitle: string
}) {
  const dark = config.theme === "dark"
  const bg = dark ? "#18181b" : "#ffffff"
  const fg = dark ? "#fafafa" : "#18181b"
  const muted = dark ? "#a1a1aa" : "#71717a"
  const border = dark ? "#27272a" : "#e4e4e7"

  const shown =
    config.platforms.length > 0
      ? platforms.filter((p) => config.platforms.includes(p.platform))
      : platforms

  const title = config.title || fallbackTitle

  return (
    <div
      style={{
        background: bg,
        color: fg,
        border: `1px solid ${border}`,
        borderRadius: config.radius,
        padding: 16,
        maxWidth: config.maxWidth,
        width: "100%",
        boxShadow: EMBED_SHADOW_CSS[config.shadow],
        fontFamily: "system-ui, sans-serif",
        lineHeight: 1.4,
      }}
    >
      {title && <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>{title}</div>}

      {config.showOverall && overall != null && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
          <span style={{ fontSize: 30, fontWeight: 700 }}>{overall.toFixed(2)}</span>
          <PreviewStars value={overall} accent={config.accentColor} size={18} />
          <span style={{ fontSize: 12, color: muted }}>{totalCount} recensioni</span>
        </div>
      )}

      {config.layout === "grid" ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 10 }}>
          {shown.map((p) => (
            <div key={p.platform} style={{ border: `1px solid ${border}`, borderRadius: config.radius, padding: 10 }}>
              <span style={{ fontSize: 13, fontWeight: 500, display: "block", marginBottom: 4 }}>
                {platformLabel(p.platform)}
              </span>
              {p.avg != null && <PreviewStars value={p.avg} accent={config.accentColor} />}
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 700 }}>{p.avg != null ? p.avg.toFixed(2) : "-"}</span>
                {config.showCount && <span style={{ fontSize: 11, color: muted }}>({p.count})</span>}
              </div>
            </div>
          ))}
        </div>
      ) : config.layout === "badge" ? (
        !config.showOverall && (
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 30, fontWeight: 700 }}>{overall != null ? overall.toFixed(2) : "-"}</span>
            <PreviewStars value={overall || 0} accent={config.accentColor} size={18} />
          </div>
        )
      ) : (
        shown.map((p, i) => (
          <div
            key={p.platform}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
              padding: "7px 0",
              borderTop: i === 0 ? "none" : `1px solid ${border}`,
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 500 }}>{platformLabel(p.platform)}</span>
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {p.avg != null && <PreviewStars value={p.avg} accent={config.accentColor} />}
              <span style={{ fontSize: 13, fontWeight: 700, minWidth: 30, textAlign: "right" }}>
                {p.avg != null ? p.avg.toFixed(2) : "-"}
              </span>
              {config.showCount && <span style={{ fontSize: 11, color: muted }}>({p.count})</span>}
            </span>
          </div>
        ))
      )}
    </div>
  )
}

/** Sostituisce i placeholder del messaggio con valori d'esempio per l'anteprima. */
function fillMessage(template: string, discount: string, rooms: string, dates: string): string {
  return (template || "Offerta last minute {dates}")
    .replace(/\{discount\}/g, discount)
    .replace(/\{rooms\}/g, rooms)
    .replace(/\{dates\}/g, dates)
}

/** Anteprima React del banner Last Minute, fedele allo script servito. */
function LastMinutePreview({ config }: { config: LastMinuteWidgetConfig }) {
  const dark = config.theme === "dark"
  const bg = dark ? "#18181b" : "#ffffff"
  const fg = dark ? "#fafafa" : "#18181b"
  const muted = dark ? "#a1a1aa" : "#71717a"
  const border = dark ? "#27272a" : "#e4e4e7"
  const accent = config.accentColor

  // Valori d'esempio (l'anteprima non interroga dati reali)
  const discountTxt = "-15%"
  const datesTxt = "dal 3 al 7 mag"
  const exampleRooms = 3
  const roomsTxt = String(exampleRooms)
  const message = fillMessage(config.messageTemplate, discountTxt, roomsTxt, datesTxt)

  // Soglia scarsita': mostra il conteggio solo se <= soglia (0 = sempre).
  const roomsWithinThreshold =
    config.roomsLeftMaxThreshold <= 0 || exampleRooms <= config.roomsLeftMaxThreshold

  const det: React.ReactNode[] = []
  if (config.show.discount) det.push(<span key="d" style={{ fontWeight: 700, color: accent }}>{discountTxt}</span>)
  if (config.show.dates) det.push(<span key="dt">{datesTxt}</span>)
  if (config.show.roomsLeft && roomsWithinThreshold) det.push(<span key="r">Ultime {roomsTxt} camere</span>)

  return (
    <div
      style={{
        background: bg,
        color: fg,
        border: `1px solid ${border}`,
        borderLeft: `4px solid ${accent}`,
        borderRadius: config.radius,
        padding: "14px 16px",
        maxWidth: config.maxWidth,
        width: "100%",
        boxShadow: EMBED_SHADOW_CSS[config.shadow],
        fontFamily: "system-ui, sans-serif",
        lineHeight: 1.45,
        display: "flex",
        alignItems: "center",
        gap: 14,
        flexWrap: "wrap",
      }}
    >
      <div style={{ flex: 1, minWidth: 180 }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>{message}</div>
        {det.length > 0 && (
          <div style={{ fontSize: 12, color: muted, marginTop: 3, display: "flex", gap: 10, flexWrap: "wrap" }}>
            {det}
          </div>
        )}
      </div>
      {config.show.cta && (
        <span
          style={{
            background: accent,
            color: "#fff",
            fontSize: 13,
            fontWeight: 600,
            padding: "9px 16px",
            borderRadius: 8,
            whiteSpace: "nowrap",
          }}
        >
          {config.ctaLabel || "Prenota ora"}
        </span>
      )}
    </div>
  )
}

/** Controlli condivisi di posizionamento e forma (posizione, angolo, larghezza, ombra). */
function PlacementControls({
  placement,
  corner,
  maxWidth,
  shadow,
  onPlacement,
  onCorner,
  onMaxWidth,
  onShadow,
}: {
  placement: EmbedPlacement
  corner: EmbedCorner
  maxWidth: number
  shadow: EmbedShadow
  onPlacement: (v: EmbedPlacement) => void
  onCorner: (v: EmbedCorner) => void
  onMaxWidth: (v: number) => void
  onShadow: (v: EmbedShadow) => void
}) {
  return (
    <>
      <div className="space-y-2">
        <Label>Posizione nella pagina</Label>
        <div className="flex gap-2">
          {(["inline", "floating"] as EmbedPlacement[]).map((p) => (
            <Button
              key={p}
              type="button"
              size="sm"
              variant={placement === p ? "default" : "outline"}
              onClick={() => onPlacement(p)}
              className="flex-1"
            >
              {p === "inline" ? "Nel contenuto" : "Fisso (flottante)"}
            </Button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          {placement === "inline"
            ? "Appare dove incolli il tag nel sito."
            : "Resta fisso a schermo nell'angolo scelto, sopra al contenuto."}
        </p>
      </div>

      {placement === "floating" && (
        <div className="space-y-2">
          <Label>Angolo</Label>
          <div className="grid grid-cols-3 gap-2">
            {EMBED_CORNERS.map((c) => (
              <Button
                key={c}
                type="button"
                size="sm"
                variant={corner === c ? "default" : "outline"}
                onClick={() => onCorner(c)}
              >
                {EMBED_CORNER_LABELS[c]}
              </Button>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-2">
        <Label>Larghezza massima: {maxWidth}px</Label>
        <Slider min={240} max={900} step={10} value={[maxWidth]} onValueChange={(v) => onMaxWidth(v[0])} />
      </div>

      <div className="space-y-2">
        <Label>Ombra</Label>
        <div className="flex gap-2">
          {EMBED_SHADOWS.map((s) => (
            <Button
              key={s}
              type="button"
              size="sm"
              variant={shadow === s ? "default" : "outline"}
              onClick={() => onShadow(s)}
              className="flex-1"
            >
              {EMBED_SHADOW_LABELS[s]}
            </Button>
          ))}
        </div>
      </div>
    </>
  )
}

export function ReviewsWidgetDialog({
  hotelId,
  stats,
  defaultTab = "reviews",
  triggerLabel = "Widget per il tuo sito",
}: {
  hotelId: string
  stats: StatsPayload | null
  /** Tab aperto di default quando si apre il dialog. */
  defaultTab?: "reviews" | "lastminute"
  /** Testo del pulsante che apre il dialog. */
  triggerLabel?: string
}) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)
  const [token, setToken] = useState<string | null>(null)
  const [config, setConfig] = useState<WidgetConfig>(DEFAULT_WIDGET_CONFIG)
  const [lmConfig, setLmConfig] = useState<LastMinuteWidgetConfig>(DEFAULT_LAST_MINUTE_CONFIG)
  const [webmasterEmail, setWebmasterEmail] = useState("")
  const [sending, setSending] = useState(false)
  const [sendResult, setSendResult] = useState<"ok" | "error" | null>(null)

  // Carica config + token alla prima apertura
  useEffect(() => {
    if (!open || token) return
    setLoading(true)
    fetch(`/api/reviews/widget-config?hotelId=${encodeURIComponent(hotelId)}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.token) setToken(d.token)
        if (d.config) setConfig(d.config)
        if (d.lastMinuteConfig) setLmConfig(d.lastMinuteConfig)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [open, token, hotelId])

  const platforms = stats?.platforms ?? []
  const overall = stats?.avg_rating ?? null
  const totalCount = stats?.total ?? 0

  const origin = typeof window !== "undefined" ? window.location.origin : "https://santaddeo.com"
  const snippet = `<script src="${origin}/embed/reviews.js" data-token="${token ?? "..."}" async></script>`
  const lmSnippet = `<script src="${origin}/embed/santaddeo.js" data-token="${token ?? "..."}" data-widget="lastminute" async></script>`

  function update<K extends keyof WidgetConfig>(key: K, value: WidgetConfig[K]) {
    setConfig((c) => ({ ...c, [key]: value }))
  }

  function updateLm<K extends keyof LastMinuteWidgetConfig>(key: K, value: LastMinuteWidgetConfig[K]) {
    setLmConfig((c) => ({ ...c, [key]: value }))
  }

  function toggleLmShow(key: keyof LastMinuteWidgetConfig["show"], value: boolean) {
    setLmConfig((c) => ({ ...c, show: { ...c.show, [key]: value } }))
  }

  async function save() {
    setSaving(true)
    try {
      const res = await fetch("/api/reviews/widget-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hotelId, config, lastMinuteConfig: lmConfig, isActive: true }),
      })
      const d = await res.json()
      if (d.token) setToken(d.token)
    } finally {
      setSaving(false)
    }
  }

  function copySnippet() {
    navigator.clipboard.writeText(snippet).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    })
  }

  function copyLmSnippet() {
    navigator.clipboard.writeText(lmSnippet).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    })
  }

  async function sendToWebmaster() {
    if (!webmasterEmail.trim()) return
    setSending(true)
    setSendResult(null)
    try {
      const res = await fetch("/api/reviews/widget-config/send-to-webmaster", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hotelId, email: webmasterEmail.trim(), snippet }),
      })
      if (res.ok) {
        setSendResult("ok")
        setWebmasterEmail("")
        setTimeout(() => setSendResult(null), 4000)
      } else {
        setSendResult("error")
      }
    } catch {
      setSendResult("error")
    } finally {
      setSending(false)
    }
  }

  function togglePlatform(p: string) {
    setConfig((c) => {
      const has = c.platforms.includes(p)
      return { ...c, platforms: has ? c.platforms.filter((x) => x !== p) : [...c.platforms, p] }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
          <Button size="sm" variant="outline" className="gap-2">
            <Code2 className="h-4 w-4" />
            {triggerLabel}
          </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Code2 className="h-5 w-5 text-teal-600" />
            Widget per il tuo sito
          </DialogTitle>
          <DialogDescription>
            Scegli cosa mostrare sul sito della struttura: i punteggi delle <strong>recensioni</strong>{" "}
            per canale o un banner <strong>Last Minute</strong> con le offerte attive. Personalizza
            l&apos;aspetto e copia il codice da incollare. Lo script recensioni raccoglie anche, in
            forma anonima e aggregata, le visite al sito per alimentare il pricing di Accelerator.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            Carico la configurazione…
          </div>
        ) : (
          <Tabs defaultValue={defaultTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="reviews" className="gap-1.5">
                <Star className="h-4 w-4" />
                Recensioni
              </TabsTrigger>
              <TabsTrigger value="lastminute" className="gap-1.5">
                <Zap className="h-4 w-4" />
                Last Minute
              </TabsTrigger>
            </TabsList>

            <TabsContent value="reviews" className="mt-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Controlli */}
            <div className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="w-title">Titolo (opzionale)</Label>
                <Input
                  id="w-title"
                  placeholder="Es. nome della struttura"
                  value={config.title}
                  onChange={(e) => update("title", e.target.value)}
                  maxLength={80}
                />
              </div>

              <div className="space-y-2">
                <Label>Layout</Label>
                <div className="flex gap-2">
                  {(["bar", "grid", "badge"] as WidgetLayout[]).map((l) => (
                    <Button
                      key={l}
                      type="button"
                      size="sm"
                      variant={config.layout === l ? "default" : "outline"}
                      onClick={() => update("layout", l)}
                      className="capitalize flex-1"
                    >
                      {l === "bar" ? "Lista" : l === "grid" ? "Griglia" : "Badge"}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Tema</Label>
                <div className="flex gap-2">
                  {(["light", "dark"] as WidgetTheme[]).map((t) => (
                    <Button
                      key={t}
                      type="button"
                      size="sm"
                      variant={config.theme === t ? "default" : "outline"}
                      onClick={() => update("theme", t)}
                      className="flex-1"
                    >
                      {t === "light" ? "Chiaro" : "Scuro"}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="w-accent">Colore accento</Label>
                <div className="flex items-center gap-3">
                  <input
                    id="w-accent"
                    type="color"
                    value={config.accentColor}
                    onChange={(e) => update("accentColor", e.target.value)}
                    className="h-9 w-14 rounded border cursor-pointer bg-transparent"
                  />
                  <span className="text-sm text-muted-foreground font-mono">{config.accentColor}</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Arrotondamento angoli: {config.radius}px</Label>
                <Slider
                  min={0}
                  max={24}
                  step={1}
                  value={[config.radius]}
                  onValueChange={(v) => update("radius", v[0])}
                />
              </div>

              <PlacementControls
                placement={config.placement}
                corner={config.corner}
                maxWidth={config.maxWidth}
                shadow={config.shadow}
                onPlacement={(v) => update("placement", v)}
                onCorner={(v) => update("corner", v)}
                onMaxWidth={(v) => update("maxWidth", v)}
                onShadow={(v) => update("shadow", v)}
              />

              <div className="flex items-center justify-between">
                <Label htmlFor="w-overall">Mostra punteggio complessivo</Label>
                <Switch
                  id="w-overall"
                  checked={config.showOverall}
                  onCheckedChange={(v) => update("showOverall", v)}
                />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="w-count">Mostra numero recensioni</Label>
                <Switch
                  id="w-count"
                  checked={config.showCount}
                  onCheckedChange={(v) => update("showCount", v)}
                />
              </div>

              {platforms.length > 0 && (
                <div className="space-y-2">
                  <Label>Canali da mostrare</Label>
                  <div className="flex flex-wrap gap-2">
                    {platforms.map((p) => {
                      const active = config.platforms.length === 0 || config.platforms.includes(p.platform)
                      return (
                        <Button
                          key={p.platform}
                          type="button"
                          size="sm"
                          variant={active ? "default" : "outline"}
                          onClick={() => togglePlatform(p.platform)}
                        >
                          {PLATFORM_LABELS[p.platform] ?? p.platform}
                        </Button>
                      )
                    })}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Nessuna selezione = tutti i canali.
                  </p>
                </div>
              )}
            </div>

            {/* Anteprima + snippet */}
            <div className="space-y-4">
              <div>
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">Anteprima live</Label>
                <div className="mt-2 rounded-lg border bg-muted/30 p-4 flex items-center justify-center">
                  <WidgetPreview
                    config={config}
                    platforms={platforms}
                    overall={overall}
                    totalCount={totalCount}
                    fallbackTitle=""
                  />
                </div>
              </div>

              <div>
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                  Codice da incollare nel sito
                </Label>
                <div className="mt-2 relative">
                  <pre className="rounded-lg border bg-zinc-950 text-zinc-100 text-xs p-3 pr-12 overflow-x-auto whitespace-pre-wrap break-all">
                    {snippet}
                  </pre>
                  <Button
                    size="icon"
                    variant="secondary"
                    onClick={copySnippet}
                    className="absolute top-2 right-2 h-7 w-7"
                    title="Copia"
                  >
                    {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Incolla lo snippet nel punto del sito dove vuoi mostrare il widget. Salva per
                  applicare le modifiche di stile.
                </p>
              </div>

              {/* Avviso: lo script attiva anche il tracciamento aggregato dei visitatori */}
              <div className="rounded-lg border border-teal-200 bg-teal-50 p-3">
                <div className="flex items-start gap-2">
                  <Activity className="h-4 w-4 text-teal-600 mt-0.5 shrink-0" />
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-teal-800">
                      Installando il widget attivi anche il tracciamento dei visitatori
                    </p>
                    <p className="text-xs text-teal-700 leading-relaxed">
                      Lo stesso script misura in forma <strong>anonima e aggregata</strong> le visite
                      al tuo sito (senza cookie né dati personali). Questo segnale di domanda diretta
                      alimenta il motore di pricing di <strong>Accelerator</strong>, per suggerire
                      tariffe più accurate quando l&apos;interesse cresce.
                    </p>
                  </div>
                </div>
              </div>

              {/* Invia il widget al webmaster per l'installazione */}
              <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                <Label htmlFor="w-webmaster" className="flex items-center gap-1.5 text-sm">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  Invia il widget al tuo webmaster
                </Label>
                <p className="text-xs text-muted-foreground">
                  Non gestisci tu il sito? Invia il codice e le istruzioni di installazione via email a
                  chi se ne occupa.
                </p>
                <div className="flex gap-2">
                  <Input
                    id="w-webmaster"
                    type="email"
                    placeholder="email@webmaster.it"
                    value={webmasterEmail}
                    onChange={(e) => {
                      setWebmasterEmail(e.target.value)
                      setSendResult(null)
                    }}
                    disabled={sending}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={sendToWebmaster}
                    disabled={sending || !webmasterEmail.trim() || !token}
                    className="gap-2 shrink-0"
                  >
                    {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                    Invia
                  </Button>
                </div>
                {!token && (
                  <p className="text-xs text-amber-600">
                    Salva prima la configurazione per generare il codice da inviare.
                  </p>
                )}
                {sendResult === "ok" && (
                  <p className="text-xs text-teal-700">Email inviata al webmaster.</p>
                )}
                {sendResult === "error" && (
                  <p className="text-xs text-red-600">
                    Invio non riuscito. Controlla l&apos;indirizzo e riprova.
                  </p>
                )}
              </div>

              <Button onClick={save} disabled={saving} className="w-full gap-2">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                {saving ? "Salvo…" : "Salva configurazione"}
              </Button>
            </div>
              </div>
            </TabsContent>

            <TabsContent value="lastminute" className="mt-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Controlli Last Minute */}
                <div className="space-y-5">
                  <div className="flex items-center justify-between rounded-lg border bg-muted/30 p-3">
                    <div className="space-y-0.5">
                      <Label htmlFor="lm-enabled" className="text-sm font-medium">
                        Mostra il banner Last Minute
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Appare sul sito <strong>solo</strong> quando un&apos;offerta last minute è
                        realmente attiva (camere libere e sconto configurati).
                      </p>
                    </div>
                    <Switch
                      id="lm-enabled"
                      checked={lmConfig.enabled}
                      onCheckedChange={(v) => updateLm("enabled", v)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="lm-msg">Messaggio</Label>
                    <Textarea
                      id="lm-msg"
                      rows={2}
                      value={lmConfig.messageTemplate}
                      onChange={(e) => updateLm("messageTemplate", e.target.value)}
                      placeholder="Offerta last minute {dates}"
                      maxLength={160}
                    />
                    <p className="text-xs text-muted-foreground">
                      Segnaposto disponibili: <code>{"{dates}"}</code> <code>{"{discount}"}</code>{" "}
                      <code>{"{rooms}"}</code> — verranno sostituiti con i dati reali.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label>Cosa mostrare</Label>
                    <div className="grid grid-cols-2 gap-2">
                      {(
                        [
                          ["discount", "Sconto %"],
                          ["dates", "Date offerta"],
                          ["roomsLeft", "Camere rimaste"],
                          ["cta", "Pulsante prenota"],
                        ] as Array<[keyof LastMinuteWidgetConfig["show"], string]>
                      ).map(([key, label]) => (
                        <label
                          key={key}
                          className="flex items-center gap-2 rounded-md border p-2 text-sm cursor-pointer"
                        >
                          <Checkbox
                            checked={lmConfig.show[key]}
                            onCheckedChange={(v) => toggleLmShow(key, v === true)}
                          />
                          {label}
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="lm-rooms-threshold">Mostra le camere rimaste solo se non superano</Label>
                    <Input
                      id="lm-rooms-threshold"
                      type="number"
                      min={0}
                      max={999}
                      value={lmConfig.roomsLeftMaxThreshold || ""}
                      onChange={(e) => updateLm("roomsLeftMaxThreshold", Math.max(0, Math.floor(Number(e.target.value) || 0)))}
                      placeholder="0 = mostra sempre"
                      disabled={!lmConfig.show.roomsLeft}
                    />
                    <p className="text-xs text-muted-foreground">
                      Effetto scarsita&apos;: se le camere disponibili superano questo valore, il conteggio
                      &quot;Ultime N camere&quot; non viene mostrato. Lascia <strong>0</strong> per mostrarlo sempre.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="lm-cta-label">Testo del pulsante</Label>
                    <Input
                      id="lm-cta-label"
                      value={lmConfig.ctaLabel}
                      onChange={(e) => updateLm("ctaLabel", e.target.value)}
                      placeholder="Prenota ora"
                      maxLength={40}
                      disabled={!lmConfig.show.cta}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="lm-cta-url">Link prenotazione (booking engine)</Label>
                    <Input
                      id="lm-cta-url"
                      type="url"
                      value={lmConfig.ctaUrl}
                      onChange={(e) => updateLm("ctaUrl", e.target.value)}
                      placeholder="https://prenota.tuohotel.it"
                      disabled={!lmConfig.show.cta}
                    />
                  </div>

                  <PlacementControls
                    placement={lmConfig.placement}
                    corner={lmConfig.corner}
                    maxWidth={lmConfig.maxWidth}
                    shadow={lmConfig.shadow}
                    onPlacement={(v) => updateLm("placement", v)}
                    onCorner={(v) => updateLm("corner", v)}
                    onMaxWidth={(v) => updateLm("maxWidth", v)}
                    onShadow={(v) => updateLm("shadow", v)}
                  />

                  <div className="space-y-2">
                    <Label>Tema</Label>
                    <div className="flex gap-2">
                      {(["light", "dark"] as const).map((t) => (
                        <Button
                          key={t}
                          type="button"
                          size="sm"
                          variant={lmConfig.theme === t ? "default" : "outline"}
                          onClick={() => updateLm("theme", t)}
                          className="flex-1"
                        >
                          {t === "light" ? "Chiaro" : "Scuro"}
                        </Button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="lm-accent">Colore accento</Label>
                    <div className="flex items-center gap-3">
                      <input
                        id="lm-accent"
                        type="color"
                        value={lmConfig.accentColor}
                        onChange={(e) => updateLm("accentColor", e.target.value)}
                        className="h-9 w-14 rounded border cursor-pointer bg-transparent"
                      />
                      <span className="text-sm text-muted-foreground font-mono">{lmConfig.accentColor}</span>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Arrotondamento angoli: {lmConfig.radius}px</Label>
                    <Slider
                      min={0}
                      max={24}
                      step={1}
                      value={[lmConfig.radius]}
                      onValueChange={(v) => updateLm("radius", v[0])}
                    />
                  </div>
                </div>

                {/* Anteprima + snippet Last Minute */}
                <div className="space-y-4">
                  <div>
                    <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                      Anteprima (dati d&apos;esempio)
                    </Label>
                    <div className="mt-2 rounded-lg border bg-muted/30 p-4 flex items-center justify-center">
                      <LastMinutePreview config={lmConfig} />
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      Sul sito il banner usa dati reali: se non c&apos;è un last minute attivo, non
                      viene mostrato nulla.
                    </p>
                  </div>

                  <div>
                    <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                      Codice da incollare nel sito
                    </Label>
                    <div className="mt-2 relative">
                      <pre className="rounded-lg border bg-zinc-950 text-zinc-100 text-xs p-3 pr-12 overflow-x-auto whitespace-pre-wrap break-all">
                        {lmSnippet}
                      </pre>
                      <Button
                        size="icon"
                        variant="secondary"
                        onClick={copyLmSnippet}
                        className="absolute top-2 right-2 h-7 w-7"
                        title="Copia"
                      >
                        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      Stesso token del widget recensioni. Incollalo dove vuoi che appaia l&apos;avviso
                      di offerta. Ricordati di salvare.
                    </p>
                  </div>

                  <Button onClick={save} disabled={saving} className="w-full gap-2">
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                    {saving ? "Salvo…" : "Salva configurazione"}
                  </Button>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  )
}
