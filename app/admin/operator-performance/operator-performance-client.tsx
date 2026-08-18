"use client"

import { useState } from "react"
import useSWR from "swr"
import { AlertTriangle, Bot, Gauge, HelpCircle, Users } from "lucide-react"

import { AdminHeader } from "@/components/admin/admin-header"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { jsonFetcher } from "@/lib/swr-fetcher"

type Riga = {
  id: string | null
  nome: string
  genere: "persona" | "ia" | "non-attribuite"
  risposte: number
  conversazioni: number
  attesaMedianaSec: number | null
  attesaSu: number
  inGraduatoria: boolean
}

type Risposta = {
  righe: Riga[]
  giorni: number
  totaleRisposte: number
  risposteUmaneAttribuite: number
  risposteNonAttribuite: number
  risposteIa: number
  graduatoriaNonDisponibile: boolean
  soglia: number
  sorgentiEscluse: number
  conversione: { disponibile: false; motivo: string }
}

/**
 * Attesa in forma leggibile: 184.020 secondi non si leggono, "2 g 3 h" si.
 *
 * Sotto il minuto si mostrano i SECONDI: l'IA risponde in 2 secondi e
 * arrotondare dava "0 min", cioe' un dato vero che sembrava mancante.
 */
function durata(secondi: number | null): string {
  if (secondi === null) return "—"
  if (secondi < 60) return `${secondi} s`
  const minuti = Math.round(secondi / 60)
  if (minuti < 60) return `${minuti} min`
  const ore = Math.floor(minuti / 60)
  if (ore < 24) {
    const resto = minuti % 60
    return resto === 0 ? `${ore} h` : `${ore} h ${resto} min`
  }
  const giorni = Math.floor(ore / 24)
  const resto = ore % 24
  return resto === 0 ? `${giorni} g` : `${giorni} g ${resto} h`
}

const FINESTRE = [
  { valore: "7", etichetta: "Ultimi 7 giorni" },
  { valore: "30", etichetta: "Ultimi 30 giorni" },
  { valore: "90", etichetta: "Ultimi 90 giorni" },
  { valore: "365", etichetta: "Ultimo anno" },
]

export function OperatorPerformanceClient() {
  const [giorni, setGiorni] = useState("30")

  const { data, error, isLoading } = useSWR<Risposta>(
    `/api/platform/operator-performance?days=${giorni}`,
    jsonFetcher,
    { revalidateOnFocus: false },
  )

  const persone = data?.righe.filter((r) => r.genere === "persona") ?? []
  const ia = data?.righe.find((r) => r.genere === "ia")
  const senzaAutore = data?.righe.find((r) => r.genere === "non-attribuite")

  return (
    <div className="min-h-screen bg-background">
      <AdminHeader
        title="Performance operatori"
        subtitle="Quante risposte manda ciascuno e quanto attende chi scrive"
      />

      <main className="mx-auto max-w-5xl px-4 py-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          {/*
            La finestra e' un dato scelto da chi guarda, e l'etichetta della tendina
            e' l'unica fonte: cosi' non puo' dire "30 giorni" mentre il conto ne usa
            altri. Il numero applicato lo pubblica anche l'API (`giorni`).
          */}
          <Select value={giorni} onValueChange={setGiorni}>
            <SelectTrigger className="w-[190px]" aria-label="Periodo considerato">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FINESTRE.map((f) => (
                <SelectItem key={f.valore} value={f.valore}>
                  {f.etichetta}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {data ? (
            <p className="text-sm text-muted-foreground">
              {data.totaleRisposte === 0
                ? "Nessuna risposta nel periodo"
                : `${data.totaleRisposte} risposte negli ultimi ${data.giorni} giorni`}
              {data.sorgentiEscluse > 0
                ? ` · ${data.sorgentiEscluse} ${data.sorgentiEscluse === 1 ? "sorgente esclusa" : "sorgenti escluse"}`
                : ""}
            </p>
          ) : null}
        </div>

        {error ? (
          <Card className="border-destructive/40">
            <CardContent className="flex items-start gap-3 pt-6">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden="true" />
              <div>
                <p className="font-medium text-foreground">Non e&apos; stato possibile leggere i dati</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {error instanceof Error ? error.message : "Errore imprevisto"}
                </p>
              </div>
            </CardContent>
          </Card>
        ) : isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        ) : !data ? null : (
          <div className="space-y-6">
            {/*
              La graduatoria si nasconde quando i dati non la reggono, e si dice
              quanto manca. Misurato: con 3 risposte umane in tutto, un podio
              direbbe che chi ha risposto una volta in 1 minuto e' il piu' veloce
              della struttura.
            */}
            {data.graduatoriaNonDisponibile ? (
              <Card className="border-amber-500/40 bg-amber-500/5">
                <CardContent className="flex items-start gap-3 pt-6">
                  <Gauge className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />
                  <div>
                    <p className="font-medium text-foreground">Graduatoria non ancora disponibile</p>
                    <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                      Nessuna persona ha ancora {data.soglia} risposte nel periodo, il minimo per un confronto che
                      significhi qualcosa. Con pochi messaggi la classifica premierebbe il caso invece del lavoro. Qui
                      sotto ci sono i numeri di ciascuno, senza podio.
                    </p>
                  </div>
                </CardContent>
              </Card>
            ) : null}

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Users className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  Persone
                </CardTitle>
                <CardDescription>
                  L&apos;attesa e&apos; il tempo fra il messaggio di chi scrive e la risposta. Mediana, non media: una
                  singola risposta dopo il fine settimana sposterebbe la media di giorni.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {persone.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    Nessuna risposta attribuita a una persona nel periodo.
                  </p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Operatore</TableHead>
                        <TableHead className="text-right">Risposte</TableHead>
                        <TableHead className="text-right">Conversazioni</TableHead>
                        <TableHead className="text-right">Attesa mediana</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {persone.map((r) => (
                        <TableRow key={r.id ?? r.nome}>
                          <TableCell className="font-medium">
                            <span className="flex flex-wrap items-center gap-2">
                              {r.nome}
                              {!r.inGraduatoria ? (
                                <Badge variant="outline" className="text-xs font-normal">
                                  sotto {data.soglia} risposte
                                </Badge>
                              ) : null}
                            </span>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">{r.risposte}</TableCell>
                          <TableCell className="text-right tabular-nums">{r.conversazioni}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {durata(r.attesaMedianaSec)}{" "}
                            {/*
                              Lo spazio esplicito serve: a schermo si leggeva
                              "1 g 2 hsu 2 risposte" perche' JSX mangia lo spazio
                              a cavallo della riga.

                              Il denominatore accanto al valore: "12 h su 2 risposte"
                              si giudica, "12 h" da solo sembra una statistica solida.
                            */}
                            <span className="text-xs text-muted-foreground">
                              {r.attesaMedianaSec === null
                                ? "non calcolabile"
                                : `su ${r.attesaSu} ${r.attesaSu === 1 ? "risposta" : "risposte"}`}
                            </span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            {/*
              IA fuori classifica, ma visibile: ha mandato la maggior parte delle
              risposte e nasconderla farebbe sembrare la casella deserta.
            */}
            {ia && ia.risposte > 0 ? (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Bot className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    Risposte automatiche
                  </CardTitle>
                  <CardDescription>
                    Fuori classifica: l&apos;assistente risponde in pochi secondi e in una gara di velocita&apos;
                    vincerebbe sempre, rendendo illeggibile il confronto fra persone.
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-wrap gap-x-10 gap-y-3 text-sm">
                  <span>
                    <span className="text-muted-foreground">Risposte: </span>
                    <span className="font-medium tabular-nums">{ia.risposte}</span>
                  </span>
                  <span>
                    <span className="text-muted-foreground">Conversazioni: </span>
                    <span className="font-medium tabular-nums">{ia.conversazioni}</span>
                  </span>
                  <span>
                    <span className="text-muted-foreground">Attesa mediana: </span>
                    <span className="font-medium tabular-nums">{durata(ia.attesaMedianaSec)}</span>{" "}
                    {/* Spazio esplicito, non solo `ml-1`: il margine separa a vista ma
                        il testo resta attaccato ("2 ssu 37") per chi legge con uno
                        screen reader o copia il contenuto. */}
                    {ia.attesaMedianaSec !== null ? (
                      <span className="text-xs text-muted-foreground">
                        su {ia.attesaSu} {ia.attesaSu === 1 ? "risposta" : "risposte"}
                      </span>
                    ) : null}
                  </span>
                </CardContent>
              </Card>
            ) : null}

            {/*
              Le risposte senza autore vanno dette, non sottratte in silenzio: se
              sono la maggioranza, i numeri delle persone non descrivono il lavoro
              della struttura. Qui dentro finiscono anche gli autori non piu' in
              anagrafica, che altrimenti comparirebbero come operatori fantasma.
            */}
            {senzaAutore && senzaAutore.risposte > 0 ? (
              <Card className="border-dashed">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <HelpCircle className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    Risposte senza autore
                  </CardTitle>
                  <CardDescription>
                    {senzaAutore.risposte} risposte su {data.totaleRisposte} non risultano attribuite a nessuno: inviate
                    prima che il sistema registrasse chi risponde, oppure da un profilo non piu&apos; presente in
                    anagrafica. Non entrano nei numeri delle persone.
                  </CardDescription>
                </CardHeader>
              </Card>
            ) : null}

            {/*
              La conversione manca e lo si dichiara col motivo. Stimarla dalle
              prenotazioni sarebbe un merito inventato: quelle misurate arrivano da
              notifiche automatiche del gestionale, non dal lavoro di chi risponde.
            */}
            <Card className="border-dashed">
              <CardHeader>
                <CardTitle className="text-base">Conversioni: dato non disponibile</CardTitle>
                <CardDescription>{data.conversione.motivo}</CardDescription>
              </CardHeader>
            </Card>
          </div>
        )}
      </main>
    </div>
  )
}
