"use client"

import { useCallback, useEffect, useState } from "react"
import { Copy, Eye, EyeOff, KeyRound, RefreshCw, AlertTriangle } from "lucide-react"

import { AdminHeader } from "@/components/admin/admin-header"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
// Sonner e NON `@/hooks/use-toast`: nell'area admin il contenitore montato e'
// quello di Sonner (`components/admin/client-toaster.tsx`), quindi gli avvisi
// mandati con l'altro sistema NON comparirebbero a schermo.
import { toast } from "sonner"

type Stato = {
  hasToken: boolean
  masked: string | null
  tokenLength: number
  hashPresent: boolean
  /**
   * Il server sa calcolare l'impronta del token? Se no la rigenerazione e'
   * impossibile, e il pulsante va spento CON la ragione: premerlo darebbe un
   * errore che non dipende da chi lo preme.
   */
  hashSecretPresent: boolean
  manubotConfigured: boolean
  endpoint: string
}

export function ApiAccessClient() {
  const [stato, setStato] = useState<Stato | null>(null)
  const [caricamento, setCaricamento] = useState(true)
  const [inCorso, setInCorso] = useState<"reveal" | "rotate" | null>(null)
  const [tokenInChiaro, setTokenInChiaro] = useState<string | null>(null)
  const [appenaRigenerato, setAppenaRigenerato] = useState(false)

  const carica = useCallback(async () => {
    try {
      const risposta = await fetch("/api/admin/api-access")
      if (!risposta.ok) throw new Error("stato non disponibile")
      setStato((await risposta.json()) as Stato)
    } catch {
      // Si lascia `stato` a null: la vista distingue "non caricato" da "assente".
      setStato(null)
    } finally {
      setCaricamento(false)
    }
  }, [])

  useEffect(() => {
    void carica()
  }, [carica])

  async function azione(tipo: "reveal" | "rotate") {
    setInCorso(tipo)
    try {
      const risposta = await fetch("/api/admin/api-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: tipo }),
      })
      const dati = await risposta.json()
      if (!risposta.ok) {
        toast.error(
          tipo === "rotate" ? "Rigenerazione non riuscita" : "Impossibile mostrare il token",
          { description: dati?.error ?? "Errore inatteso" },
        )
        return
      }
      setTokenInChiaro(dati.token as string)
      if (tipo === "rotate") {
        setAppenaRigenerato(true)
        await carica()
      }
    } catch {
      toast.error("Errore di rete")
    } finally {
      setInCorso(null)
    }
  }

  async function copia(valore: string, cosa: string) {
    try {
      await navigator.clipboard.writeText(valore)
      toast.success(`${cosa} copiato`)
    } catch {
      toast.error("Copia non riuscita")
    }
  }

  return (
    /* Stesso contenitore e stessa intestazione della pagina Domini, che sta nella
       medesima sezione: l'intestazione la mette il componente, non il layout. */
    <div className="container mx-auto max-w-4xl space-y-6 px-4 py-8">
      <AdminHeader
        title="Accesso API"
        subtitle="Token con cui un sistema esterno legge i dati di questa struttura"
      />

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <KeyRound className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
            <CardTitle className="text-base">Token della struttura</CardTitle>
          </div>
          {/* Nessun distintivo quando lo stato NON e' caricato: dire "Assente"
              perche' la richiesta e' fallita sarebbe un'affermazione falsa, dato
              che il token puo' esistere benissimo. "Assente" appare solo quando
              il server ha risposto dicendo che non c'e'. */}
          {stato ? (
            stato.hasToken ? (
              <Badge variant="secondary">Attivo</Badge>
            ) : (
              <Badge variant="destructive">Assente</Badge>
            )
          ) : null}
        </CardHeader>

        <CardContent className="space-y-4">
          {caricamento ? (
            <p className="text-sm text-muted-foreground">Caricamento…</p>
          ) : stato?.hasToken ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <code className="rounded bg-muted px-3 py-2 font-mono text-sm">
                  {tokenInChiaro ?? stato.masked}
                </code>

                {tokenInChiaro ? (
                  <>
                    <Button variant="outline" size="sm" onClick={() => setTokenInChiaro(null)}>
                      <EyeOff className="mr-2 h-4 w-4" />
                      Nascondi
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void copia(tokenInChiaro, "Token")}
                    >
                      <Copy className="mr-2 h-4 w-4" />
                      Copia
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void azione("reveal")}
                    disabled={inCorso !== null}
                  >
                    <Eye className="mr-2 h-4 w-4" />
                    {inCorso === "reveal" ? "Recupero…" : "Mostra"}
                  </Button>
                )}

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={inCorso !== null || !stato.hashSecretPresent}
                      title={
                        stato.hashSecretPresent
                          ? undefined
                          : "Rigenerazione non disponibile: manca il segreto di hashing sul server"
                      }
                    >
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Rigenera
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Rigenerare il token?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Il token attuale smette di funzionare subito. Ogni sistema che lo usa va
                        aggiornato con il valore nuovo.
                        {stato.manubotConfigured
                          ? " Su questa struttura ManuBot è collegato e usa lo stesso token: fino all'aggiornamento i suoi invii verranno rifiutati."
                          : ""}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Annulla</AlertDialogCancel>
                      <AlertDialogAction onClick={() => void azione("rotate")}>
                        Rigenera
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>

              {!stato.hashSecretPresent && (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    La rigenerazione è disattivata: su questo ambiente manca il segreto con cui il
                    server calcola l&apos;impronta del token. Mostrare e copiare il token attuale
                    funziona comunque.
                  </AlertDescription>
                </Alert>
              )}

              {appenaRigenerato && (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    Token rigenerato. Aggiorna ora i sistemi che lo usano
                    {stato.manubotConfigured ? ", ManuBot compreso" : ""}.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          ) : !stato ? (
            /* Stato NON caricato: si dice solo che non si sa. Qui prima cadeva il
               ramo "non ha ancora un token", che a schermo affermava il falso —
               col token realmente presente nel database. */
            <p className="text-sm text-muted-foreground">
              Stato del token non disponibile: la richiesta al server non è andata a buon fine.
              Ricarica la pagina per riprovare.
            </p>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Questa struttura non ha ancora un token. Generane uno per consentire le letture
                esterne.
              </p>
              {/* Stessa condizione della rigenerazione: la generazione passa dalla
                  stessa scrittura doppia, quindi senza segreto di hashing e'
                  altrettanto impossibile. */}
              {!stato.hashSecretPresent && (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    Generazione non disponibile: su questo ambiente manca il segreto con cui il
                    server calcola l&apos;impronta del token.
                  </AlertDescription>
                </Alert>
              )}
              <Button
                size="sm"
                onClick={() => void azione("rotate")}
                disabled={inCorso !== null || !stato.hashSecretPresent}
              >
                <KeyRound className="mr-2 h-4 w-4" />
                Genera token
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Le istruzioni si mostrano SOLO con lo stato caricato: senza `endpoint`
          l'indirizzo restava un riquadro vuoto e i pulsanti "Copia" risultavano
          attivi pur non avendo nulla da copiare (verificato a schermo). */}
      {stato && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Come si usa</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="space-y-2">
              <p className="font-medium">Indirizzo da chiamare</p>
              <div className="flex flex-wrap items-center gap-2">
                <code className="rounded bg-muted px-3 py-2 font-mono text-xs">
                  {stato.endpoint}
                </code>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void copia(stato.endpoint, "Indirizzo")}
                >
                  <Copy className="mr-2 h-4 w-4" />
                  Copia
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <p className="font-medium">Intestazione di autenticazione</p>
              <code className="block rounded bg-muted px-3 py-2 font-mono text-xs">
                Authorization: Bearer &lt;token&gt;
              </code>
              {/* L'avvertenza sul `www` si mostra SOLO se l'indirizzo lo contiene
                  davvero: in sviluppo l'indirizzo e' `http://localhost:3000` e la
                  nota indicava una parte inesistente (visto a schermo). */}
              {stato.endpoint.includes("://www.") ? (
                <p className="text-muted-foreground leading-relaxed">
                  Usa esattamente questo indirizzo, con <code className="font-mono">www</code>:
                  senza di esso la richiesta viene rediretta e l&apos;intestazione di autenticazione
                  può andare perduta, restituendo un errore di accesso.
                </p>
              ) : (
                <p className="text-muted-foreground leading-relaxed">
                  Usa esattamente questo indirizzo, senza modificarlo: un redirect può far perdere
                  l&apos;intestazione di autenticazione e restituire un errore di accesso.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
