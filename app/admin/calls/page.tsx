"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { AdminHeader } from "@/components/admin/admin-header"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  PhoneIncoming,
  PhoneMissed,
  PhoneOutgoing,
  RefreshCw,
  Search,
  Settings2,
  UserPlus,
} from "lucide-react"
import { ExtensionLabelsCard } from "@/components/admin/extension-labels-card"

type Call = {
  id: string
  direction: string
  status: string
  number: string | null
  started_at: string | null
  duration_seconds: number | null
  contact: { id: string; name: string | null; company: string | null } | null
  extension: string | null
  extension_label: string | null
  extension_kind: string | null
  handled_by: string | null
}

type Payload = {
  calls: Call[]
  total: number
  limit: number
  offset: number
  summary: { filtered: number; missed: number; unknown_number: number; today: number }
  extensions: Array<{ extension: string; calls: number; label: string | null; kind: string | null }>
}

const PAGE = 25

/** Filtri come singola scelta: due elenchi separati confondono l'esito. */
const FILTRI = [
  { id: "all", label: "Tutte", query: "" },
  { id: "missed", label: "Senza risposta", query: "status=missed" },
  { id: "inbound", label: "In arrivo", query: "direction=inbound" },
  { id: "outbound", label: "In uscita", query: "direction=outbound" },
  { id: "today", label: "Oggi", query: "today=1" },
] as const

function durata(secondi: number | null): string {
  if (secondi === null) return "—"
  if (secondi < 60) return `${secondi}s`
  const m = Math.floor(secondi / 60)
  const s = secondi % 60
  return s === 0 ? `${m} min` : `${m} min ${s}s`
}

/** Numero leggibile: le cifre restano intatte, cambia solo la spaziatura. */
/**
 * Il numero come lo legge una persona.
 *
 * Il centralino consegna lo stesso numero in forme diverse: la stessa utenza
 * arrivava sia come "3358046836" sia come "03358046836" (lo zero e' il prefisso
 * di selezione della linea esterna, non parte del numero). Con due regole di
 * spaziatura diverse le due righe si leggevano come "335 804 6836" e
 * "0335 8046836", cioe' sembravano DUE persone diverse pur essendo lo stesso
 * cliente, gia' riconosciuto come lo stesso contatto in rubrica.
 *
 * Lo zero iniziale si toglie SOLO davanti a un cellulare (in Italia i cellulari
 * iniziano sempre per 3): nei numeri fissi lo zero e' parte del prefisso urbano
 * e togliendolo si otterrebbe un numero inesistente.
 */
function numeroLeggibile(n: string | null): string {
  if (!n) return "Numero sconosciuto"
  const cifre = n.replace(/\D/g, "")
  // Si toglie il prefisso italiano (+39 / 0039) e lo zero di selezione, ma SOLO
  // quando cio' che resta e' un cellulare italiano di 10 cifre che inizia per 3.
  // Un numero estero (+33, +44...) resta come e' arrivato: raggrupparlo con le
  // regole italiane suggerirebbe una struttura che quel numero non ha.
  const candidati = [
    cifre,
    cifre.replace(/^0039/, ""),
    cifre.replace(/^39/, ""),
    cifre.replace(/^0/, ""),
  ]
  const cellulare = candidati.find((c) => c.length === 10 && c.startsWith("3"))
  if (cellulare) return `${cellulare.slice(0, 3)} ${cellulare.slice(3, 6)} ${cellulare.slice(6)}`
  return n
}

function quando(iso: string | null): { giorno: string; ora: string } {
  if (!iso) return { giorno: "—", ora: "" }
  const d = new Date(iso)
  const oggi = new Date()
  const ieri = new Date(oggi)
  ieri.setDate(oggi.getDate() - 1)
  const stessoGiorno = (a: Date, b: Date) => a.toDateString() === b.toDateString()
  const ora = d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })
  if (stessoGiorno(d, oggi)) return { giorno: "Oggi", ora }
  if (stessoGiorno(d, ieri)) return { giorno: "Ieri", ora }
  return { giorno: d.toLocaleDateString("it-IT", { day: "numeric", month: "short" }), ora }
}

export default function CallsPage() {
  const [data, setData] = useState<Payload | null>(null)
  const [caricamento, setCaricamento] = useState(true)
  const [errore, setErrore] = useState("")
  const [filtro, setFiltro] = useState<string>("all")
  const [pagina, setPagina] = useState(0)
  const [ricerca, setRicerca] = useState("")
  const [ricercaAttiva, setRicercaAttiva] = useState("")
  const [mostraInterni, setMostraInterni] = useState(false)

  const carica = useCallback(async () => {
    setCaricamento(true)
    setErrore("")
    try {
      const scelto = FILTRI.find((f) => f.id === filtro)
      const params = new URLSearchParams({ limit: String(PAGE), offset: String(pagina * PAGE) })
      if (scelto?.query) {
        const [k, v] = scelto.query.split("=")
        params.set(k, v)
      }
      if (ricercaAttiva) params.set("q", ricercaAttiva)

      const res = await fetch(`/api/telephony/calls?${params.toString()}`)
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        // Errore di lettura in uno stato PROPRIO: mostrare "nessuna telefonata"
        // quando la lettura fallisce direbbe una cosa falsa, e il cliente
        // penserebbe che il centralino ha smesso di registrare.
        setErrore(
          res.status === 401
            ? "Sessione scaduta: ricarica la pagina per rientrare."
            : body?.error || "Non è stato possibile leggere il registro.",
        )
        setData(null)
        return
      }
      setData((await res.json()) as Payload)
    } catch {
      setErrore("Non è stato possibile contattare il server.")
      setData(null)
    } finally {
      setCaricamento(false)
    }
  }, [filtro, pagina, ricercaAttiva])

  useEffect(() => {
    void carica()
  }, [carica])

  const calls = data?.calls ?? []
  const totale = data?.total ?? 0
  const ultimaPagina = Math.max(Math.ceil(totale / PAGE) - 1, 0)

  const conteggi = useMemo(() => data?.summary ?? { filtered: 0, missed: 0, unknown_number: 0, today: 0 }, [data])

  return (
    <div className="min-h-full bg-background">
      <AdminHeader
        title="Telefonate"
        subtitle="Le chiamate registrate dal centralino: chi ha telefonato, quando e com'è andata."
        actions={
          <Button variant="outline" size="sm" onClick={() => void carica()} disabled={caricamento}>
            <RefreshCw className={`mr-2 h-4 w-4 ${caricamento ? "animate-spin" : ""}`} aria-hidden="true" />
            Aggiorna
          </Button>
        }
      />

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {/* Tre numeri, non una parete di riquadri: quello che conta è quante
            telefonate sono rimaste senza risposta. */}
        <div className="grid gap-3 sm:grid-cols-3">
          <Card>
            <CardContent className="flex items-baseline justify-between gap-3 py-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Oggi</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{conteggi.today}</p>
              </div>
              <PhoneIncoming className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            </CardContent>
          </Card>
          <Card className={conteggi.missed > 0 ? "border-destructive/40" : undefined}>
            <CardContent className="flex items-baseline justify-between gap-3 py-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Senza risposta</p>
                <p
                  className={`mt-1 text-2xl font-semibold tabular-nums ${
                    conteggi.missed > 0 ? "text-destructive" : "text-foreground"
                  }`}
                >
                  {conteggi.missed}
                </p>
              </div>
              <PhoneMissed
                className={`h-5 w-5 shrink-0 ${conteggi.missed > 0 ? "text-destructive" : "text-muted-foreground"}`}
                aria-hidden="true"
              />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-baseline justify-between gap-3 py-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Numeri non in rubrica</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{conteggi.unknown_number}</p>
              </div>
              <UserPlus className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            </CardContent>
          </Card>
        </div>

        <div className="mt-5 flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filtra le telefonate">
            {FILTRI.map((f) => (
              <Button
                key={f.id}
                size="sm"
                variant={filtro === f.id ? "default" : "outline"}
                aria-pressed={filtro === f.id}
                onClick={() => {
                  setFiltro(f.id)
                  setPagina(0)
                }}
              >
                {f.label}
              </Button>
            ))}
          </div>

          <form
            className="flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              setRicercaAttiva(ricerca.replace(/\D/g, ""))
              setPagina(0)
            }}
          >
            <div className="grid gap-1.5">
              <Label htmlFor="cerca-numero" className="text-xs text-muted-foreground">
                Cerca un numero
              </Label>
              <Input
                id="cerca-numero"
                value={ricerca}
                inputMode="tel"
                placeholder="es. 3284596286"
                className="w-44"
                onChange={(e) => setRicerca(e.target.value)}
              />
            </div>
            <Button type="submit" variant="outline" size="icon" aria-label="Cerca questo numero">
              <Search className="h-4 w-4" aria-hidden="true" />
            </Button>
            {ricercaAttiva && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setRicerca("")
                  setRicercaAttiva("")
                  setPagina(0)
                }}
              >
                Azzera
              </Button>
            )}
          </form>
        </div>

        <Card className="mt-4">
          <CardContent className="p-0">
            {caricamento && !data ? (
              <div className="space-y-3 p-4">
                {[0, 1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : errore ? (
              <p className="flex items-start gap-2 p-6 text-sm text-destructive" role="alert">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="text-pretty">{errore}</span>
              </p>
            ) : calls.length === 0 ? (
              <div className="p-8 text-center">
                <p className="text-sm text-muted-foreground text-pretty">
                  {ricercaAttiva || filtro !== "all"
                    ? "Nessuna telefonata con questi criteri."
                    : "Nessuna telefonata registrata."}
                </p>
                {!ricercaAttiva && filtro === "all" && (
                  <p className="mx-auto mt-2 max-w-md text-xs text-muted-foreground text-pretty leading-relaxed">
                    Il registro si popola da solo quando il centralino è collegato: si configura in{" "}
                    <Link href="/admin/channels/phone" className="underline">
                      Canali → Telefono IP
                    </Link>
                    .
                  </p>
                )}
              </div>
            ) : (
              <ul className="divide-y">
                {calls.map((c) => {
                  const persa = c.status === "missed"
                  const inArrivo = c.direction === "inbound"
                  const t = quando(c.started_at)
                  const Icona = persa ? PhoneMissed : inArrivo ? PhoneIncoming : PhoneOutgoing
                  return (
                    <li key={c.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                      <Icona
                        className={`h-4 w-4 shrink-0 ${persa ? "text-destructive" : "text-muted-foreground"}`}
                        aria-hidden="true"
                      />

                      <div className="min-w-48 flex-1">
                        <p className="flex flex-wrap items-center gap-x-2 text-sm font-medium text-foreground">
                          {c.contact?.name ? (
                            <Link href={`/admin/crm/contacts/${c.contact.id}`} className="hover:underline">
                              {c.contact.name}
                            </Link>
                          ) : (
                            <span className="tabular-nums" title={c.number ?? undefined}>
                              {numeroLeggibile(c.number)}
                            </span>
                          )}
                          {persa && (
                            <Badge variant="destructive" className="text-xs">
                              Senza risposta
                            </Badge>
                          )}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {c.contact?.name && c.number ? (
                            <span className="tabular-nums" title={c.number}>
                              {numeroLeggibile(c.number)}
                            </span>
                          ) : (
                            <span>{inArrivo ? "In arrivo" : "In uscita"}</span>
                          )}
                          {c.contact?.company ? ` · ${c.contact.company}` : ""}
                        </p>
                      </div>

                      {/* Chi l'ha gestita: il nome della persona se l'interno è
                          suo, altrimenti l'etichetta dell'apparecchio. Un
                          telefono condiviso non ha un autore, e attribuirlo a
                          qualcuno sarebbe un dato falso. */}
                      <div className="min-w-36 text-xs">
                        {c.handled_by ? (
                          <span className="text-foreground">{c.handled_by}</span>
                        ) : c.extension_label ? (
                          <span className="text-muted-foreground">{c.extension_label}</span>
                        ) : c.extension ? (
                          <span className="text-muted-foreground">
                            Interno <span className="tabular-nums">{c.extension}</span>
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </div>

                      {/* La durata di una chiamata persa è il tempo di SQUILLO,
                          non di conversazione: dirlo evita di leggere "75s"
                          come una telefonata gestita. */}
                      <div className="w-24 text-right text-xs tabular-nums text-muted-foreground">
                        {persa ? `${durata(c.duration_seconds)} di squillo` : durata(c.duration_seconds)}
                      </div>

                      <div className="w-24 text-right text-xs text-muted-foreground">
                        <span className="text-foreground">{t.giorno}</span> {t.ora}
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        {totale > PAGE && (
          <div className="mt-3 flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground tabular-nums">
              {pagina * PAGE + 1}–{Math.min((pagina + 1) * PAGE, totale)} di {totale}
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={pagina === 0 || caricamento}
                onClick={() => setPagina((p) => Math.max(p - 1, 0))}
              >
                <ChevronLeft className="mr-1 h-4 w-4" aria-hidden="true" />
                Precedenti
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={pagina >= ultimaPagina || caricamento}
                onClick={() => setPagina((p) => p + 1)}
              >
                Successive
                <ChevronRight className="ml-1 h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          </div>
        )}

        <div className="mt-6">
          <Button variant="ghost" size="sm" onClick={() => setMostraInterni((v) => !v)}>
            <Settings2 className="mr-2 h-4 w-4" aria-hidden="true" />
            {mostraInterni ? "Nascondi gli interni" : "Dai un nome agli interni"}
          </Button>
          {mostraInterni && (
            <div className="mt-3">
              <ExtensionLabelsCard onSaved={() => void carica()} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
