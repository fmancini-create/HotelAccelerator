"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { AlertCircle, Building2, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"

/**
 * Aziende / Hotel — aggregato VERO del campo "Azienda" delle schede contatto.
 *
 * Qui prima c'erano tre strutture inventate con camere, referenti e "valore
 * potenziale" a piacere. Sostituite: l'elenco ora interroga
 * `/api/admin/crm/companies`, che raggruppa `contacts.company` nello scope della
 * struttura autenticata.
 *
 * Le colonne sono soltanto quelle che hanno una sorgente reale: nome, contatti,
 * citta', prenotazioni e ricavo arrivano da campi esistenti di `contacts`.
 * "Categoria", "camere", "owner" e "valore potenziale" sono state RIMOSSE
 * perche' non esistono in nessuna tabella: tenerle avrebbe richiesto di
 * inventarle di nuovo.
 */

interface Azienda {
  nome: string
  contatti: number
  citta: string[]
  prenotazioni: number
  ricavo_cents: number
  ultima_prenotazione: string | null
}

interface Risposta {
  aziende: Azienda[]
  riepilogo: {
    contatti: number
    con_azienda: number
    aziende: number
    lette: number
    troncato: boolean
  }
}

function euro(cents: number): string {
  return (cents / 100).toLocaleString("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 })
}

function dataBreve(iso: string | null): string {
  if (!iso) return "—"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  return d.toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric" })
}

export default function CrmCompaniesPage() {
  const [dati, setDati] = useState<Risposta | null>(null)
  const [caricamento, setCaricamento] = useState(true)
  const [errore, setErrore] = useState("")

  const carica = useCallback(async () => {
    setCaricamento(true)
    setErrore("")
    try {
      const res = await fetch("/api/admin/crm/companies")
      if (!res.ok) {
        const body = await res.json().catch(() => null)
        // Un errore di lettura NON deve diventare "nessuna azienda": sono due
        // cose diverse, e confonderle farebbe credere che l'anagrafica sia
        // vuota quando invece non e' stato possibile leggerla.
        setErrore(
          res.status === 401
            ? "Sessione scaduta: ricarica la pagina per rientrare."
            : res.status === 403
              ? "Non hai il permesso per l'area CRM."
              : body?.error || "Non è stato possibile leggere l'elenco delle aziende.",
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

  const r = dati?.riepilogo
  const aziende = dati?.aziende ?? []

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Aziende / Hotel</h1>
          <p className="text-muted-foreground text-pretty">
            I contatti raggruppati per il campo «Azienda» della loro scheda.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void carica()} disabled={caricamento}>
          <RefreshCw className={`mr-2 h-4 w-4 ${caricamento ? "animate-spin" : ""}`} aria-hidden="true" />
          Aggiorna
        </Button>
      </div>

      {caricamento && !dati ? (
        <Card>
          <CardContent className="space-y-3 p-4">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </CardContent>
        </Card>
      ) : errore ? (
        <Card>
          <CardContent className="p-6">
            <p className="flex items-start gap-2 text-sm text-destructive" role="alert">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="text-pretty">{errore}</span>
            </p>
          </CardContent>
        </Card>
      ) : aziende.length === 0 ? (
        /* Vuoto DICHIARATO, con i suoi numeri: "0 aziende" da solo sembrerebbe
           un guasto. Dire su quanti contatti e da quale campo si conta spiega
           il perche' e indica cosa fare per popolarlo. */
        <Card>
          <CardContent className="p-8 text-center">
            <Building2 className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
            <p className="mt-3 text-sm font-medium text-foreground">Nessuna azienda registrata</p>
            <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground text-pretty leading-relaxed">
              Questo elenco raggruppa i contatti per il campo «Azienda» della loro scheda. Oggi{" "}
              <span className="tabular-nums text-foreground">{r?.con_azienda ?? 0}</span> contatti su{" "}
              <span className="tabular-nums text-foreground">{r?.contatti ?? 0}</span> hanno quel campo compilato, quindi
              non c&apos;è ancora niente da raggruppare.
            </p>
            <p className="mx-auto mt-3 max-w-xl text-xs text-muted-foreground text-pretty leading-relaxed">
              Si popola da sé: compila «Azienda» in una{" "}
              <Link href="/admin/crm" className="underline">
                scheda contatto
              </Link>{" "}
              — o nel file di importazione — e la struttura comparirà qui con i suoi contatti, le prenotazioni e il
              ricavo già registrati.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <caption className="sr-only">
                  Aziende ricavate dal campo «Azienda» delle schede contatto, con contatti, prenotazioni e ricavo
                </caption>
                <thead className="border-b bg-muted/30 text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-medium">
                      Azienda
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium">
                      Contatti
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium">
                      Città
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium">
                      Prenotazioni
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium">
                      Ricavo registrato
                    </th>
                    <th scope="col" className="px-4 py-3 font-medium">
                      Ultima prenotazione
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {aziende.map((a) => (
                    <tr key={a.nome} className="hover:bg-muted/20">
                      <td className="px-4 py-3 font-medium">
                        <span className="inline-flex items-center gap-2">
                          <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                          {a.nome}
                        </span>
                      </td>
                      <td className="px-4 py-3 tabular-nums">{a.contatti}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {a.citta.length > 0 ? a.citta.join(", ") : "—"}
                      </td>
                      <td className="px-4 py-3 tabular-nums">{a.prenotazioni}</td>
                      {/* "Ricavo registrato", non "valore potenziale": e' la
                          somma di quanto risulta sulle schede, non una stima. */}
                      <td className="px-4 py-3 tabular-nums">{a.ricavo_cents > 0 ? euro(a.ricavo_cents) : "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground tabular-nums">
                        {dataBreve(a.ultima_prenotazione)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="border-t px-4 py-3 text-xs text-muted-foreground text-pretty leading-relaxed">
              <span className="tabular-nums text-foreground">{r?.aziende ?? 0}</span> aziende da{" "}
              <span className="tabular-nums text-foreground">{r?.con_azienda ?? 0}</span> contatti su{" "}
              <span className="tabular-nums text-foreground">{r?.contatti ?? 0}</span>. I nomi vengono accorpati
              ignorando maiuscole e spazi in eccesso.
              {r?.troncato ? " Elenco parziale: sono state lette le prime 20.000 schede." : ""}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
