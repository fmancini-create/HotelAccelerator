"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { AlertTriangle, BarChart3, Mail, MessageSquare, Save } from "lucide-react"

import { AdminHeader } from "@/components/admin/admin-header"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
// Sonner e NON `@/hooks/use-toast`: nell'area admin il contenitore montato e'
// quello di Sonner, quindi gli avvisi mandati con l'altro sistema non
// comparirebbero a schermo.
import { toast } from "sonner"

type Sorgente = {
  kind: "email_channel" | "messaging_channel"
  id: string
  label: string
  reference: string
  channelType: string
  included: boolean
  decided: boolean
  conversazioni: number | null
  conteggioPerTipo: boolean
}

type Risposta = {
  sources: Sorgente[]
  puoModificare: boolean
  sceltaLeggibile: boolean
}

const numero = (n: number) => n.toLocaleString("it-IT")

export function AnalyticsSourcesClient() {
  const [sorgenti, setSorgenti] = useState<Sorgente[] | null>(null)
  const [puoModificare, setPuoModificare] = useState(false)
  const [sceltaLeggibile, setSceltaLeggibile] = useState(true)
  const [caricamento, setCaricamento] = useState(true)
  const [salvataggio, setSalvataggio] = useState(false)
  // Copia di partenza per sapere se c'e' qualcosa da salvare: senza questo il
  // pulsante sarebbe sempre attivo e inviterebbe a salvare il nulla.
  const [iniziale, setIniziale] = useState<Record<string, boolean>>({})

  const carica = useCallback(async () => {
    try {
      const r = await fetch("/api/platform/analytics-sources")
      if (!r.ok) throw new Error("non disponibile")
      const j = (await r.json()) as Risposta
      setSorgenti(j.sources)
      setPuoModificare(j.puoModificare)
      setSceltaLeggibile(j.sceltaLeggibile !== false)
      setIniziale(Object.fromEntries(j.sources.map((s) => [`${s.kind}:${s.id}`, s.included])))
    } catch {
      setSorgenti(null)
    } finally {
      setCaricamento(false)
    }
  }, [])

  useEffect(() => {
    void carica()
  }, [carica])

  const cambiate = useMemo(() => {
    if (!sorgenti) return 0
    return sorgenti.filter((s) => iniziale[`${s.kind}:${s.id}`] !== s.included).length
  }, [sorgenti, iniziale])

  const incluse = sorgenti?.filter((s) => s.included).length ?? 0
  const nessunaInclusa = Boolean(sorgenti && sorgenti.length > 0 && incluse === 0)

  const cambia = (s: Sorgente, valore: boolean) => {
    setSorgenti((prec) =>
      (prec ?? []).map((x) => (x.kind === s.kind && x.id === s.id ? { ...x, included: valore } : x)),
    )
  }

  const salva = async () => {
    if (!sorgenti) return
    setSalvataggio(true)
    try {
      const r = await fetch("/api/platform/analytics-sources", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sources: sorgenti.map((s) => ({ kind: s.kind, id: s.id, included: s.included })),
        }),
      })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) {
        // Si mostra il motivo del server, non un "errore" generico: qui il motivo
        // piu' probabile e' che chi guarda non amministra la struttura.
        toast.error(j?.error ?? "Salvataggio non riuscito")
        return
      }
      setSorgenti(j.sources)
      setIniziale(Object.fromEntries((j.sources as Sorgente[]).map((s) => [`${s.kind}:${s.id}`, s.included])))
      toast.success("Sorgenti aggiornate: i conteggi ne tengono conto da subito")
    } catch {
      toast.error("Salvataggio non riuscito")
    } finally {
      setSalvataggio(false)
    }
  }

  const gruppi = [
    {
      titolo: "Caselle email",
      icona: Mail,
      voci: sorgenti?.filter((s) => s.kind === "email_channel") ?? [],
      nota: "Ogni casella si sceglie singolarmente.",
    },
    {
      titolo: "Messaggistica",
      icona: MessageSquare,
      voci: sorgenti?.filter((s) => s.kind === "messaging_channel") ?? [],
      // Non e' un dettaglio tecnico da nascondere: spiega perche' qui la scelta
      // e' meno fine che per le caselle.
      nota: "Le conversazioni di chat, WhatsApp e Telegram non registrano il singolo canale, quindi la scelta vale per tipo.",
    },
  ]

  return (
    <div className="min-h-full bg-background">
      {/* Il titolo lo mette l'intestazione: un <h1> anche qui sarebbe un doppione,
          errore che ho gia' commesso sulla pagina degli invii email. */}
      <AdminHeader title="Sorgenti statistiche" />

      <main className="mx-auto max-w-4xl px-4 py-8">
        <div className="mb-6 flex items-start gap-3">
          <BarChart3 className="mt-1 h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm leading-relaxed text-muted-foreground">
            Scegli quali caselle e canali contano nei numeri del cruscotto. Le sorgenti escluse restano attive e
            continuano a ricevere messaggi: cambiano solo le statistiche.
          </p>
        </div>

        {!sceltaLeggibile ? (
          <Alert variant="destructive" className="mb-6">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            <AlertDescription>
              Non e&apos;stato possibile leggere la scelta salvata: i conteggi usano tutte le sorgenti e le spunte qui
              sotto potrebbero non riflettere le impostazioni reali.
            </AlertDescription>
          </Alert>
        ) : null}

        {nessunaInclusa ? (
          <Alert className="mb-6">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            <AlertDescription>
              Con questa scelta nessuna sorgente conta: i conteggi del cruscotto mostreranno zero.
            </AlertDescription>
          </Alert>
        ) : null}

        {!puoModificare && !caricamento ? (
          <Alert className="mb-6">
            <AlertDescription>
              Puoi vedere la scelta ma non modificarla: le sorgenti statistiche le imposta chi amministra la struttura.
            </AlertDescription>
          </Alert>
        ) : null}

        {caricamento ? (
          <div className="space-y-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : sorgenti === null ? (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            <AlertDescription>Elenco non disponibile. Ricarica la pagina per riprovare.</AlertDescription>
          </Alert>
        ) : (
          <div className="flex flex-col gap-6">
            {gruppi.map((g) => (
              <Card key={g.titolo}>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <g.icona className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    {g.titolo}
                  </CardTitle>
                  <p className="text-xs leading-relaxed text-muted-foreground">{g.nota}</p>
                </CardHeader>
                <CardContent className="pt-0">
                  {g.voci.length === 0 ? (
                    <p className="py-2 text-sm text-muted-foreground">Nessuna sorgente di questo tipo.</p>
                  ) : (
                    <ul className="divide-y divide-border">
                      {g.voci.map((s) => (
                        <li key={`${s.kind}:${s.id}`} className="flex items-center justify-between gap-4 py-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="truncate text-sm font-medium text-foreground">{s.label}</span>
                              {/* "mai deciso" solo quando distingue qualcosa: a schermo
                                  compariva su tutte e 8 le righe, cioe' era rumore. Serve
                                  quando ALCUNE sono state decise e altre no. */}
                              {!s.decided && qualcunaDecisa ? (
                                <Badge variant="outline" className="text-xs font-normal">
                                  mai deciso
                                </Badge>
                              ) : null}
                            </div>
                            <p className="mt-0.5 truncate text-xs text-muted-foreground">
                              {s.reference}
                              {s.conversazioni === null
                                ? " · volume non disponibile"
                                : ` · ${numero(s.conversazioni)} conversazioni${
                                    s.conteggioPerTipo ? " (totale del tipo)" : ""
                                  }`}
                            </p>
                          </div>
                          <Switch
                            checked={s.included}
                            disabled={!puoModificare || salvataggio}
                            onCheckedChange={(v) => cambia(s, v)}
                            aria-label={`Conta ${s.label} nelle statistiche`}
                          />
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            ))}

            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                {incluse} sorgenti su {sorgenti.length} contano nelle statistiche
                {cambiate > 0 ? ` · ${cambiate} da salvare` : ""}
              </p>
              <Button onClick={salva} disabled={!puoModificare || salvataggio || cambiate === 0}>
                <Save className="mr-2 h-4 w-4" aria-hidden="true" />
                {salvataggio ? "Salvataggio..." : "Salva scelta"}
              </Button>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
