"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Phone, Loader2 } from "lucide-react"

/**
 * Pulsante "Chiama" per il clic-per-chiamare via 3CX.
 *
 * Mostra SEMPRE l'esito, riuscito o fallito: un pulsante che non dice nulla
 * lascerebbe l'operatore a fissare il telefono chiedendosi se ha funzionato.
 * L'esito riuscito spiega anche cosa sta per accadere (squilla prima il suo
 * interno), altrimenti sembrerebbe non aver fatto niente.
 */
export function CallButton({
  destination,
  contactId,
  size = "sm",
  variant = "outline",
}: {
  destination: string
  contactId?: string
  size?: "sm" | "default" | "icon"
  variant?: "outline" | "default" | "ghost"
}) {
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null)

  async function call() {
    setBusy(true)
    setFeedback(null)
    try {
      const res = await fetch("/api/telephony/click-to-call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ destination, contact_id: contactId }),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok) {
        // Il messaggio del server e' scritto per essere letto da un operatore
        // (es. "Centralino non configurato"): lo mostro cosi' com'e' invece di
        // sostituirlo con un generico "errore".
        setFeedback({ ok: false, text: data?.error || `Chiamata non avviata (errore ${res.status}).` })
        return
      }
      setFeedback({ ok: true, text: data?.message || "Chiamata avviata." })
    } catch {
      setFeedback({ ok: false, text: "Impossibile contattare il servizio." })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <Button type="button" size={size} variant={variant} onClick={call} disabled={busy || !destination}>
        {busy ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <Phone className="mr-2 h-4 w-4" aria-hidden="true" />
        )}
        {busy ? "Avvio..." : "Chiama"}
      </Button>
      {feedback && (
        <p
          role="status"
          className={`text-xs text-pretty ${feedback.ok ? "text-muted-foreground" : "text-destructive"}`}
        >
          {feedback.text}
        </p>
      )}
    </div>
  )
}
