"use client"

import { Lock } from "lucide-react"

/**
 * Etichetta "In lavorazione da ..." mostrata sulla riga di un messaggio che un
 * collega sta scrivendo.
 *
 * Un solo componente per entrambe le modalita' dell'inbox (multicanale e
 * Gmail): sono due elenchi diversi, ma l'operatore deve vedere lo stesso
 * segnale, altrimenti imparerebbe due linguaggi per la stessa cosa.
 */
export function InLavorazioneBadge({ label, compatto = false }: { label: string; compatto?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded border border-ha-warning-soft-foreground/30 bg-ha-warning-soft px-1.5 py-0.5 text-[11px] font-medium text-ha-warning-soft-foreground ${
        compatto ? "max-w-[150px]" : ""
      }`}
      // Il titolo ripete l'informazione per intero: nell'elenco stretto il nome
      // viene troncato, e "In lavorazione da Mar..." non dice chi e'.
      title={`In lavorazione da ${label}`}
    >
      <Lock className="h-3 w-3 flex-shrink-0" aria-hidden="true" />
      <span className="truncate">In lavorazione da {label}</span>
    </span>
  )
}
