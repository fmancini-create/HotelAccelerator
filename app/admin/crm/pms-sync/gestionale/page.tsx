"use client"

import { useEffect } from "react"
import Link from "next/link"
import useSWR from "swr"
import { ExternalLink, KeyRound, Loader2 } from "lucide-react"

import { Button } from "@/components/ui/button"

type ConfigStato = {
  configurata: boolean
  config: { pmsType: string | null; nome: string | null; webUrl: string | null; isActive: boolean } | null
}

const fetcher = async (url: string) => {
  const res = await fetch(url, { credentials: "include" })
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`)
  return res.json()
}

/**
 * Porta il gestionale in primo piano e lascia a HotelAccelerator soltanto una
 * barra globale a scomparsa. La zona di richiamo e' un elemento della nostra
 * pagina sopra l'iframe: continua quindi a ricevere il puntatore anche se il
 * contenuto sottostante appartiene a un altro dominio.
 */
export default function PmsShadowPage() {
  const { data: cfg, isLoading, error } = useSWR<ConfigStato>("/api/crm/pms-config", fetcher, {
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

  const webUrl = cfg?.config?.webUrl ?? null
  const nomePms = cfg?.config?.nome ?? cfg?.config?.pmsType ?? "Gestionale"

  return (
    <main data-pms-immersive-page className="relative h-full min-h-[520px] w-full overflow-hidden bg-background">
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

      {isLoading ? (
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
      ) : (
        <>
          <iframe
            src={webUrl}
            title={`${nomePms} (gestionale esterno)`}
            className="h-full w-full border-0 bg-background"
            referrerPolicy="no-referrer"
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
      )}
    </main>
  )
}
