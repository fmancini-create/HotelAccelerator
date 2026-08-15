"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { Bersaglio } from "@/lib/inbox/target"
import { chiaveBersaglio } from "@/lib/inbox/target"

/** Come il pannello vede una lavorazione in corso. */
export interface LavorazioneInCorso {
  chiave: string
  label: string
  mio: boolean
  /** Da quando ci sta lavorando: serve per la scritta "da 3 minuti". */
  startedAt: string
}

/** Ogni quanto si chiede chi sta lavorando cosa. Volutamente breve: un elenco
 *  che si aggiorna ogni minuto mostrerebbe come "libero" un messaggio che un
 *  collega ha appena preso, ossia il difetto che stiamo prevenendo. */
const MS_SONDAGGIO_ELENCO = 12_000

/**
 * Presa in carico condivisa dell'inbox, dal lato del pannello.
 *
 * Tiene tre cose:
 *  - l'elenco di chi sta lavorando cosa (per offuscare le righe degli altri);
 *  - il battito del proprio blocco, finche' si scrive;
 *  - la presa e il rilascio.
 *
 * Il battito e' necessario perche' la scadenza e' a inattivita': senza, il
 * blocco morirebbe mentre l'operatore e' ancora nel mezzo di una risposta lunga.
 */
export function useInboxCollaboration(attivo: boolean) {
  const [lavorazioni, setLavorazioni] = useState<Map<string, LavorazioneInCorso>>(new Map())
  const [mioBersaglio, setMioBersaglio] = useState<Bersaglio | null>(null)

  // Riferimenti e non stato: cambiano spesso e non devono ridisegnare l'elenco.
  const battitoRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const bersaglioRef = useRef<Bersaglio | null>(null)

  const aggiornaElenco = useCallback(async () => {
    try {
      const res = await fetch("/api/inbox/collaboration/lock", { cache: "no-store" })
      if (!res.ok) return
      const dati = await res.json()
      const mappa = new Map<string, LavorazioneInCorso>()
      for (const l of dati.locks ?? []) {
        mappa.set(chiaveBersaglio(l.bersaglio), {
          chiave: chiaveBersaglio(l.bersaglio),
          label: l.titolare?.label ?? "un collega",
          mio: Boolean(l.mio),
          startedAt: l.startedAt,
        })
      }
      setLavorazioni(mappa)
    } catch {
      // Silenzio voluto: se la rete cade, l'inbox deve restare usabile.
      // Il rischio opposto (bloccare l'elenco per un sondaggio fallito) e' peggio.
    }
  }, [])

  useEffect(() => {
    if (!attivo) return
    aggiornaElenco()
    const t = setInterval(aggiornaElenco, MS_SONDAGGIO_ELENCO)
    return () => clearInterval(t)
  }, [attivo, aggiornaElenco])

  /** Prende in carico e avvia il battito. Restituisce chi lo tiene se occupato. */
  const prendi = useCallback(
    async (bersaglio: Bersaglio): Promise<{ ok: boolean; label?: string }> => {
      try {
        const res = await fetch("/api/inbox/collaboration/lock", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ target: bersaglio }),
        })
        if (!res.ok) return { ok: false }
        const dati = await res.json()

        if (dati.esito === "occupato") {
          await aggiornaElenco()
          return { ok: false, label: dati.lock?.titolare?.label }
        }

        bersaglioRef.current = bersaglio
        setMioBersaglio(bersaglio)

        // Il battito parte a un terzo della scadenza: due battiti persi non
        // devono bastare a farsi sfilare il blocco mentre si scrive.
        const secondi = Math.max(10, Math.floor((dati.idleSeconds ?? 180) / 3))
        if (battitoRef.current) clearInterval(battitoRef.current)
        battitoRef.current = setInterval(() => {
          const corrente = bersaglioRef.current
          if (!corrente) return
          fetch("/api/inbox/collaboration/lock", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ target: corrente }),
          }).catch(() => {})
        }, secondi * 1000)

        await aggiornaElenco()
        return { ok: true }
      } catch {
        return { ok: false }
      }
    },
    [aggiornaElenco],
  )

  const rilascia = useCallback(
    async (bersaglio?: Bersaglio) => {
      const da = bersaglio ?? bersaglioRef.current
      if (battitoRef.current) {
        clearInterval(battitoRef.current)
        battitoRef.current = null
      }
      bersaglioRef.current = null
      setMioBersaglio(null)
      if (!da) return
      try {
        await fetch("/api/inbox/collaboration/lock", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ target: da }),
        })
      } catch {
        // Se il rilascio non arriva, la scadenza a inattivita' libera comunque
        // il messaggio: e' proprio il caso per cui esiste.
      }
      await aggiornaElenco()
    },
    [aggiornaElenco],
  )

  // Chiudere la scheda del browser non deve lasciare il messaggio occupato fino
  // alla scadenza: qui si avvisa subito. `keepalive` serve perche' una fetch
  // normale viene annullata mentre la pagina si sta chiudendo.
  useEffect(() => {
    const allUscita = () => {
      const corrente = bersaglioRef.current
      if (!corrente) return
      try {
        fetch("/api/inbox/collaboration/lock", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ target: corrente }),
          keepalive: true,
        }).catch(() => {})
      } catch {}
    }
    window.addEventListener("pagehide", allUscita)
    return () => {
      window.removeEventListener("pagehide", allUscita)
      if (battitoRef.current) clearInterval(battitoRef.current)
    }
  }, [])

  // ── Bozze condivise ──
  //
  // Il salvataggio e' ritardato: scrivere una riga genera decine di battute, e
  // una richiesta per tasto premuto sarebbe uno spreco che rallenta l'inbox.
  const attesaBozzaRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const salvaBozza = useCallback((bersaglio: Bersaglio, testo: string, subject?: string) => {
    if (attesaBozzaRef.current) clearTimeout(attesaBozzaRef.current)
    attesaBozzaRef.current = setTimeout(() => {
      fetch("/api/inbox/collaboration/draft", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target: bersaglio, body: testo, subject }),
      }).catch(() => {})
    }, 1200)
  }, [])

  const leggiBozza = useCallback(async (bersaglio: Bersaglio): Promise<{ body: string; autore: string | null } | null> => {
    try {
      const url = `/api/inbox/collaboration/draft?kind=${bersaglio.kind}&key=${encodeURIComponent(bersaglio.key)}`
      const res = await fetch(url, { cache: "no-store" })
      if (!res.ok) return null
      const dati = await res.json()
      if (!dati?.draft?.body) return null
      return { body: dati.draft.body, autore: dati.draft.updatedByLabel ?? null }
    } catch {
      return null
    }
  }, [])

  /** Chiude la lavorazione senza invio: la bozza resta a disposizione di tutti,
   *  il blocco viene liberato. E' il caso "non l'ho spedito ma me ne vado". */
  const sospendi = useCallback(
    async (bersaglio: Bersaglio, testo: string) => {
      if (attesaBozzaRef.current) {
        clearTimeout(attesaBozzaRef.current)
        attesaBozzaRef.current = null
      }
      if (testo.trim()) {
        // Salvataggio immediato, non ritardato: qui si sta abbandonando il
        // messaggio, e un'attesa perderebbe le ultime parole scritte.
        await fetch("/api/inbox/collaboration/draft", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ target: bersaglio, body: testo }),
        }).catch(() => {})
      }
      await rilascia(bersaglio)
    },
    [rilascia],
  )

  return { lavorazioni, mioBersaglio, prendi, rilascia, aggiornaElenco, salvaBozza, leggiBozza, sospendi }
}
