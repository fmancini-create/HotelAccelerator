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
import { numeroLeggibile, etichettaEsito } from "@/lib/telephony/display"

type Call = {
  id: string
  direction: string
  status: string
  /** "provider" = detto dal centralino; "ring_group_timeout" = dedotto da noi. */
  status_source: string
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
  { id: "all", label: "Tutte", query: "", ambito: "tutto il registro" },
  { id: "missed", label: "Senza risposta", query: "status=missed", ambito: "tra le senza risposta" },
  { id: "inbound", label: "In arrivo", query: "direction=inbound", ambito: "tra le in arrivo" },
  { id: "outbound", label: "In uscita", query: "direction=outbound", ambito: "tra le in uscita" },
  { id: "today", label: "Oggi", query: "today=1", ambito: "di oggi" },
] as const

function durata(secondi: number | null): string {
  if (secondi === null) return "—"
  if (secondi < 60) return `${secondi}s`
  const m = Math.floor(secondi / 60)
  const s = secondi % 60
  return s === 0 ? `${m} min` : `${m} min ${s}s`
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

  /**
   * A cosa si riferiscono i numeri in alto, scritto sotto ognuno.
   *
   * La ricerca per numero restringe l'elenco quanto una linguetta: se non
   * comparisse qui, cercando un numero i tre valori cambierebbero senza che
   * niente a schermo ne spieghi il motivo.
   */
  const ambito = useMemo(() => {
    const parti: string[] = []
    if (filtro !== "all") parti.push(FILTRI.find((f) => f.id === filtro)?.ambito ?? "")
    if (ricercaAttiva) parti.push(`numero ${ricercaAttiva}`)
    return parti.filter(Boolean).join(" · ") || "tutto il registro"
  }, [filtro, ricercaAttiva])

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
            telefonate sono rimaste senza risposta.

            I tre valori descrivono lo STESSO insieme — l'elenco aperto sotto —
            e ognuno lo dichiara sotto la cifra. Prima il primo riquadro diceva
            sempre "oggi" mentre gli altri due seguivano la linguetta attiva:
            si leggeva "44 chiamate, 5 senza risposta" credendo che parlassero
            della stessa giornata, quando il 5 riguardava solo le chiamate in
            uscita di TUTTO il registro. */}
        <div className="grid gap-3 sm:grid-cols-3">
          <Card>
            <CardContent className="flex items-baseline justify-between gap-3 py-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Telefonate</p>
                <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground">{conteggi.filtered}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{ambito}</p>
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
                <p className="mt-0.5 text-xs text-muted-foreground">{ambito}</p>
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
                <p className="mt-0.5 text-xs text-muted-foreground">{ambito}</p>
              </div>
              <UserPlus className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            </CardContent>
          </Card>
        </div>

        {/* Il conteggio della giornata resta leggibile senza fingere che sia
            l'ambito dei riquadri: quando si guarda altro, è una riga a parte. */}
        {filtro !== "today" && (
          <p className="mt-2 text-xs text-muted-foreground">
            Oggi: <span className="tabular-nums text-foreground">{conteggi.today}</span> telefonate in tutto.{" "}
            <button type="button" className="underline" onClick={() => { setFiltro("today"); setPagina(0) }}>
              Guarda solo oggi
            </button>
          </p>
        )}

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
                  const cadutaSulGruppo = persa && c.status_source === "ring_group_timeout"
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
                          {/* "Caduta al centralino" invece di "Senza risposta"
                              quando l'esito e' DEDOTTO dal timeout del gruppo:
                              il centralino non l'ha dichiarata persa, e dare
                              alle due cose la stessa etichetta spaccerebbe una
                              nostra deduzione per un dato certificato. */}
                          {persa && (
                            <Badge variant="destructive" className="text-xs">
                              {etichettaEsito(c.status, c.status_source)}
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
                          come una telefonata gestita.

                          Per le cadute sul gruppo si aggiunge "nessuno ha
                          risposto": la durata al timeout è indistinguibile da
                          una conversazione, ed è proprio l'equivoco che ha
                          tenuto nascoste 31 chiamate. */}
                      <div className="w-32 text-right text-xs tabular-nums text-muted-foreground">
                        {persa ? `${durata(c.duration_seconds)} di squillo` : durata(c.duration_seconds)}
                        {cadutaSulGruppo && (
                          <span className="block text-[11px] not-italic">nessuno ha risposto</span>
                        )}
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
