"use client"

import { useCallback, useEffect, useState } from "react"
import { toast } from "sonner"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AlertCircle, Folder, Inbox, Loader2, Mail } from "lucide-react"

type Cartella = {
  id: string
  name: string
  type: "system" | "user"
  visible: boolean
  conversazioni: number
  senzaCartella: boolean
}

type Casella = {
  id: string
  email_address: string
  folders: Cartella[]
  errore?: string
  conteggiTagliati?: boolean
}

export function CartelleEmail() {
  const [caselle, setCaselle] = useState<Casella[]>([])
  const [caricamento, setCaricamento] = useState(true)
  const [erroreGenerale, setErroreGenerale] = useState<string | null>(null)
  /** Cartella in salvataggio, come `casella:cartella`. */
  const [inSalvataggio, setInSalvataggio] = useState<string | null>(null)

  const carica = useCallback(async () => {
    setCaricamento(true)
    setErroreGenerale(null)
    try {
      const res = await fetch("/api/channels/email/folders", { cache: "no-store" })
      const dati = await res.json().catch(() => ({}))
      if (!res.ok) {
        setErroreGenerale(dati.error || "Impossibile caricare le cartelle")
        return
      }
      setCaselle(dati.mailboxes || [])
    } catch {
      setErroreGenerale("Impossibile caricare le cartelle")
    } finally {
      setCaricamento(false)
    }
  }, [])

  useEffect(() => {
    void carica()
  }, [carica])

  const cambia = useCallback(async (casella: Casella, cartella: Cartella, visibile: boolean) => {
    const chiave = `${casella.id}:${cartella.id}`
    setInSalvataggio(chiave)

    // Si aggiorna subito lo schermo, ma si ripristina se il salvataggio non
    // riesce: un interruttore che resta acceso su una scelta non salvata fa
    // credere che l'inbox sia filtrata quando non lo e'.
    setCaselle((prima) =>
      prima.map((c) =>
        c.id !== casella.id
          ? c
          : { ...c, folders: c.folders.map((f) => (f.id === cartella.id ? { ...f, visible: visibile } : f)) },
      ),
    )

    try {
      const res = await fetch(`/api/channels/email/${casella.id}/labels`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ labelId: cartella.id, visible: visibile, name: cartella.name }),
      })
      if (!res.ok) {
        const dati = await res.json().catch(() => ({}))
        throw new Error(dati.error || "Salvataggio non riuscito")
      }
      toast.success(
        visibile
          ? `"${cartella.name}" torna visibile nell'inbox`
          : `"${cartella.name}" non compare piu' nell'inbox`,
      )
    } catch (e) {
      setCaselle((prima) =>
        prima.map((c) =>
          c.id !== casella.id
            ? c
            : { ...c, folders: c.folders.map((f) => (f.id === cartella.id ? { ...f, visible: !visibile } : f)) },
        ),
      )
      toast.error(e instanceof Error ? e.message : "Salvataggio non riuscito")
    } finally {
      // Sempre azzerato, o la riga resterebbe bloccata in "salvataggio".
      setInSalvataggio(null)
    }
  }, [])

  if (caricamento) {
    return (
      <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        Caricamento cartelle...
      </div>
    )
  }

  if (erroreGenerale) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" aria-hidden="true" />
        <AlertDescription>{erroreGenerale}</AlertDescription>
      </Alert>
    )
  }

  if (caselle.length === 0) {
    return (
      <Alert>
        <Mail className="h-4 w-4" aria-hidden="true" />
        <AlertDescription>
          Nessuna casella email collegata. Collega una casella dalla scheda Account per gestirne le cartelle.
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <Alert>
        <Inbox className="h-4 w-4" aria-hidden="true" />
        <AlertDescription>
          Spegnendo una cartella le sue conversazioni non compaiono nell&apos;elenco dell&apos;inbox. I messaggi
          continuano ad arrivare e restano cercabili: riaccendendo la cartella ricompaiono subito.
        </AlertDescription>
      </Alert>

      {caselle.map((casella) => {
        const nascoste = casella.folders.filter((f) => !f.visible).length
        return (
          <Card key={casella.id}>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Mail className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  {casella.email_address}
                </CardTitle>
                {nascoste > 0 && (
                  <Badge variant="secondary">
                    {nascoste} {nascoste === 1 ? "cartella nascosta" : "cartelle nascoste"}
                  </Badge>
                )}
              </div>
              <CardDescription>
                {casella.errore
                  ? casella.errore
                  : "Il numero indica quante conversazioni dell'inbox arrivano da questa cartella."}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-1">
              {casella.errore && (
                <Alert variant="destructive" className="mb-2">
                  <AlertCircle className="h-4 w-4" aria-hidden="true" />
                  <AlertDescription>
                    Le cartelle di Gmail non sono leggibili per questa casella. Resta gestibile solo la voce
                    &quot;{casella.folders[0]?.name}&quot;.
                  </AlertDescription>
                </Alert>
              )}

              {casella.folders.map((cartella) => {
                const chiave = `${casella.id}:${cartella.id}`
                return (
                  <div
                    key={cartella.id}
                    className="flex items-center justify-between gap-3 rounded-md border border-transparent px-2 py-2 hover:border-border hover:bg-muted/40"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <Folder
                        className={`h-4 w-4 flex-shrink-0 ${cartella.visible ? "text-muted-foreground" : "text-muted-foreground/50"}`}
                        aria-hidden="true"
                      />
                      <div className="min-w-0">
                        <p className={`truncate text-sm ${cartella.visible ? "" : "text-muted-foreground"}`}>
                          {cartella.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {cartella.conversazioni === 0
                            ? "nessuna conversazione"
                            : `${cartella.conversazioni.toLocaleString("it-IT")} ${cartella.conversazioni === 1 ? "conversazione" : "conversazioni"}`}
                          {cartella.senzaCartella && " senza cartella registrata"}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-shrink-0 items-center gap-2">
                      {inSalvataggio === chiave && (
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" aria-hidden="true" />
                      )}
                      <Switch
                        checked={cartella.visible}
                        disabled={inSalvataggio === chiave}
                        onCheckedChange={(v) => void cambia(casella, cartella, v)}
                        aria-label={`Mostra "${cartella.name}" di ${casella.email_address} nell'inbox`}
                      />
                    </div>
                  </div>
                )
              })}

              {casella.conteggiTagliati && (
                <p className="mt-2 text-xs text-muted-foreground">
                  I conteggi sono parziali: sono state esaminate le prime 1.000 conversazioni con cartella
                  registrata.
                </p>
              )}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
