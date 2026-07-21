"use client"

import { useState } from "react"
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Bell,
  CheckCircle2,
  Gauge,
  Lock,
  Minus,
  Shield,
  Sparkles,
  Target,
  TrendingUp,
  Zap,
} from "lucide-react"
import { Button } from "@/components/ui/button"

/* ------------------------------------------------------------------ *
 * DATI MOCK — scenario Villa I Barronci Resort & Spa
 * Solo per prototipo grafico. Nessun collegamento ai dati reali.
 * ------------------------------------------------------------------ */

type Light = "green" | "orange" | "red"

const HOTEL_NAME = "Villa I Barronci Resort & Spa"

const freeIndicators: {
  key: string
  label: string
  value: string
  sub: string
  light: Light
  trend: "up" | "down" | "flat"
  trendLabel: string
  icon: typeof Gauge
  spark: number[]
}[] = [
  {
    key: "occupancy",
    label: "Occupazione",
    value: "72%",
    sub: "prossimi 7 giorni",
    light: "orange",
    trend: "up",
    trendLabel: "+4 pt vs sett. scorsa",
    icon: Gauge,
    spark: [58, 61, 64, 60, 66, 69, 72],
  },
  {
    key: "revpar",
    label: "RevPAR vs anno scorso",
    value: "+6,2%",
    sub: "€118 · LY €111",
    light: "green",
    trend: "up",
    trendLabel: "sopra obiettivo +2%",
    icon: TrendingUp,
    spark: [99, 104, 102, 108, 111, 115, 118],
  },
]

const lockedIndicators: {
  key: string
  label: string
  risk: string
  icon: typeof Shield
}[] = [
  {
    key: "guard",
    label: "Guard · Parità OTA",
    risk: "Possibili sotto-prezzi sulle OTA non monitorati",
    icon: Shield,
  },
  {
    key: "autopilot",
    label: "AutoPilot Pricing",
    risk: "Tariffe non ottimizzate: RevPAR potenziale non sfruttato",
    icon: Zap,
  },
  {
    key: "pace",
    label: "Obiettivi & Pace",
    risk: "Ritmo prenotazioni sotto pari periodo: rischio budget",
    icon: Target,
  },
]

/* ------------------------------------------------------------------ *
 * Helpers di stile semaforo
 * ------------------------------------------------------------------ */

const lightDot: Record<Light, string> = {
  green: "bg-emerald-500",
  orange: "bg-amber-500",
  red: "bg-red-500",
}
const lightText: Record<Light, string> = {
  green: "text-emerald-700",
  orange: "text-amber-700",
  red: "text-red-700",
}
const lightSoftBg: Record<Light, string> = {
  green: "bg-emerald-50 border-emerald-200",
  orange: "bg-amber-50 border-amber-200",
  red: "bg-red-50 border-red-200",
}
const lightLabel: Record<Light, string> = {
  green: "Ottimo",
  orange: "Da migliorare",
  red: "Critico",
}

function Sparkline({ data, className = "" }: { data: number[]; className?: string }) {
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const pts = data
    .map((d, i) => {
      const x = (i / (data.length - 1)) * 100
      const y = 100 - ((d - min) / range) * 100
      return `${x},${y}`
    })
    .join(" ")
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className={className} aria-hidden="true">
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function TrendIcon({ trend }: { trend: "up" | "down" | "flat" }) {
  if (trend === "up") return <ArrowUpRight className="h-3.5 w-3.5" />
  if (trend === "down") return <ArrowDownRight className="h-3.5 w-3.5" />
  return <Minus className="h-3.5 w-3.5" />
}

/* ================================================================== *
 * VARIANTE A — Striscia semafori
 * ================================================================== */

function VariantA() {
  return (
    <div className="rounded-2xl border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Gauge className="h-5 w-5 text-teal-600" />
          <h3 className="font-semibold text-foreground">Centro di Controllo Performance</h3>
        </div>
        <span className="text-xs text-muted-foreground">{HOTEL_NAME}</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {/* Free indicators */}
        {freeIndicators.map((ind) => (
          <div key={ind.key} className={`rounded-xl border p-4 ${lightSoftBg[ind.light]}`}>
            <div className="flex items-center justify-between mb-2">
              <ind.icon className={`h-4 w-4 ${lightText[ind.light]}`} />
              <span className={`h-2.5 w-2.5 rounded-full ${lightDot[ind.light]}`} />
            </div>
            <div className="text-2xl font-bold text-foreground">{ind.value}</div>
            <div className="text-xs text-muted-foreground">{ind.label}</div>
            <div className={`mt-2 flex items-center gap-1 text-xs font-medium ${lightText[ind.light]}`}>
              <TrendIcon trend={ind.trend} />
              {ind.trendLabel}
            </div>
          </div>
        ))}

        {/* Locked Accelerator indicators */}
        {lockedIndicators.map((ind) => (
          <div
            key={ind.key}
            className="relative rounded-xl border border-dashed border-muted-foreground/30 bg-muted/40 p-4 overflow-hidden"
          >
            <div className="flex items-center justify-between mb-2">
              <ind.icon className="h-4 w-4 text-muted-foreground" />
              <Lock className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <div className="text-sm font-semibold text-foreground/70">{ind.label}</div>
            <div className="mt-1 flex items-start gap-1 text-[11px] leading-tight text-amber-700">
              <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
              <span>{ind.risk}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between rounded-xl bg-teal-50 border border-teal-200 px-4 py-3">
        <div className="flex items-center gap-2 text-sm text-teal-800">
          <Sparkles className="h-4 w-4" />
          <span>
            <strong>3 indicatori critici</strong> sono bloccati. Sbloccali con Accelerator per proteggere il tuo
            RevPAR.
          </span>
        </div>
        <Button size="sm" className="bg-teal-600 hover:bg-teal-700 shrink-0">
          Attiva Accelerator
        </Button>
      </div>
    </div>
  )
}

/* ================================================================== *
 * VARIANTE B — Health Score + lista
 * ================================================================== */

function HealthRing({ score }: { score: number }) {
  const r = 52
  const circ = 2 * Math.PI * r
  const pct = score / 100
  const color = score >= 75 ? "#10b981" : score >= 50 ? "#f59e0b" : "#ef4444"
  return (
    <div className="relative h-36 w-36">
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
        <circle cx="60" cy="60" r={r} fill="none" stroke="#e5e7eb" strokeWidth="10" />
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - pct)}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold text-foreground">{score}</span>
        <span className="text-xs text-muted-foreground">Health Score</span>
      </div>
    </div>
  )
}

function VariantB() {
  return (
    <div className="rounded-2xl border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-teal-600" />
          <h3 className="font-semibold text-foreground">Stato di Salute Performance</h3>
        </div>
        <span className="text-xs text-muted-foreground">{HOTEL_NAME}</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[auto_1fr] gap-6 items-center">
        <div className="flex flex-col items-center gap-2">
          <HealthRing score={64} />
          <span className="text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-3 py-1">
            Margini di miglioramento
          </span>
        </div>

        <div className="space-y-2">
          {freeIndicators.map((ind) => (
            <div key={ind.key} className="flex items-center gap-3 rounded-lg border bg-background px-3 py-2.5">
              <span className={`h-3 w-3 rounded-full ${lightDot[ind.light]}`} />
              <ind.icon className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium text-foreground flex-1">{ind.label}</span>
              <span className="text-sm font-bold text-foreground">{ind.value}</span>
              <span className={`text-xs font-medium ${lightText[ind.light]} w-28 text-right`}>
                {lightLabel[ind.light]}
              </span>
            </div>
          ))}

          {lockedIndicators.map((ind) => (
            <div
              key={ind.key}
              className="flex items-center gap-3 rounded-lg border border-dashed bg-muted/40 px-3 py-2.5"
            >
              <Lock className="h-3 w-3 text-muted-foreground" />
              <ind.icon className="h-4 w-4 text-muted-foreground" />
              <div className="flex-1">
                <span className="text-sm font-medium text-foreground/70">{ind.label}</span>
                <p className="text-[11px] text-amber-700 leading-tight">{ind.risk}</p>
              </div>
              <span className="text-[10px] font-bold uppercase tracking-wide text-teal-700 bg-teal-50 border border-teal-200 rounded px-2 py-0.5">
                PRO
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between rounded-xl bg-gradient-to-r from-teal-600 to-teal-700 px-4 py-3 text-white">
        <span className="text-sm">
          Il tuo Health Score potrebbe salire a <strong>89</strong> con Accelerator attivo.
        </span>
        <Button size="sm" variant="secondary" className="shrink-0">
          Scopri come
        </Button>
      </div>
    </div>
  )
}

/* ================================================================== *
 * VARIANTE C — Griglia diagnostica premium (dark)
 * ================================================================== */

function VariantC() {
  return (
    <div className="rounded-2xl border bg-slate-900 p-5 shadow-sm text-slate-100">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Gauge className="h-5 w-5 text-teal-400" />
          <h3 className="font-semibold">Diagnostica Revenue</h3>
        </div>
        <span className="text-xs text-slate-400">{HOTEL_NAME}</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {freeIndicators.map((ind) => (
          <div key={ind.key} className="rounded-xl bg-slate-800/80 border border-slate-700 p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <ind.icon className="h-4 w-4 text-slate-300" />
                <span className="text-sm text-slate-300">{ind.label}</span>
              </div>
              <span className={`h-2.5 w-2.5 rounded-full ${lightDot[ind.light]} ring-4 ring-offset-0 ${ind.light === "green" ? "ring-emerald-500/20" : ind.light === "orange" ? "ring-amber-500/20" : "ring-red-500/20"}`} />
            </div>
            <div className="flex items-end justify-between">
              <div>
                <div className="text-2xl font-bold">{ind.value}</div>
                <div className="text-xs text-slate-400">{ind.sub}</div>
              </div>
              <div className={`h-8 w-20 ${ind.light === "green" ? "text-emerald-400" : "text-amber-400"}`}>
                <Sparkline data={ind.spark} className="h-full w-full" />
              </div>
            </div>
          </div>
        ))}

        {lockedIndicators.map((ind) => (
          <div
            key={ind.key}
            className="relative rounded-xl bg-slate-800/40 border border-slate-700 p-4 overflow-hidden"
          >
            <div className="absolute inset-0 backdrop-blur-[2px] bg-slate-900/30" />
            <div className="relative">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <ind.icon className="h-4 w-4 text-slate-400" />
                  <span className="text-sm text-slate-400">{ind.label}</span>
                </div>
                <Lock className="h-3.5 w-3.5 text-teal-400" />
              </div>
              <div className="flex items-start gap-1.5 text-[11px] leading-tight text-amber-300/90">
                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>{ind.risk}</span>
              </div>
              <div className="mt-3 text-[10px] font-bold uppercase tracking-wider text-teal-400">
                Sblocca con Accelerator
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between rounded-xl bg-slate-800 border border-slate-700 px-4 py-3">
        <div className="flex items-center gap-2 text-sm text-slate-200">
          <Bell className="h-4 w-4 text-amber-400" />
          <span>Stai navigando al buio su 3 aree chiave del revenue.</span>
        </div>
        <Button size="sm" className="bg-teal-500 hover:bg-teal-400 text-slate-900 shrink-0">
          Attiva Accelerator
        </Button>
      </div>
    </div>
  )
}

/* ================================================================== *
 * VARIANTE D — Health Score + Striscia semafori (mix A+B)
 * ================================================================== */

function VariantD() {
  return (
    <div className="rounded-2xl border bg-card p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Gauge className="h-5 w-5 text-teal-600" />
          <h3 className="font-semibold text-foreground">Centro di Controllo Performance</h3>
        </div>
        <span className="text-xs text-muted-foreground">{HOTEL_NAME}</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[auto_1fr] gap-6">
        {/* Colonna sinistra: Health Score (da Variante B) */}
        <div className="flex flex-col items-center justify-center gap-3 lg:border-r lg:pr-6">
          <HealthRing score={64} />
          <span className="text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-3 py-1 text-center">
            Margini di miglioramento
          </span>
          <p className="text-[11px] text-muted-foreground text-center max-w-[160px] leading-tight">
            Sintesi di tutti gli indicatori in un unico punteggio
          </p>
        </div>

        {/* Colonna destra: striscia di card a semaforo (da Variante A) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {/* Free indicators */}
          {freeIndicators.map((ind) => (
            <div key={ind.key} className={`rounded-xl border p-4 ${lightSoftBg[ind.light]}`}>
              <div className="flex items-center justify-between mb-2">
                <ind.icon className={`h-4 w-4 ${lightText[ind.light]}`} />
                <span className={`h-2.5 w-2.5 rounded-full ${lightDot[ind.light]}`} />
              </div>
              <div className="text-2xl font-bold text-foreground">{ind.value}</div>
              <div className="text-xs text-muted-foreground">{ind.label}</div>
              <div className={`mt-2 flex items-center gap-1 text-xs font-medium ${lightText[ind.light]}`}>
                <TrendIcon trend={ind.trend} />
                {ind.trendLabel}
              </div>
            </div>
          ))}

          {/* Locked Accelerator indicators */}
          {lockedIndicators.map((ind) => (
            <div
              key={ind.key}
              className="relative rounded-xl border border-dashed border-muted-foreground/30 bg-muted/40 p-4 overflow-hidden"
            >
              <div className="flex items-center justify-between mb-2">
                <ind.icon className="h-4 w-4 text-muted-foreground" />
                <Lock className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <div className="text-sm font-semibold text-foreground/70">{ind.label}</div>
              <div className="mt-1 flex items-start gap-1 text-[11px] leading-tight text-amber-700">
                <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                <span>{ind.risk}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between rounded-xl bg-gradient-to-r from-teal-600 to-teal-700 px-4 py-3 text-white">
        <div className="flex items-center gap-2 text-sm">
          <Sparkles className="h-4 w-4" />
          <span>
            Sblocca <strong>3 indicatori critici</strong> e porta il tuo Health Score a <strong>89</strong> con
            Accelerator.
          </span>
        </div>
        <Button size="sm" variant="secondary" className="shrink-0">
          Attiva Accelerator
        </Button>
      </div>
    </div>
  )
}

/* ================================================================== *
 * Pagina Lab
 * ================================================================== */

const VARIANTS = [
  { id: "a", label: "A · Striscia semafori", node: <VariantA /> },
  { id: "b", label: "B · Health Score", node: <VariantB /> },
  { id: "c", label: "C · Diagnostica premium", node: <VariantC /> },
  { id: "d", label: "D · Health Score + Striscia", node: <VariantD /> },
] as const

export function DashboardLabClient() {
  const [active, setActive] = useState<string>("all")

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <header className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <Sparkles className="h-5 w-5 text-teal-600" />
          <h1 className="text-2xl font-bold text-foreground">Dashboard Lab</h1>
          <span className="text-[10px] font-bold uppercase tracking-wide text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-0.5">
            Prototipo
          </span>
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl">
          Prove grafiche del pannello semafori per la dashboard del tenant <strong>gratuito</strong>. Dati mock
          (Villa I Barronci). Gli indicatori free usano verde/arancione/rosso; quelli Accelerator sono bloccati con
          teaser di rischio per stimolare l&apos;upgrade. Quando una variante ti convince, la sviluppo coi dati reali.
        </p>
      </header>

      {/* Selettore variante */}
      <div className="flex flex-wrap gap-2 mb-6">
        <button
          onClick={() => setActive("all")}
          className={`text-sm rounded-lg px-3 py-1.5 border transition-colors ${
            active === "all" ? "bg-teal-600 text-white border-teal-600" : "bg-background text-muted-foreground hover:text-foreground"
          }`}
        >
          Tutte
        </button>
        {VARIANTS.map((v) => (
          <button
            key={v.id}
            onClick={() => setActive(v.id)}
            className={`text-sm rounded-lg px-3 py-1.5 border transition-colors ${
              active === v.id ? "bg-teal-600 text-white border-teal-600" : "bg-background text-muted-foreground hover:text-foreground"
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>

      {/* Varianti */}
      <div className="space-y-8">
        {VARIANTS.filter((v) => active === "all" || active === v.id).map((v) => (
          <section key={v.id}>
            {active === "all" && (
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{v.label}</span>
                <div className="h-px flex-1 bg-border" />
              </div>
            )}
            {v.node}
          </section>
        ))}
      </div>
    </div>
  )
}
