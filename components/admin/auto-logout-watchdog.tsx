"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Button } from "@/components/ui/button"
import { secondiPreavviso, tempoAmmesso } from "@/lib/auth/auto-logout"

/**
 * Disconnessione automatica per inattivita'.
 *
 * Sta nel layout amministrativo, quindi gira su ogni pagina per ogni membro
 * (stessa forma di `OperatorPresenceBeacon`). Non disegna nulla finche' non c'e'
 * da avvisare.
 *
 * COME CONTA IL TEMPO
 * Non con un contatore che scende, ma confrontando l'ORA dell'ultima attivita'
 * con l'ora corrente. La differenza conta: un `setInterval` in una scheda in
 * secondo piano viene rallentato dal browser, e un contatore a decremento
 * perderebbe colpi — la sessione resterebbe aperta molto oltre il tempo scelto
 * proprio nel caso piu' rischioso, cioe' quando nessuno sta guardando.
 *
 * COSA CONTA COME ATTIVITA'
 * Movimenti, tasti, clic, tocchi e rotelle. NON il semplice passare del tempo
 * con la pagina aperta: una pagina aperta su un monitor del ricevimento e'
 * esattamente la situazione da cui questa funzione protegge.
 */

/** Ogni quanto controlliamo se il tempo e' scaduto. */
const PASSO_MS = 5_000

/**
 * Ogni quanto si rilegge il tempo dal server. Serve perche' un amministratore
 * puo' cambiarlo mentre la persona sta lavorando: senza questo, la modifica
 * avrebbe effetto solo al prossimo accesso.
 */
const RILETTURA_MS = 10 * 60_000

export function AutoLogoutWatchdog() {
  const [minuti, setMinuti] = useState<number | null>(null)
  const [secondiRimasti, setSecondiRimasti] = useState<number | null>(null)

  // L'ultima attivita' sta in un ref e non in uno stato: cambia a ogni
  // movimento del mouse, e uno stato farebbe ridisegnare la pagina centinaia di
  // volte al minuto.
  const ultimaAttivita = useRef<number>(Date.now())
  const uscendo = useRef(false)

  const esci = useCallback(async () => {
    // Una sola volta: senza questa guardia, due scadenze ravvicinate
    // lancerebbero due uscite e la seconda troverebbe la sessione gia' chiusa.
    if (uscendo.current) return
    uscendo.current = true
    try {
      const supabase = createClient()
      await supabase.auth.signOut()
    } catch {
      // Anche se la chiusura lato server non riesce, portiamo via la persona
      // dalle pagine con i dati: restare qui sarebbe il peggiore dei due esiti.
    }
    // Stessa uscita del menu utente: ricarica piena, cosi' non resta in memoria
    // nessun dato della sessione. Il parametro serve solo a spiegare perche'
    // si e' tornati all'accesso, invece di farlo sembrare un guasto.
    window.location.href = "/admin?disconnesso=inattivita"
  }, [])

  // 1) Legge il proprio tempo, e lo rilegge periodicamente.
  useEffect(() => {
    let vivo = true

    const leggi = async () => {
      try {
        const r = await fetch("/api/me/auto-logout", { cache: "no-store" })
        if (!r.ok || !vivo) return
        const dati = await r.json()
        const m = dati?.minuti
        // `tempoAmmesso` e non un semplice controllo di numero: se un giorno il
        // valore nel database uscisse dall'elenco, meglio non attivare nulla
        // che disconnettere con un tempo che nessuno ha scelto.
        setMinuti(tempoAmmesso(m) ? m : null)
      } catch {
        // Rete assente: non attiviamo nulla. Buttare fuori una persona perche'
        // una richiesta non e' arrivata sarebbe un danno causato da noi.
      }
    }

    void leggi()
    const t = setInterval(leggi, RILETTURA_MS)
    return () => {
      vivo = false
      clearInterval(t)
    }
  }, [])

  // 2) Registra l'attivita'.
  useEffect(() => {
    if (minuti === null) return

    const segna = () => {
      ultimaAttivita.current = Date.now()
      // Se l'avviso era comparso, un movimento lo fa sparire: e' il modo piu'
      // naturale di dire "sono qui", senza obbligare a cercare un pulsante.
      // React non ridisegna se il valore e' gia' null, quindi questa chiamata
      // e' innocua anche col mouse in movimento continuo.
      setSecondiRimasti(null)
    }

    const eventi = ["mousemove", "mousedown", "keydown", "touchstart", "wheel", "scroll"] as const
    for (const e of eventi) {
      window.addEventListener(e, segna, { passive: true })
    }
    return () => {
      for (const e of eventi) window.removeEventListener(e, segna)
    }
  }, [minuti])

  // 3) Controlla la scadenza.
  useEffect(() => {
    if (minuti === null) return

    const limiteMs = minuti * 60_000
    const preavvisoMs = secondiPreavviso(minuti) * 1000

    const controlla = () => {
      const inattivoDa = Date.now() - ultimaAttivita.current
      const mancano = limiteMs - inattivoDa

      if (mancano <= 0) {
        void esci()
        return
      }
      // L'avviso compare solo dentro la finestra di preavviso.
      setSecondiRimasti(mancano <= preavvisoMs ? Math.ceil(mancano / 1000) : null)
    }

    controlla()
    const t = setInterval(controlla, PASSO_MS)
    return () => clearInterval(t)
  }, [minuti, esci])

  if (secondiRimasti === null) return null

  return (
    // `role="alertdialog"` e non un riquadro qualsiasi: chi usa un lettore di
    // schermo deve sentire l'avviso appena compare, non scoprirlo dopo.
    <div
      role="alertdialog"
      aria-modal="false"
      aria-labelledby="auto-logout-titolo"
      className="fixed bottom-4 right-4 z-50 w-[min(22rem,calc(100vw-2rem))] rounded-xl border bg-card p-4 shadow-lg"
    >
      <p id="auto-logout-titolo" className="font-medium">
        Stai per essere disconnesso
      </p>
      <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
        {`Nessuna attività da un po'. Fra ${secondiRimasti} second${secondiRimasti === 1 ? "o" : "i"} la sessione si chiude.`}
      </p>
      <div className="mt-3 flex gap-2">
        <Button
          size="sm"
          onClick={() => {
            ultimaAttivita.current = Date.now()
            setSecondiRimasti(null)
          }}
        >
          Resta collegato
        </Button>
        <Button size="sm" variant="outline" onClick={() => void esci()}>
          Esci adesso
        </Button>
      </div>
    </div>
  )
}
