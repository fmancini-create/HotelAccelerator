"use client"

import { useState } from "react"
import useSWR from "swr"
import Link from "next/link"
import {
  ArrowLeft,
  CalendarPlus,
  Loader2,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  Info,
  ExternalLink,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

type Calendar = {
  id: string
  provider: "google" | "outlook" | "apple" | "other"
  label: string | null
  color: string
  is_active: boolean
  last_synced_at: string | null
  last_error: string | null
  url_hint: string
  created_at: string
}

const fetcher = (url: string) => fetch(url).then((r) => r.json())

const PROVIDER_LABELS: Record<Calendar["provider"], string> = {
  google: "Google Calendar",
  outlook: "Outlook / Microsoft 365",
  apple: "Apple iCloud",
  other: "Altro",
}

// Istruzioni brevi su dove trovare l'URL ICS segreto per ciascun provider.
const PROVIDER_HELP: Record<Calendar["provider"], { steps: string; link?: string }> = {
  google: {
    steps:
      "ATTENZIONE: NON usare il link \"embed\" della pagina (dà errore 401). In Google Calendar (web) → passa il mouse sul tuo calendario → ⋮ → Impostazioni e condivisione → in fondo, sezione \"Integra calendario\", copia l'\"Indirizzo segreto in formato iCal\" (termina con /basic.ics).",
    link: "https://calendar.google.com",
  },
  outlook: {
    steps:
      "Outlook sul web → Impostazioni → Calendario → Calendari condivisi → \"Pubblica un calendario\" → scegli il calendario, Autorizzazioni \"Tutti i dettagli\" → Pubblica → copia il link ICS.",
    link: "https://outlook.office.com/calendar",
  },
  apple: {
    steps:
      "iCloud Calendar (web o app) → rendi pubblico il calendario condividendolo → copia il link, che inizia con webcal:// (verrà convertito automaticamente).",
    link: "https://www.icloud.com/calendar",
  },
  other: {
    steps:
      "Incolla l'URL pubblico in formato iCalendar (.ics) fornito dal tuo servizio calendario.",
  },
}

const PALETTE = ["#a855f7", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#ec4899", "#6366f1", "#14b8a6"]

export function CalendarSettingsClient() {
  const { data, isLoading, mutate } = useSWR<{ calendars: Calendar[] }>(
    "/api/sales/calendar/my-calendars",
    fetcher,
  )

  const [provider, setProvider] = useState<Calendar["provider"]>("google")
  const [icsUrl, setIcsUrl] = useState("")
  const [label, setLabel] = useState("")
  const [color, setColor] = useState(PALETTE[0])
  const [submitting, setSubmitting] = useState(false)

  const calendars = data?.calendars ?? []

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!icsUrl.trim()) {
      toast.error("Incolla l'URL del calendario.")
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch("/api/sales/calendar/my-calendars", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ics_url: icsUrl.trim(), provider, label: label.trim(), color }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json?.message || "Impossibile collegare il calendario.")
        return
      }
      toast.success(
        `Calendario collegato${typeof json.event_count === "number" ? ` (${json.event_count} eventi trovati)` : ""}.`,
      )
      setIcsUrl("")
      setLabel("")
      mutate()
    } catch (err) {
      console.error("[calendar-settings] add failed:", err)
      toast.error("Errore di rete. Riprova.")
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Rimuovere questo calendario? Non comparirà più nel tuo calendario venditori.")) return
    try {
      const res = await fetch(`/api/sales/calendar/my-calendars?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      })
      if (!res.ok) {
        toast.error("Impossibile rimuovere il calendario.")
        return
      }
      toast.success("Calendario rimosso.")
      mutate()
    } catch (err) {
      console.error("[calendar-settings] delete failed:", err)
      toast.error("Errore di rete. Riprova.")
    }
  }

  const help = PROVIDER_HELP[provider]

  return (
    <div className="container mx-auto max-w-3xl px-6 py-8">
      <div className="mb-6">
        <Link
          href="/sales/calendar"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-3"
        >
          <ArrowLeft className="h-4 w-4" />
          Torna al calendario
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">Calendario personale</h1>
        <p className="text-sm text-muted-foreground mt-1 text-pretty">
          Collega il tuo calendario (Google, Outlook o Apple) per vedere i tuoi impegni
          sovrapposti nel calendario venditori. La connessione è in sola lettura: la
          piattaforma non scrive né modifica nulla sul tuo calendario.
        </p>
      </div>

      {/* Form aggiunta */}
      <Card className="p-5 mb-6">
        <h2 className="text-base font-semibold mb-4 flex items-center gap-2">
          <CalendarPlus className="h-4 w-4 text-emerald-600" />
          Collega un calendario
        </h2>
        <form onSubmit={handleAdd} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label>Provider</Label>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(PROVIDER_LABELS) as Calendar["provider"][]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setProvider(p)}
                  className={cn(
                    "rounded-md border px-3 py-1.5 text-sm transition-colors",
                    provider === p
                      ? "border-emerald-600 bg-emerald-50 text-emerald-800"
                      : "border-border hover:bg-muted",
                  )}
                >
                  {PROVIDER_LABELS[p]}
                </button>
              ))}
            </div>
          </div>

          {/* Istruzioni provider */}
          <div className="flex items-start gap-2 rounded-md bg-muted/60 p-3 text-xs text-muted-foreground">
            <Info className="h-4 w-4 shrink-0 mt-0.5" />
            <div className="flex flex-col gap-1">
              <span className="text-pretty">{help.steps}</span>
              {help.link && (
                <a
                  href={help.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-emerald-700 hover:underline w-fit"
                >
                  Apri {PROVIDER_LABELS[provider]}
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="ics_url">URL calendario (formato iCal / .ics)</Label>
            <Input
              id="ics_url"
              type="text"
              inputMode="url"
              placeholder="https://… oppure webcal://…"
              value={icsUrl}
              onChange={(e) => setIcsUrl(e.target.value)}
              autoComplete="off"
            />
            <p className="text-xs text-muted-foreground">
              Questo URL è segreto: chi lo possiede può vedere i tuoi eventi. Non verrà
              mai mostrato di nuovo per intero dopo il salvataggio.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="label">Etichetta (facoltativa)</Label>
              <Input
                id="label"
                type="text"
                placeholder="Es. Personale, Lavoro…"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                maxLength={120}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Colore</Label>
              <div className="flex flex-wrap items-center gap-2">
                {PALETTE.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={`Colore ${c}`}
                    onClick={() => setColor(c)}
                    className={cn(
                      "h-7 w-7 rounded-full border-2 transition-transform",
                      color === c ? "scale-110 border-foreground" : "border-transparent",
                    )}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
          </div>

          <div>
            <Button type="submit" disabled={submitting} className="bg-emerald-600 hover:bg-emerald-700">
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Verifica e collego…
                </>
              ) : (
                <>
                  <CalendarPlus className="h-4 w-4 mr-2" />
                  Collega calendario
                </>
              )}
            </Button>
          </div>
        </form>
      </Card>

      {/* Lista calendari collegati */}
      <Card className="p-5">
        <h2 className="text-base font-semibold mb-4">Calendari collegati</h2>
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
            <Loader2 className="h-4 w-4 animate-spin" />
            Caricamento…
          </div>
        ) : calendars.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">
            Nessun calendario collegato. Aggiungine uno qui sopra per vederlo nel calendario.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {calendars.map((cal) => (
              <li key={cal.id} className="flex items-center gap-3 py-3">
                <span
                  className="h-4 w-4 shrink-0 rounded-full border border-border"
                  style={{ backgroundColor: cal.color }}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium truncate">{cal.label || PROVIDER_LABELS[cal.provider]}</p>
                    <Badge variant="secondary" className="text-[10px]">
                      {PROVIDER_LABELS[cal.provider]}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{cal.url_hint}</p>
                  {cal.last_error ? (
                    <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-red-600">
                      <AlertTriangle className="h-3 w-3" />
                      Errore sincronizzazione: {cal.last_error}
                    </p>
                  ) : cal.last_synced_at ? (
                    <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-emerald-600">
                      <CheckCircle2 className="h-3 w-3" />
                      Sincronizzato
                    </p>
                  ) : null}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleDelete(cal.id)}
                  aria-label="Rimuovi calendario"
                  className="text-muted-foreground hover:text-red-600"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
