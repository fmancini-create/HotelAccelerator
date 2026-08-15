"use client"

import { FileText } from "lucide-react"
import type { BozzaInSospeso } from "@/hooks/use-inbox-collaboration"

/**
 * Vista "Bozze": i messaggi con una risposta iniziata e non spedita.
 *
 * Esiste come vista propria e non come filtro dell'elenco perche' le bozze
 * stanno in una tabella a parte e l'elenco dei messaggi e' paginato: una bozza
 * lasciata su una conversazione di tre mesi fa non comparirebbe mai scorrendo,
 * cioe' proprio il caso in cui serve ("dov'era finita quella risposta?").
 *
 * Mostra chi l'ha iniziata perche' le bozze sono condivise: chi rientra deve
 * sapere se sta riprendendo il lavoro di un collega o il proprio.
 */
export function VistaBozze({
  bozze,
  onApri,
}: {
  bozze: BozzaInSospeso[]
  onApri: (bozza: BozzaInSospeso) => void
}) {
  if (bozze.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <FileText className="mb-3 h-10 w-10" />
        <p className="text-sm">Nessuna bozza in sospeso</p>
      </div>
    )
  }

  return (
    <ul className="divide-y divide-border">
      {bozze.map((bozza) => {
        // Chi l'ha iniziata e' il riferimento; se l'ha poi modificata un altro
        // si dice anche quello, altrimenti la riga attribuirebbe a una persona
        // sola un testo scritto in due.
        const iniziata = bozza.creataDa ?? "un collega"
        const modificataDaAltri = bozza.aggiornataDa && bozza.aggiornataDa !== bozza.creataDa

        return (
          <li key={bozza.chiave}>
            <button
              type="button"
              onClick={() => onApri(bozza)}
              className="flex w-full flex-col gap-1 px-4 py-3 text-left transition-colors hover:bg-muted/50"
            >
              <div className="flex min-w-0 items-center gap-2">
                <FileText className="h-4 w-4 flex-shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="truncate text-sm font-medium text-foreground">
                  {bozza.oggetto?.trim() || bozza.interlocutore?.trim() || "Messaggio senza oggetto"}
                </span>
                <time
                  className="ml-auto flex-shrink-0 text-xs text-muted-foreground"
                  dateTime={bozza.aggiornataIl}
                >
                  {new Date(bozza.aggiornataIl).toLocaleDateString("it-IT", { day: "numeric", month: "short" })}
                </time>
              </div>

              <p className="truncate pl-6 text-sm text-muted-foreground">{bozza.body}</p>

              <p className="pl-6 text-xs text-muted-foreground">
                Iniziata da {iniziata}
                {modificataDaAltri ? `, modificata da ${bozza.aggiornataDa}` : null}
              </p>
            </button>
          </li>
        )
      })}
    </ul>
  )
}
