"use client"

/**
 * Il gestionale dentro HotelAccelerator, e cio' che l'agente impara guardando.
 *
 * DUE COSE MISURATE, che spiegano la forma di questa pagina:
 *
 * 1. La cornice FUNZIONA. Scidoo non manda `X-Frame-Options` ne' una CSP che
 *    vieti l'inquadratura: l'iframe si carica davvero dentro il nostro sito.
 *
 * 2. Guardare dentro la cornice NO. Provato nel browser: leggere il contenuto
 *    di una cornice di un altro sito, o installarci un ascoltatore dei clic,
 *    solleva `SecurityError`. Con una cornice su una NOSTRA pagina lo stesso
 *    codice funziona (controllo positivo) ⇒ il rifiuto e' il confine fra siti
 *    diversi, non un difetto nostro. Nessuna impostazione lo apre.
 *
 * CONSEGUENZA SULLA PAGINA: la cornice qui e' utile (un posto solo per
 * lavorare), ma NON registra niente. L'osservazione richiede una sorgente
 * privilegiata - un browser comandato dal nostro server - che oggi non e'
 * collegata. Percio' l'elenco vuoto DICE che nessuna sorgente e' collegata,
 * invece di mostrare "nessuna procedura" facendo credere che lo staff non abbia
 * fatto nulla: un vuoto senza spiegazione e' la bugia piu' facile da scrivere.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import useSWR from "swr"
import Link from "next/link"
import {
  ArrowLeft,
  ArrowRight,
  ExternalLink,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Maximize2,
  Minimize2,
} from "lucide-react"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
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

export default function PmsShadowPage() {
  const { data: cfg, isLoading: cfgCarica } = useSWR<ConfigStato>("/api/crm/pms-config", fetcher, {
    revalidateOnFocus: false,
  })
  /*
   * Serve solo per decidere se MOSTRARE il rimando all'area riservata.
   *
   * Si leggono le aree effettive, cioe' la stessa fonte che presidia la pagina
   * di destinazione: nessuna regola duplicata da tenere allineata. Per gli
   * amministratori `areas` arriva vuoto (nessun filtro), percio' `isAdmin` va
   * controllato a parte, altrimenti l'unica persona che vede tutto sarebbe
   * l'unica a non vedere il rimando.
   */
  const { data: me } = useSWR<{ isAdmin?: boolean; areas?: string[] }>("/api/platform/me", fetcher, {
    revalidateOnFocus: false,
  })
  const puoVedereApprendimento = me?.isAdmin === true || (me?.areas ?? []).includes("pms_learning")

  const [corniceAperta, setCorniceAperta] = useState(false)

  /**
   * SCHERMO PIENO. Il gestionale e' un'interfaccia densa: dentro un riquadro
   * stretto le colonne di destra restano tagliate e la persona non riesce a
   * lavorarci. Qui usiamo lo schermo pieno del browser, non un finto
   * ingrandimento con CSS: solo il primo esce davvero dal menu e dalla barra
   * del nostro sito, restituendo alla cornice tutta l'altezza dello schermo.
   *
   * Lo stato NON si aggiorna al clic: si aggiorna ascoltando il browser
   * (`fullscreenchange`). Cosi' l'uscita con il tasto Esc - che avviene senza
   * passare dal nostro pulsante - non lascia il pulsante a dire il falso.
   */
  const contenitoreRef = useRef<HTMLDivElement | null>(null)
  const [schermoPieno, setSchermoPieno] = useState(false)

  useEffect(() => {
    const allinea = () => setSchermoPieno(Boolean(document.fullscreenElement))
    document.addEventListener("fullscreenchange", allinea)
    return () => document.removeEventListener("fullscreenchange", allinea)
  }, [])

  const cambiaSchermoPieno = useCallback(() => {
    const el = contenitoreRef.current
    if (!el) return
    if (document.fullscreenElement) {
      void document.exitFullscreen()
    } else {
      // Puo' essere rifiutata (permessi del browser): in quel caso lo stato
      // resta invariato perche' dipende dall'evento, non dal clic.
      void el.requestFullscreen?.().catch(() => undefined)
    }
  }, [])

  const webUrl = cfg?.config?.webUrl ?? null
  const nomePms = cfg?.config?.nome ?? cfg?.config?.pmsType ?? "il gestionale"

  return (
    /**
     * Larghezza: il gestionale ha bisogno di spazio. Con `max-w-5xl` (~1024px)
     * meno i margini della scheda, a Scidoo restavano circa 900px e le colonne
     * di destra finivano tagliate. Qui la pagina usa la larghezza disponibile;
     * i testi restano leggibili perche' hanno un limite loro.
     */
    <main className="mx-auto flex w-full max-w-[1700px] flex-col gap-6 px-4 py-6">
      <header className="flex flex-col gap-2">
        <Link
          href="/admin/crm/pms-sync"
          className="inline-flex w-fit items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Torna alla sincronizzazione
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight text-balance">Gestionale e apprendimento</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
          {
            "Apri il gestionale senza uscire da HotelAccelerator, e raccogli le procedure che lo staff ripete piu' spesso."
          }
        </p>
      </header>

      {/* --- Il gestionale incorniciato: funziona oggi --- */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{`Apri ${nomePms} qui dentro`}</CardTitle>
          <CardDescription className="leading-relaxed">
            {
              "Il gestionale resta il suo: nessun dato passa da noi in questo riquadro. Serve solo a non dover saltare fra due schede."
            }
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {cfgCarica ? (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              Lettura della configurazione...
            </p>
          ) : !webUrl ? (
            <div className="flex flex-col gap-3 rounded-md border border-dashed p-4">
              <p className="flex items-center gap-2 text-sm font-medium">
                <KeyRound className="size-4 text-muted-foreground" aria-hidden="true" />
                {"Indirizzo del gestionale non dichiarato"}
              </p>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {
                  "Non lo indoviniamo noi: cambia da struttura a struttura, e un indirizzo sbagliato aprirebbe il riquadro sul sito di qualcun altro. Inseriscilo nella configurazione e questa schermata si accende."
                }
              </p>
              <Button asChild size="sm" variant="secondary" className="w-fit">
                <Link href="/admin/crm/pms-sync/config">Vai alla configurazione</Link>
              </Button>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant={corniceAperta ? "secondary" : "default"} onClick={() => setCorniceAperta((v) => !v)}>
                  {corniceAperta ? (
                    <>
                      <EyeOff className="size-4" aria-hidden="true" />
                      Chiudi il gestionale
                    </>
                  ) : (
                    <>
                      <Eye className="size-4" aria-hidden="true" />
                      Apri il gestionale
                    </>
                  )}
                </Button>
                {corniceAperta ? (
                  <Button size="sm" variant="ghost" onClick={cambiaSchermoPieno}>
                    {schermoPieno ? (
                      <>
                        <Minimize2 className="size-4" aria-hidden="true" />
                        Esci da schermo pieno
                      </>
                    ) : (
                      <>
                        <Maximize2 className="size-4" aria-hidden="true" />
                        Schermo pieno
                      </>
                    )}
                  </Button>
                ) : null}
                <Button asChild size="sm" variant="ghost">
                  <a href={webUrl} target="_blank" rel="noreferrer noopener">
                    <ExternalLink className="size-4" aria-hidden="true" />
                    Apri in una scheda nuova
                  </a>
                </Button>
                <span className="text-xs text-muted-foreground">{webUrl}</span>
              </div>

              {corniceAperta ? (
                /**
                 * Nessun attributo `sandbox`: il gestionale ha bisogno di
                 * cookie, moduli e finestre per far entrare la persona. Una
                 * restrizione sbagliata qui non darebbe un errore chiaro, darebbe
                 * un riquadro bianco o un login che non completa mai - e
                 * sembrerebbe un guasto nostro. Il contenuto resta comunque
                 * illeggibile per noi: e' il browser a garantirlo, non noi.
                 */
                <div
                  ref={contenitoreRef}
                  className={
                    schermoPieno
                      ? "flex h-screen w-screen flex-col bg-background"
                      : "flex w-full flex-col"
                  }
                >
                  <iframe
                    src={webUrl}
                    title={`${nomePms} (gestionale esterno)`}
                    /**
                     * Altezza: prima era fissa a 640px e tagliava il gestionale
                     * in basso. Ora segue la finestra (togliendo lo spazio di
                     * intestazione e pulsanti) e a schermo pieno prende tutto.
                     * Il minimo evita che su una finestra molto bassa il
                     * riquadro diventi una fessura inutilizzabile.
                     */
                    className={
                      schermoPieno
                        ? "h-full w-full border-0 bg-background"
                        : "h-[calc(100vh-19rem)] min-h-[560px] w-full rounded-md border bg-background"
                    }
                    referrerPolicy="no-referrer"
                  />
                </div>
              ) : (
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {"Il riquadro si apre solo quando lo chiedi: caricare il gestionale a ogni visita rallenterebbe la pagina."}
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/*
       * --- Rimando all'area riservata ---
       *
       * L'elenco delle procedure NON e' piu' qui: e' il registro di come lavora
       * il personale e vive in un'area riservata (amministratore o capogruppo
       * autorizzato).
       *
       * Il rimando compare SOLO a chi puo' entrare davvero. La condizione legge
       * le stesse aree effettive che presidiano la pagina, quindi qui non c'e'
       * una seconda regola da tenere allineata: un collegamento mostrato a chi
       * verrebbe respinto sarebbe una porta disegnata su un muro.
       */}
      {puoVedereApprendimento && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{"Cosa ha imparato l'agente"}</CardTitle>
            <CardDescription className="leading-relaxed">
              {
                "Le procedure ripetute nel gestionale stanno in un'area riservata, perche' descrivono come lavorano le persone."
              }
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" size="sm">
              <Link href="/admin/crm/pms-sync/apprendimento">
                Apri l&apos;apprendimento dell&apos;agente
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </main>
  )
}
