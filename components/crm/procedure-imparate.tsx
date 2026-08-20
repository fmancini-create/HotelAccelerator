"use client"

/**
 * L'elenco di cio' che l'agente ha imparato guardando lavorare nel gestionale.
 *
 * Stava dentro la pagina del gestionale. E' stato estratto qui perche' ora vive
 * in un'area riservata (amministratore o capogruppo autorizzato): tenerne due
 * copie avrebbe garantito che, alla prima modifica, le due schermate avrebbero
 * detto cose diverse sulla stessa cosa.
 *
 * PERCHE' L'ELENCO VUOTO SPIEGA SE STESSO. Nessuna sorgente di osservazione e'
 * ancora collegata: il browser vieta a un sito di leggere dentro la cornice di
 * un altro sito (misurato: SecurityError su una cornice Scidoo, mentre su una
 * nostra pagina lo stesso codice funziona). Quindi zero righe significa
 * "nessuno sta guardando", non "lo staff non ha fatto nulla". Un vuoto senza
 * spiegazione e' la bugia piu' facile da scrivere.
 */

import useSWR from "swr"
import { Loader2, ShieldAlert, TriangleAlert } from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"

export type Procedura = {
  id: string
  pms_type: string
  title: string
  occurrences: number
  risk: "basso" | "medio" | "alto"
  status: "osservata" | "proposta" | "autonoma" | "bloccata"
  autonomy_threshold: number
  steps_summary: unknown
  first_seen_at: string
  last_seen_at: string
}

type ProcedureStato = { procedure: Procedura[]; sogliaPredefinita: number }

const fetcher = async (url: string) => {
  const res = await fetch(url, { credentials: "include" })
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`)
  return res.json()
}

const ETICHETTA_STATO: Record<Procedura["status"], string> = {
  osservata: "Solo osservata",
  proposta: "Propone e attende",
  autonoma: "Agisce da sola",
  bloccata: "Bloccata da una persona",
}

const ETICHETTA_RISCHIO: Record<Procedura["risk"], string> = {
  basso: "Rischio basso",
  medio: "Rischio medio",
  alto: "Rischio alto",
}

export function ProcedureImparate() {
  const {
    data: proc,
    isLoading,
    error,
  } = useSWR<ProcedureStato>("/api/crm/pms-shadow/events", fetcher, { revalidateOnFocus: false })

  const procedure = proc?.procedure ?? []
  const soglia = proc?.sogliaPredefinita ?? null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{"Cosa ha imparato l'agente"}</CardTitle>
        <CardDescription className="leading-relaxed">
          {soglia
            ? `Una procedura passa da osservata a proposta quando la stessa sequenza si ripete ${soglia} volte. Le azioni a rischio alto restano sempre da approvare.`
            : "Le procedure che lo staff ripete, raccolte guardando come si lavora."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {isLoading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            Lettura delle procedure...
          </p>
        ) : error ? (
          <p className="flex items-start gap-2 text-sm text-destructive">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {"Le procedure non sono leggibili in questo momento. Meglio dirlo che mostrare un elenco vuoto."}
          </p>
        ) : procedure.length === 0 ? (
          <div className="flex flex-col gap-3 rounded-md border border-dashed p-4">
            <p className="flex items-center gap-2 text-sm font-medium">
              <ShieldAlert className="size-4 text-muted-foreground" aria-hidden="true" />
              {"Nessuna sorgente di osservazione collegata"}
            </p>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {
                "L'elenco e' vuoto perche' nessuno sta guardando, non perche' lo staff non abbia fatto nulla. La cornice del gestionale non puo' registrare: il browser vieta a un sito di leggere dentro la cornice di un altro sito, e vale anche per noi."
              }
            </p>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {
                "Per imparare serve un browser comandato dal nostro server, che va acceso su una macchina sempre attiva. Le tabelle e la porta d'ingresso sono pronte: appena la sorgente e' collegata, le procedure appaiono qui."
              }
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {procedure.map((p) => {
              const mancanti = Math.max(0, p.autonomy_threshold - p.occurrences)
              return (
                <li key={p.id} className="flex flex-col gap-2 rounded-md border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium">{p.title}</p>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={p.risk === "alto" ? "destructive" : p.risk === "medio" ? "secondary" : "outline"}>
                        {ETICHETTA_RISCHIO[p.risk]}
                      </Badge>
                      <Badge variant={p.status === "autonoma" ? "default" : "outline"}>
                        {ETICHETTA_STATO[p.status]}
                      </Badge>
                    </div>
                  </div>
                  <Separator />
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    {`Vista ${p.occurrences} ${p.occurrences === 1 ? "volta" : "volte"}.`}{" "}
                    {p.risk === "alto"
                      ? "Tocca soldi o cancellazioni: resta da approvare a mano, qualunque sia il numero di ripetizioni."
                      : p.status === "autonoma"
                        ? "Ha superato la soglia e agisce da sola."
                        : mancanti > 0
                          ? `Altre ${mancanti} ripetizioni prima di poter agire da sola.`
                          : "Ha raggiunto la soglia: attende conferma."}
                  </p>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
