"use client"

import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { findInvalidRecipients } from "@/lib/sales/email-recipients"
import { cn } from "@/lib/utils"

/**
 * Campi opzionali "Cc" (copia visibile) e "Ccn" (copia nascosta) per i
 * compositori email del CRM venditori. I valori sono stringhe libere: piu'
 * indirizzi separati da virgola/spazio. La normalizzazione e validazione
 * definitiva avviene lato server (parseRecipientList).
 *
 * Componente controllato: lo stato cc/bcc vive nel genitore, cosi' puo' essere
 * incluso nel corpo della richiesta di invio e azzerato dopo l'invio.
 */
export function CcBccFields({
  cc,
  bcc,
  onCcChange,
  onBccChange,
  disabled,
  className,
}: {
  cc: string
  bcc: string
  onCcChange: (v: string) => void
  onBccChange: (v: string) => void
  disabled?: boolean
  className?: string
}) {
  // Mostra i campi solo se l'utente li attiva (o se gia' compilati).
  const [showCc, setShowCc] = useState(cc.trim().length > 0)
  const [showBcc, setShowBcc] = useState(bcc.trim().length > 0)

  const invalidCc = findInvalidRecipients(cc)
  const invalidBcc = findInvalidRecipients(bcc)

  return (
    <div className={cn("space-y-2", className)}>
      {(!showCc || !showBcc) && (
        <div className="flex items-center gap-3 text-xs">
          {!showCc && (
            <button
              type="button"
              onClick={() => setShowCc(true)}
              disabled={disabled}
              className="font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline disabled:opacity-50"
            >
              + Aggiungi Cc
            </button>
          )}
          {!showBcc && (
            <button
              type="button"
              onClick={() => setShowBcc(true)}
              disabled={disabled}
              className="font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline disabled:opacity-50"
            >
              + Aggiungi Ccn
            </button>
          )}
        </div>
      )}

      {showCc && (
        <div className="grid gap-1">
          <Label htmlFor="email-cc" className="text-xs text-muted-foreground">
            Cc (copia visibile)
          </Label>
          <Input
            id="email-cc"
            value={cc}
            onChange={(e) => onCcChange(e.target.value)}
            disabled={disabled}
            placeholder="email1@esempio.it, email2@esempio.it"
            className="h-8 text-sm"
            autoComplete="off"
          />
          {invalidCc.length > 0 && (
            <p className="text-xs text-destructive">Indirizzi non validi: {invalidCc.join(", ")}</p>
          )}
        </div>
      )}

      {showBcc && (
        <div className="grid gap-1">
          <Label htmlFor="email-bcc" className="text-xs text-muted-foreground">
            Ccn (copia nascosta)
          </Label>
          <Input
            id="email-bcc"
            value={bcc}
            onChange={(e) => onBccChange(e.target.value)}
            disabled={disabled}
            placeholder="email1@esempio.it, email2@esempio.it"
            className="h-8 text-sm"
            autoComplete="off"
          />
          {invalidBcc.length > 0 && (
            <p className="text-xs text-destructive">Indirizzi non validi: {invalidBcc.join(", ")}</p>
          )}
        </div>
      )}
    </div>
  )
}
