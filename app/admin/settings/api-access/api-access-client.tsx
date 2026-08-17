"use client"

/**
 * Pagina "Accesso API": consegna il token della struttura a un consumatore
 * esterno (Santaddeo) senza passare dal database.
 *
 * DUE AZIONI, DELIBERATAMENTE ASIMMETRICHE:
 *  - "Mostra il token" NON cambia nulla: e' il gesto normale, perche' il token
 *    e' gia' in chiaro in colonna e serve solo copiarlo;
 *  - "Rigenera" invalida il precedente e, se ManuBot e' configurato, INTERROMPE
 *    l'arrivo dei task finche' il nuovo valore non viene messo anche la'.
 * Per questo la rigenerazione chiede conferma e l'avviso appare solo quando il
 * dato dice che ManuBot c'e' davvero (`manubotConfigured`), invece di spaventare
 * sempre.
 */

import { useCallback, useEffect, useState } from "react"
import { AlertTriangle, Check, Copy, Eye, KeyRound, Loader2, RefreshCw } from "lucide-react"
import { AdminHeader } from "@/components/admin/admin-header"
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
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

type Stato = {
  property: { id: string; name: string | null }
  hasToken: boolean
  masked: string | null
  tokenLength: number | null
  hashPresent: boolean
  manubotConfigured: boolean
  endpoint: string
}

export function ApiAccessClient() {
  const [stato, setStato] = useState<Stato | null>(null)
  const [caricamento, setCaricamento] = useState(true)
  const [errore, setErrore] = useState<string | null>(null)
  const [tokenInChiaro, setTokenInChiaro] = useState<string | null>(null)
  const [inCorso, setInCorso] = useState<"reveal" | "rotate" | null>(null)
  const [copiato, setCopiato] = useState<string | null>(null)
  const [appenaRigenerato, setAppenaRigenerato] = useState(false)

  const carica = useCallback(async () => {
    setCaricamento(true)
    setErrore(null)
    try {
      const r = await fetch("/api/admin/api-access", { cache: "no-store" })
      const j = await r.json()
      if (!r.ok) throw new Error(j?.error ?? "Impossibile leggere lo stato del token")
      setStato(j as Stato)
    } catch (e) {
      setErrore(e instanceof Error ? e.message : "Errore inatteso")
    } finally {
      setCaricamento(false)
    }
  }, [])

  useEffect(() => {
    void carica()
  }, [carica])

  async function azione(action: "reveal" | "rotate") {
    setInCorso(action)
    setErrore(null)
    try {
      const r = await fetch("/api/admin/api-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j?.error ?? "Operazione non riuscita")
      setTokenInChiaro(j.token as string)
      setAppenaRigenerato(action === "rotate")
      if (action === "rotate") await carica()
    } catch (e) {
      setErrore(e instanceof Error ? e.message : "Errore inatteso")
    } finally {
      setInCorso(null)
    }
  }

  async function copia(testo: string, quale: string) {
    try {
      await navigator.clipboard.writeText(testo)
      setCopiato(quale)
      setTimeout(() => setCopiato(null), 2000)
    } catch {
      setErrore("Copia non riuscita: seleziona il testo e copialo a mano.")
    }
  }

  if (caricamento) {
    return (
      <div className="flex min-h-[420px] items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const esempio = stato
    ? `curl -H "Authorization: Bearer ${tokenInChiaro ?? "<token>"}" \\\n  "${stato.endpoint}?year=${new Date().getFullYear()}&month=${new Date().getMonth() + 1}"`
    : ""

  return (
    <div className="container mx-auto max-w-4xl space-y-6 px-4 py-8">
      <AdminHeader
        title="Accesso API"
        subtitle="Il token con cui un sistema esterno legge i dati di questa struttura"
      />

      {errore && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{errore}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <span className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-md bg-muted text-muted-foreground">
                <KeyRound className="h-4 w-4" />
              </span>
              <div>
                <CardTitle className="text-base">Token della struttura</CardTitle>
                <CardDescription className="mt-1">
                  {stato?.property.name ?? "Struttura"} — un solo token, valido sia per le letture in
                  uscita sia per il webhook in entrata.
                </CardDescription>
              </div>
            </div>
            {stato?.hasToken ? (
              <Badge variant="secondary">Attivo</Badge>
            ) : (
              <Badge variant="destructive">Assente</Badge>
            )}
          </div>
        </CardHeader>

        <CardContent className="space-y-4">
          {stato?.hasToken ? (
            <div className="space-y-3">
              <div className="rounded-md border bg-muted/40 p-3">
                <code className="block break-all font-mono text-sm text-foreground">
                  {tokenInChiaro ?? stato.masked}
                </code>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {!tokenInChiaro && (
                  <Button variant="outline" size="sm" onClick={() => void azione("reveal")} disabled={inCorso !== null}>
                    {inCorso === "reveal" ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Eye className="mr-2 h-4 w-4" />
                    )}
                    Mostra il token
                  </Button>
                )}

                {tokenInChiaro && (
                  <Button variant="outline" size="sm" onClick={() => void copia(tokenInChiaro, "token")}>
                    {copiato === "token" ? (
                      <Check className="mr-2 h-4 w-4" />
                    ) : (
                      <Copy className="mr-2 h-4 w-4" />
                    )}
                    {copiato === "token" ? "Copiato" : "Copia il token"}
                  </Button>
                )}

                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="sm" disabled={inCorso !== null}>
                      <RefreshCw className="mr-2 h-4 w-4" />
                      Rigenera
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Rigenerare il token?</AlertDialogTitle>
                      <AlertDialogDescription asChild>
                        <div className="space-y-2 text-sm">
                          <p>Il token attuale smette di funzionare immediatamente.</p>
                          {stato.manubotConfigured && (
                            <p className="font-medium text-destructive">
                              ManuBot è collegato a questa struttura e usa lo stesso token: finché non
                              inserisci il nuovo valore anche in ManuBot, i task non arriveranno più.
                            </p>
                          )}
                          <p>
                            Rigenera solo se il token è stato esposto per errore. Per consegnarlo a un
                            nuovo sistema basta mostrarlo.
                          </p>
                        </div>
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Annulla</AlertDialogCancel>
                      <AlertDialogAction onClick={() => void azione("rotate")}>
                        Rigenera comunque
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>

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
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Questa struttura non ha ancora un token. Generane uno per consentire le letture
                esterne.
              </p>
              <Button size="sm" onClick={() => void azione("rotate")} disabled={inCorso !== null}>
                {inCorso === "rotate" ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <KeyRound className="mr-2 h-4 w-4" />
                )}
                Genera il token
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Come si usa</CardTitle>
          <CardDescription>
            La struttura non si indica come parametro: è quella a cui appartiene il token.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Indirizzo</p>
            <div className="flex items-start gap-2">
              <code className="flex-1 break-all rounded-md border bg-muted/40 p-3 font-mono text-sm">
                {stato?.endpoint}
              </code>
              <Button
                variant="outline"
                size="sm"
                onClick={() => stato && void copia(stato.endpoint, "endpoint")}
              >
                {copiato === "endpoint" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                <span className="sr-only">Copia l&apos;indirizzo</span>
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Esempio</p>
            <div className="flex items-start gap-2">
              <pre className="flex-1 overflow-x-auto rounded-md border bg-muted/40 p-3 font-mono text-xs leading-relaxed">
                {esempio}
              </pre>
              <Button variant="outline" size="sm" onClick={() => void copia(esempio, "esempio")}>
                {copiato === "esempio" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                <span className="sr-only">Copia l&apos;esempio</span>
              </Button>
            </div>
            {!tokenInChiaro && stato?.hasToken && (
              <p className="text-xs text-muted-foreground">
                Mostra il token perché compaia già dentro l&apos;esempio.
              </p>
            )}
          </div>

          <div className="space-y-2 border-t pt-4">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Da sapere prima di integrare
            </p>
            <ul className="space-y-1.5 text-sm leading-relaxed text-muted-foreground">
              <li>
                Periodo: <code className="font-mono text-xs">?year=&amp;month=</code> per un mese, oppure{" "}
                <code className="font-mono text-xs">?start=&amp;end=</code> in formato{" "}
                <code className="font-mono text-xs">YYYY-MM-DD</code>, al massimo 400 giorni. Senza
                parametri risponde col mese corrente.
              </li>
              <li>
                Le telefonate stanno in <code className="font-mono text-xs">calls</code> e NON entrano nel
                calendario né in <code className="font-mono text-xs">totalSearches</code>: per una richiesta
                la data è la notte chiesta, per una telefonata è il giorno della chiamata. Per questo{" "}
                <code className="font-mono text-xs">bySource.phone</code> può valere 0 mentre{" "}
                <code className="font-mono text-xs">calls.received</code> è alto.
              </li>
              <li>
                <code className="font-mono text-xs">intensity</code> vale low, medium, high o very_high ed è
                relativa al periodo richiesto, non una soglia assoluta.
              </li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
