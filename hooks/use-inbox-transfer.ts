"use client"

import { useCallback, useEffect, useState } from "react"
import type { Bersaglio } from "@/lib/inbox/target"
import { chiaveBersaglio } from "@/lib/inbox/target"

/**
 * Richieste di passaggio, lato pannello.
 *
 * Il modulo e la rotta esistevano gia' ma nessuno li chiamava: per l'operatore
 * una funzione senza chiamanti non esiste, e il pannello gli diceva persino
 * "puoi chiedere il passaggio" senza offrirgli un modo per farlo. Questo hook e'
 * quel modo.
 */

/** Una richiesta come la mostra il pannello. */
export interface RichiestaPassaggio {
  id: string
  bersaglio: Bersaglio
  richiedente: string
  titolare: string | null
  destinatario: "holder" | "admin"
  motivo: string | null
  creataIl: string
}

/** Ogni quanto si guarda se e' arrivata una richiesta. Chi aspetta un passaggio
 *  sta fermo davanti allo schermo: un giro lento sembrerebbe un guasto. */
const MS_SONDAGGIO = 8000

export function useInboxTransfer(attivo: boolean) {
  /** Rivolte a me: devo rispondere. */
  const [daGestire, setDaGestire] = useState<RichiestaPassaggio[]>([])
  /** Aperte da me: servono a mostrare "in attesa" invece di far ripremere. */
  const [mie, setMie] = useState<RichiestaPassaggio[]>([])
  const [inCorso, setInCorso] = useState<string | null>(null)

  const aggiorna = useCallback(async () => {
    try {
      const res = await fetch("/api/inbox/collaboration/transfer", { cache: "no-store" })
      if (!res.ok) return
      const dati = await res.json()
      setDaGestire(dati.incoming ?? [])
      setMie(dati.mine ?? [])
    } catch {
      // Silenzio voluto: l'inbox deve restare usabile anche se questo giro cade.
    }
  }, [])

  useEffect(() => {
    if (!attivo) return
    aggiorna()
    const t = setInterval(aggiorna, MS_SONDAGGIO)
    return () => clearInterval(t)
  }, [attivo, aggiorna])

  /**
   * Chiede il passaggio. Il destinatario NON lo decide chi chiede: lo decide il
   * permesso di chi tiene il messaggio, e il server lo comunica indietro perche'
   * il pannello possa dire a chi e' andata la richiesta. "Richiesta inviata" e
   * basta lascerebbe l'operatore a chiedersi chi deve rispondergli.
   */
  const chiedi = useCallback(
    async (bersaglio: Bersaglio, motivo?: string): Promise<{ ok: boolean; destinatario?: "holder" | "admin"; giaAperta?: boolean; errore?: string }> => {
      setInCorso(chiaveBersaglio(bersaglio))
      try {
        const res = await fetch("/api/inbox/collaboration/transfer", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ target: bersaglio, reason: motivo }),
        })
        const dati = await res.json().catch(() => ({}))
        if (!res.ok) return { ok: false, errore: dati?.error ?? "Richiesta non riuscita" }
        await aggiorna()
        return { ok: true, destinatario: dati.destinatario, giaAperta: dati.giaAperta === true }
      } catch {
        return { ok: false, errore: "Richiesta non riuscita" }
      } finally {
        // Nel `finally`: se la chiamata fallisce, il pulsante deve tornare
        // premibile, altrimenti resta bloccato in "invio..." per sempre.
        setInCorso(null)
      }
    },
    [aggiorna],
  )

  /** Accetta o rifiuta. Concedere libera il messaggio ma non lo assegna: chi ha
   *  chiesto lo prende scrivendo, con le regole di tutti. */
  const rispondi = useCallback(
    async (richiestaId: string, concedi: boolean): Promise<{ ok: boolean; errore?: string }> => {
      setInCorso(richiestaId)
      try {
        const res = await fetch("/api/inbox/collaboration/transfer", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ requestId: richiestaId, grant: concedi }),
        })
        const dati = await res.json().catch(() => ({}))
        await aggiorna()
        if (!res.ok) return { ok: false, errore: dati?.error ?? "Risposta non riuscita" }
        return { ok: true }
      } catch {
        return { ok: false, errore: "Risposta non riuscita" }
      } finally {
        setInCorso(null)
      }
    },
    [aggiorna],
  )

  /** Ho gia' una richiesta aperta su questo messaggio? */
  const hoGiaChiesto = useCallback(
    (bersaglio: Bersaglio) => mie.some((r) => chiaveBersaglio(r.bersaglio) === chiaveBersaglio(bersaglio)),
    [mie],
  )

  return { daGestire, mie, inCorso, chiedi, rispondi, hoGiaChiesto, aggiorna }
}
