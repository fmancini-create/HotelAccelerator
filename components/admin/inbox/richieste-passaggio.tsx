"use client"

import { ArrowRightLeft, Check, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { RichiestaPassaggio } from "@/hooks/use-inbox-transfer"

/**
 * Le richieste di passaggio rivolte a chi sta guardando.
 *
 * Sta in cima all'elenco e non dentro il messaggio: chi deve concedere il
 * passaggio spesso sta lavorando su un'altra conversazione, e un avviso visibile
 * solo aprendo il messaggio contestato non lo raggiungerebbe mai.
 */
export function RichiestePassaggio({
  richieste,
  inCorso,
  onRispondi,
}: {
  richieste: RichiestaPassaggio[]
  /** Id della richiesta su cui e' in corso una risposta: evita il doppio clic. */
  inCorso: string | null
  onRispondi: (richiestaId: string, concedi: boolean) => void
}) {
  if (richieste.length === 0) return null

  return (
    <div className="flex flex-col gap-2 border-b border-border bg-ha-warning-soft px-3 py-3">
      {richieste.map((r) => {
        const attesa = inCorso === r.id
        return (
          <div key={r.id} className="flex flex-wrap items-center gap-2">
            <ArrowRightLeft className="h-4 w-4 shrink-0 text-ha-warning-soft-foreground" aria-hidden="true" />
            <p className="min-w-0 flex-1 text-sm leading-relaxed text-ha-warning-soft-foreground">
              <span className="font-medium">{r.richiedente}</span> chiede il passaggio di un messaggio
              {r.titolare ? <> in carico a {r.titolare}</> : null}
              {r.motivo ? <>: &ldquo;{r.motivo}&rdquo;</> : null}
            </p>
            <div className="flex shrink-0 items-center gap-2">
              <Button size="sm" variant="outline" disabled={attesa} onClick={() => onRispondi(r.id, false)}>
                <X className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                Rifiuta
              </Button>
              <Button size="sm" disabled={attesa} onClick={() => onRispondi(r.id, true)}>
                <Check className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                {attesa ? "Attendi…" : "Concedi"}
              </Button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
