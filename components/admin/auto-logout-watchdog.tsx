"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { usePathname } from "next/navigation"
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
 * Movimenti, tasti, clic, tocchi, rotelle e navigazione interna. La navigazione
 * e' esplicita attivita' dell'utente e va contata anche se, per qualunque motivo,
 * l'evento del mouse non viene osservato prima del cambio route.
 */

/** Ogni quanto controlliamo se il tempo e' scaduto. */
const PASSO_MS = 5_000

/** Ogni quanto si rilegge il tempo dal server. */
const RILETTURA_MS = 10 * 60_000

export function AutoLogoutWatchdog() {
  const pathname = usePathname()
  const [minuti, setMinuti] = useState<number | null>(null)
  const [secondiRimasti, setSecondiRimasti] = useState<number | null>(null)
  const ultimaAttivita = useRef<number>(Date.now())
  const uscendo = useRef(false)

  const esci = useCallback(async () => {
    if (uscendo.current) return
    uscendo.current = true
    try {
      const supabase = createClient()
      await supabase.auth.signOut()
    } catch {
      // Anche se la chiusura lato server non riesce, portiamo via la persona
      // dalle pagine con i dati: restare qui sarebbe il peggiore dei due esiti.
    }
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

  // Quando la policy di timeout viene caricata o cambia, il conteggio parte da
  // quel momento. Non deve usare retroattivamente il tempo trascorso mentre il
  // browser ancora non conosceva la policy.
  useEffect(() => {
    if (minuti === null) return
    ultimaAttivita.current = Date.now()
    setSecondiRimasti(null)
  }, [minuti])

  // 2) Registra l'attivita' fisica.
  useEffect(() => {
    if (minuti === null) return

    const segna = () => {
      ultimaAttivita.current = Date.now()
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

  // 3) Anche un cambio pagina interno e' attivita' certa dell'utente. Questo
  // evita che una navigazione (es. click su "Impostazioni") coincida con lo
  // scadere del timer e venga interpretata come inattivita'.
  useEffect(() => {
    if (minuti === null) return
    ultimaAttivita.current = Date.now()
    setSecondiRimasti(null)
  }, [pathname, minuti])

  // 4) Controlla la scadenza.
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
      setSecondiRimasti(mancano <= preavvisoMs ? Math.ceil(mancano / 1000) : null)
    }

    controlla()
    const t = setInterval(controlla, PASSO_MS)
    return () => clearInterval(t)
  }, [minuti, esci])

  if (secondiRimasti === null) return null

  return (
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
