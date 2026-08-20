import type { LucideIcon } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"

/**
 * Stato per una sezione commerciale che NON ha ancora una base dati.
 *
 * Nasce da una misura: in questo database non esiste nessuna tabella per
 * trattative, attivita' commerciali o appuntamenti. Le pagine Pipeline,
 * Attivita' e Calendario mostravano quindi contenuto interamente inventato
 * (trattative con importi, telefonate mai avvenute, giornate piene di
 * impegni), con una riga in fondo che dichiarava "Dati demo locali".
 *
 * Perche' un componente unico e non tre schermate separate: le tre pagine
 * dicono la stessa cosa, e in tre copie quella cosa verrebbe scritta in tre modi
 * diversi appena una viene toccata.
 *
 * Cosa NON fa: non promette una data e non finge un caricamento in corso.
 * Dichiara che cosa manca perche' la sezione funzioni — e quale strumento c'e'
 * GIA' per lo stesso bisogno, quando c'e' — perche' una pagina che dice solo
 * "nessun dato" lascia chi legge a chiedersi se sia rotta.
 */
export function CrmNotAvailable({
  icon: Icon,
  titolo,
  cosaFarebbe,
  cosaManca,
  children,
}: {
  icon: LucideIcon
  titolo: string
  /** A cosa servira' la sezione, al presente e senza promesse temporali. */
  cosaFarebbe: string
  /** Che cosa manca, in concreto, perche' possa mostrare dati veri. */
  cosaManca: string
  /** Eventuale rimando a uno strumento che copre lo stesso bisogno oggi. */
  children?: React.ReactNode
}) {
  return (
    <Card>
      <CardContent className="p-8 text-center">
        <Icon className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
        <p className="mt-3 text-sm font-medium text-foreground">{titolo}</p>
        <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground text-pretty leading-relaxed">{cosaFarebbe}</p>
        <p className="mx-auto mt-3 max-w-xl text-xs text-muted-foreground text-pretty leading-relaxed">{cosaManca}</p>
        {children ? <div className="mt-4 text-xs text-muted-foreground text-pretty">{children}</div> : null}
      </CardContent>
    </Card>
  )
}
