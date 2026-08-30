"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import Link from "next/link"
import useSWR from "swr"
import { ExternalLink, KeyRound, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"

type ConfigStato = {
  configurata: boolean
  config: { name: string; webUrl: string; isActive: boolean } | null
}

type SessionePms = {
  source: "remote_browser"
  liveViewUrl: string
  expiresAt: string | null
  persistent: boolean
}

const fetcher = async (url: string) => {
  const res = await fetch(url, { credentials: "include" })
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`)
  return res.json()
}

const PMS_OBSERVER_POLL_MS = 4_000

/**
 * Porta il gestionale in primo piano e lascia a HotelAccelerator soltanto una
 * barra globale a scomparsa. La zona di richiamo e' un elemento della nostra
 * pagina sopra l'iframe: continua quindi a ricevere il puntatore anche se il
 * contenuto sottostante appartiene a un altro dominio.
 */
export default function PmsShadowPage() {
  const { data: cfg, isLoading, error } = useSWR<ConfigStato>("/api/crm/pms-browser-config", fetcher, {
    revalidateOnFocus: false,
  })

  useEffect(() => {
    const root = document.documentElement
    root.dataset.pmsMenuVisible = "false"

    return () => {
      delete root.dataset.pmsMenuVisible
    }
  }, [])

  const mostraMenu = () => {
    document.documentElement.dataset.pmsMenuVisible = "true"
  }

  const webUrl = cfg?.config?.isActive ? cfg.config.webUrl : null
  const nomePms = cfg?.config?.name ?? "Gestionale"
  const [sessione, setSessione] = useState<SessionePms | null>(null)
  const [avvio, setAvvio] = useState(false)
  const [erroreMacchina, setErroreMacchina] = useState(false)
  const avvioInCorso = useRef(false)

  const avviaMacchina = useCallback(async () => {
    if (!webUrl || avvioInCorso.current) return
    avvioInCorso.current = true
    setAvvio(true)
    setErroreMacchina(false)

    try {
      for (let tentativo = 0; tentativo < 8; tentativo++) {
        const response = await fetch("/api/crm/pms-browser-session", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
        })
        const body = (await response.json().catch(() => null)) as
          | (Partial<SessionePms> & { retryAfterMs?: number })
          | null

        if (response.ok && body?.liveViewUrl) {
          setSessione(body as SessionePms)
          return
        }

        const retryAfterMs = body?.retryAfterMs
        if (response.status === 409 && typeof retryAfterMs === "number" && retryAfterMs > 0 && tentativo < 7) {
          await new Promise((resolve) => setTimeout(resolve, Math.min(retryAfterMs, 3_000)))
          continue
        }

        throw new Error("Macchina PMS non disponibile")
      }
    } catch {
      // Continuita' operativa: se il browser remoto e' indisponibile, la
      // cornice diretta gia' usata in produzione continua a far lavorare lo
      // staff. Il dettaglio tecnico resta nei log server, non nel tenant.
      setErroreMacchina(true)
      setSessione(null)
    } finally {
      avvioInCorso.current = false
      setAvvio(false)
    }
  }, [webUrl])

  useEffect(() => {
    if (webUrl) void avviaMacchina()
  }, [webUrl, avviaMacchina])

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data !== "browserbase-disconnected") return
      setSessione(null)
      window.setTimeout(() => void avviaMacchina(), 3_000)
    }
    window.addEventListener("message", handleMessage)
    return () => window.removeEventListener("message", handleMessage)
  }, [avviaMacchina])

  useEffect(() => {
    if (!sessione) return

    let stopped = false
    let running = false

    const raccogli = async () => {
      if (stopped || running) return
      running = true
      try {
        await fetch("/api/crm/pms-shadow/observer", {
          method: "POST",
          credentials: "include",
          cache: "no-store",
        })
      } catch {
        // L'osservatore e' best-effort e non deve mai interrompere il lavoro nel
        // PMS. L'errore resta nei log server della route e verra' ritentato al
        // giro successivo.
      } finally {
        running = false
      }
    }

    void raccogli()
    const timer = window.setInterval(() => void raccogli(), PMS_OBSERVER_POLL_MS)

    return () => {
      stopped = true
      window.clearInterval(timer)

      // Prima svuotiamo gli ultimi gesti osservati, poi rilasciamo la macchina.
      // La catena evita la corsa in cui Browserbase viene chiuso mentre
      // l'osservatore sta ancora leggendo la pagina.
      void fetch("/api/crm/pms-shadow/observer", {
        method: "DELETE",
        credentials: "include",
        keepalive: true,
      })
        .catch(() => undefined)
        .finally(() =>
          fetch("/api/crm/pms-browser-session", {
            method: "DELETE",
            credentials: "include",
            keepalive: true,
          }).catch(() => undefined),
        )
    }
  }, [sessione])

  const iframeSrc = sessione?.liveViewUrl ?? webUrl

  return (
    <main
      data-pms-immersive-page
      className="fixed inset-0 z-[60] h-[100dvh] w-screen overflow-hidden overscroll-none bg-background"
    >
      <button
        type="button"
        aria-label="Mostra il menu HotelAccelerator"
        onMouseEnter={mostraMenu}
        onFocus={mostraMenu}
        onClick={mostraMenu}
        className="group fixed inset-x-0 top-0 z-[80] h-3 cursor-n-resize border-0 bg-gradient-to-b from-foreground/20 to-transparent outline-none focus:h-8 focus:bg-background/95"
      >
        <span className="sr-only group-focus:not-sr-only group-focus:text-xs group-focus:font-medium">
          Mostra il menu HotelAccelerator
        </span>
      </button>

      {isLoading || (webUrl && avvio && !sessione && !erroreMacchina) ? (
        <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          Apertura del gestionale...
        </div>
      ) : error ? (
        <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
          <p className="text-sm font-medium">Il gestionale non è disponibile in questo momento.</p>
          <p className="max-w-md text-sm text-muted-foreground">Riprova tra qualche minuto.</p>
        </div>
      ) : !webUrl ? (
        <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
          <KeyRound className="size-8 text-muted-foreground" aria-hidden="true" />
          <div className="space-y-1">
            <p className="font-medium">Collegamento al gestionale da completare</p>
            <p className="max-w-md text-sm text-muted-foreground">
              Inserisci l’indirizzo del PMS una sola volta nelle impostazioni della struttura.
            </p>
          </div>
          <Button asChild size="sm" variant="secondary">
            <Link href="/admin/crm/pms-sync/config">Apri le impostazioni PMS</Link>
          </Button>
        </div>
      ) : iframeSrc ? (
        <>
          <iframe
            src={iframeSrc}
            title={`${nomePms} (gestionale esterno)`}
            className="absolute inset-0 h-full w-full border-0 bg-background"
            referrerPolicy="no-referrer"
            sandbox={sessione ? "allow-same-origin allow-scripts" : undefined}
            allow={sessione ? "clipboard-read; clipboard-write" : undefined}
          />
          <Button
            asChild
            size="icon"
            variant="secondary"
            className="absolute bottom-3 right-3 z-10 size-9 rounded-full bg-background/90 shadow-md backdrop-blur"
          >
            <a href={webUrl} target="_blank" rel="noreferrer noopener" aria-label="Apri il gestionale in una nuova scheda">
              <ExternalLink className="size-4" aria-hidden="true" />
            </a>
          </Button>
        </>
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
          <p className="text-sm font-medium">Il gestionale non è disponibile in questo momento.</p>
          <Button size="sm" variant="secondary" onClick={() => void avviaMacchina()}>
            Riprova
          </Button>
        </div>
      )}
      {erroreMacchina ? <span className="sr-only">Connessione diretta al gestionale attiva.</span> : null}
    </main>
  )
}
