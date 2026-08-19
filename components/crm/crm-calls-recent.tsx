"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { AlertCircle, PhoneIncoming, PhoneMissed, PhoneOutgoing, RefreshCw } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { numeroLeggibile, etichettaEsito } from "@/lib/telephony/display"

/**
 * Le ultime telefonate VERE, lette da `/api/telephony/calls`.
 *
 * Volutamente ridotto all'osso: filtri, ricerca e paginazione vivono in
 * `/admin/calls`, e riprodurli qui creerebbe un secondo registro da tenere
 * allineato. Questo riquadro risponde a una sola domanda — «cos'e' successo al
 * telefono di recente» — e per il resto rimanda la'.
 *
 * `numeroLeggibile` ed `etichettaEsito` sono le stesse funzioni del registro:
 * cosi' un numero e un esito non possono essere scritti in due modi diversi
 * nelle due pagine.
 */

const QUANTE = 8

interface Chiamata {
  id: string
  direction: string | null
  status: string
  status_source: string
  number: string | null
  started_at: string | null
  duration_seconds: number | null
  contact: { id: string; name: string | null; company: string | null } | null
  extension: string | null
  extension_label: string | null
  handled_by: string | null
}

interface Risposta {
  calls: Chiamata[]
  total: number
  summary: { filtered: number; missed: number; unknown_number: number; today: number }
}

function durata(secondi: number | null): string {
  if (secondi === null) return "—"
  if (secondi < 60) return `${secondi}s`
  const m = Math.floor(secondi / 60)
  const s = secondi % 60
  return s === 0 ? `${m} min` : `${m} min ${s}s`
}

function quando(iso: string | null): string {
  if (!iso) return "—"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  const oggi = new Date()
  const ieri = new Date(oggi)
  ieri.setDate(oggi.getDate() - 1)
  const ora = d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })
  const stesso = (a: Date, b: Date) => a.toDateString() === b.toDateString()
  if (stesso(d, oggi)) return `Oggi ${ora}`
  if (stesso(d, ieri)) return `Ieri ${ora}`
  return `${d.toLocaleDateString("it-IT", { day: "numeric", month: "short" })} ${ora}`
}

export function CrmCallsRecent() {
  const [dati, setDati] = useState<Risposta | null>(null)
  const [caricamento, setCaricamento] = useState(true)
  const [errore, setErrore] = useState("")

  const carica = useCallback(async () => {
    setCaricamento(true)
    setErrore("")
    try {
      const res = await fetch(`/api/telephony/calls?limit=${QUANTE}`)
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        // Errore di lettura in uno stato PROPRIO: mostrare "nessuna telefonata"
        // quando la lettura non riesce farebbe credere che il centralino abbia
        // smesso di registrare.
        setErrore(
          res.status === 401
            ? "Sessione scaduta: ricarica la pagina per rientrare."
            : res.status === 403
              ? "Non hai il permesso per l'area Telefonate."
              : body?.error || "Non è stato possibile leggere il registro.",
        )
        setDati(null)
        return
      }
      setDati((await res.json()) as Risposta)
    } catch {
      setErrore("Non è stato possibile contattare il server.")
      setDati(null)
    } finally {
      setCaricamento(false)
    }
  }, [])

  useEffect(() => {
    void carica()
  }, [carica])

  const chiamate = dati?.calls ?? []

  return (
    <Card>
      <CardContent className="p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
          <div>
            <p className="text-sm font-medium text-foreground">Ultime telefonate</p>
            {dati && (
              <p className="text-xs text-muted-foreground">
                <span className="tabular-nums text-foreground">{dati.summary.today}</span> oggi ·{" "}
                <span className="tabular-nums text-foreground">{dati.total}</span> in tutto il registro
              </p>
            )}
          </div>
          <Button variant="ghost" size="sm" onClick={() => void carica()} disabled={caricamento}>
            <RefreshCw className={`mr-2 h-4 w-4 ${caricamento ? "animate-spin" : ""}`} aria-hidden="true" />
            Aggiorna
          </Button>
        </div>

        {caricamento && !dati ? (
          <div className="space-y-3 p-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : errore ? (
          <p className="flex items-start gap-2 p-6 text-sm text-destructive" role="alert">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="text-pretty">{errore}</span>
          </p>
        ) : chiamate.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-sm text-muted-foreground text-pretty">Nessuna telefonata registrata.</p>
            <p className="mx-auto mt-2 max-w-md text-xs text-muted-foreground text-pretty leading-relaxed">
              Il registro si popola da solo quando il centralino è collegato: si configura in{" "}
              <Link href="/admin/channels/phone" className="underline">
                Canali → Telefono IP
              </Link>
              .
            </p>
          </div>
        ) : (
          <ul className="divide-y">
            {chiamate.map((c) => {
              const persa = c.status === "missed"
              const inArrivo = c.direction === "inbound"
              const Icona = persa ? PhoneMissed : inArrivo ? PhoneIncoming : PhoneOutgoing
              return (
                <li key={c.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
                  <Icona
                    className={`h-4 w-4 shrink-0 ${persa ? "text-destructive" : "text-muted-foreground"}`}
                    aria-hidden="true"
                  />
                  <div className="min-w-44 flex-1">
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
                      {/* L'esito dedotto dal timeout del gruppo non si chiama
                          "Senza risposta" come quello dichiarato dal centralino:
                          `etichettaEsito` distingue le due cose, e usarla qui
                          evita di spacciare una nostra deduzione per un dato
                          certificato. */}
                      {persa && (
                        <Badge variant="destructive" className="text-xs">
                          {etichettaEsito(c.status, c.status_source)}
                        </Badge>
                      )}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {c.contact?.name && c.number ? (
                        <span className="tabular-nums">{numeroLeggibile(c.number)}</span>
                      ) : (
                        <span>{inArrivo ? "In arrivo" : "In uscita"}</span>
                      )}
                      {c.handled_by ? ` · ${c.handled_by}` : c.extension_label ? ` · ${c.extension_label}` : ""}
                    </p>
                  </div>
                  {/* Per una chiamata persa la durata è tempo di SQUILLO: dirlo
                      evita di leggere "75s" come una telefonata gestita. */}
                  <div className="w-32 text-right text-xs tabular-nums text-muted-foreground">
                    {persa ? `${durata(c.duration_seconds)} di squillo` : durata(c.duration_seconds)}
                  </div>
                  <div className="w-28 text-right text-xs text-muted-foreground tabular-nums">
                    {quando(c.started_at)}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
