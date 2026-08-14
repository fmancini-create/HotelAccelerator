"use client"

import { useCallback, useEffect, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  AlertCircle,
  BookOpen,
  Bot,
  Globe,
  Loader2,
  MessageCircle,
  MessagesSquare,
  Plus,
  Settings2,
  Trash2,
} from "lucide-react"
import { AdminHeader } from "@/components/admin/admin-header"
import { ChatWidgetEditor } from "@/components/admin/chat-widget-editor"
import { normalizzaAspetto } from "@/lib/chat-widgets/appearance"
import { PREZZO_WIDGET_EXTRA_CENTESIMI } from "@/lib/chat-widgets/pricing"

interface WidgetInElenco {
  id: string
  name: string
  siteUrl: string | null
  publicKey: string
  isActive: boolean
  appearance: unknown
  conversations: number
  primaryBase: { id: string; name: string; mode: "disabled" | "on_request" | "autopilot" } | null
  additionalBases: { id: string; name: string }[]
}

interface Quota {
  inclusi: number
  extra: number
  limite: number
  usati: number
  puoCrearne: boolean
}

const ETICHETTE_MODALITA: Record<"disabled" | "on_request" | "autopilot", string> = {
  disabled: "IA spenta",
  on_request: "Su richiesta",
  autopilot: "Risponde da sola",
}

export default function ChatWidgetsPage() {
  const [widgets, setWidgets] = useState<WidgetInElenco[]>([])
  const [quota, setQuota] = useState<Quota | null>(null)
  const [caricamento, setCaricamento] = useState(true)
  const [errore, setErrore] = useState<string | null>(null)

  // Quale widget si sta configurando. Null = si vede l'elenco.
  const [inModifica, setInModifica] = useState<string | null>(null)

  const [creazioneAperta, setCreazioneAperta] = useState(false)
  const [nuovoNome, setNuovoNome] = useState("")
  const [nuovoSito, setNuovoSito] = useState("")
  const [creazioneInCorso, setCreazioneInCorso] = useState(false)
  const [erroreCreazione, setErroreCreazione] = useState<string | null>(null)
  const [quotaEsaurita, setQuotaEsaurita] = useState(false)
  const [acquistoInCorso, setAcquistoInCorso] = useState(false)

  /**
   * Porta l'admin al pagamento di Stripe per un widget in più.
   *
   * Non crea il widget: il pagamento alza soltanto la quota, poi il widget lo
   * crea lui dando nome, basi e aspetto. Creare una chat anonima al posto suo
   * significherebbe metterne una in linea senza che nessuno l'abbia configurata.
   */
  const acquistaWidget = async () => {
    setAcquistoInCorso(true)
    setErrore(null)
    try {
      const r = await fetch("/api/admin/chat-widgets/checkout", { method: "POST" })
      const dati = await r.json()
      if (!r.ok || !dati.url) throw new Error(dati.error || "Pagamento non avviato")
      window.location.href = dati.url
    } catch (e) {
      // Lo stato torna attivo solo in caso di errore: se il rimando funziona la
      // pagina cambia, e riabilitare il pulsante inviterebbe a pagare due volte.
      setErrore(e instanceof Error ? e.message : "Pagamento non avviato")
      setAcquistoInCorso(false)
    }
  }

  const [daEliminare, setDaEliminare] = useState<WidgetInElenco | null>(null)
  const [eliminazioneInCorso, setEliminazioneInCorso] = useState(false)

  const carica = useCallback(async () => {
    try {
      const risposta = await fetch("/api/admin/chat-widgets", { cache: "no-store" })
      const dati = await risposta.json()
      if (!risposta.ok) throw new Error(dati.error ?? "Impossibile caricare i widget")
      setWidgets(dati.widgets ?? [])
      setQuota(dati.quota ?? null)
      setErrore(null)
    } catch (e) {
      setErrore(e instanceof Error ? e.message : "Errore di caricamento")
    } finally {
      setCaricamento(false)
    }
  }, [])

  useEffect(() => {
    void carica()
  }, [carica])

  const creaWidget = async () => {
    setCreazioneInCorso(true)
    setErroreCreazione(null)
    setQuotaEsaurita(false)
    try {
      const risposta = await fetch("/api/admin/chat-widgets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: nuovoNome.trim(), siteUrl: nuovoSito.trim() || null }),
      })
      const dati = await risposta.json()
      if (!risposta.ok) {
        // 402 = limite raggiunto. È una condizione commerciale, non un guasto,
        // quindi va mostrata con un tono diverso da un errore tecnico.
        if (risposta.status === 402) setQuotaEsaurita(true)
        throw new Error(dati.error ?? "Creazione non riuscita")
      }
      setCreazioneAperta(false)
      setNuovoNome("")
      setNuovoSito("")
      await carica()
      // Si apre subito la configurazione: un widget appena creato non risponde
      // finché non gli si collega una base di conoscenza.
      setInModifica(dati.widget.id)
    } catch (e) {
      setErroreCreazione(e instanceof Error ? e.message : "Errore")
    } finally {
      setCreazioneInCorso(false)
    }
  }

  const cambiaStato = async (widget: WidgetInElenco, attivo: boolean) => {
    // Cambio immediato a schermo, ma se il server rifiuta si torna indietro:
    // lasciare l'interruttore "acceso" su un widget spento mentirebbe.
    setWidgets((prev) => prev.map((w) => (w.id === widget.id ? { ...w, isActive: attivo } : w)))
    const risposta = await fetch(`/api/admin/chat-widgets/${widget.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: attivo }),
    })
    if (!risposta.ok) {
      const dati = await risposta.json().catch(() => ({}))
      setWidgets((prev) => prev.map((w) => (w.id === widget.id ? { ...w, isActive: !attivo } : w)))
      setErrore(dati.error ?? "Non è stato possibile cambiare lo stato del widget")
      return
    }
    await carica()
  }

  const elimina = async () => {
    if (!daEliminare) return
    setEliminazioneInCorso(true)
    try {
      const risposta = await fetch(`/api/admin/chat-widgets/${daEliminare.id}`, { method: "DELETE" })
      if (!risposta.ok) {
        const dati = await risposta.json().catch(() => ({}))
        throw new Error(dati.error ?? "Eliminazione non riuscita")
      }
      setDaEliminare(null)
      await carica()
    } catch (e) {
      setErrore(e instanceof Error ? e.message : "Errore")
    } finally {
      setEliminazioneInCorso(false)
    }
  }

  if (inModifica) {
    return (
      <div className="min-h-full bg-muted">
        <AdminHeader title="Configura widget" subtitle="Grafica, testi e basi di conoscenza di questo widget" />
        <div className="max-w-6xl mx-auto p-6">
          <ChatWidgetEditor
            widgetId={inModifica}
            onIndietro={() => setInModifica(null)}
            onAggiornato={() => void carica()}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-full bg-muted">
      <AdminHeader
        title="Widget chat"
        subtitle="Un widget per ogni sito: hotel, ristorante, spa. Ognuno con la sua grafica e la sua conoscenza."
        actions={
          <div className="flex items-center gap-3">
            {quota && (
              <span className="text-sm text-muted-foreground tabular-nums">
                {quota.usati} di {quota.limite} attivi
              </span>
            )}
            <Button
              onClick={() => {
                setErroreCreazione(null)
                setQuotaEsaurita(false)
                setCreazioneAperta(true)
              }}
              className="gap-2"
            >
              <Plus className="h-4 w-4" />
              Nuovo widget
            </Button>
          </div>
        }
      />

      <div className="max-w-5xl mx-auto p-6">
        {errore && (
          <div className="mb-6 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{errore}</span>
          </div>
        )}

        {/* Colori dai token del tema, non fissi: `ha-warning-soft` esiste già nel
            progetto e resta leggibile anche in tema scuro. */}
        {quota && !quota.puoCrearne && widgets.length > 0 && (
          <div className="mb-6 rounded-lg border border-ha-warning-soft bg-ha-warning-soft p-4 text-sm text-ha-warning-soft-foreground">
            <p className="font-medium">Hai usato tutti i widget disponibili ({quota.limite} attivi).</p>
            <p className="mt-1 text-pretty">
              Il piano ne include {quota.inclusi}
              {quota.extra > 0 && `, più ${quota.extra} acquistati`}. Puoi acquistarne un altro, oppure spegnere o
              eliminare uno di quelli esistenti: i widget spenti non occupano un posto.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3 gap-2 bg-transparent"
              onClick={acquistaWidget}
              disabled={acquistoInCorso}
            >
              {acquistoInCorso ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {`Acquista un widget (${(PREZZO_WIDGET_EXTRA_CENTESIMI / 100).toFixed(0)} € al mese)`}
            </Button>
          </div>
        )}

        {caricamento ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            Caricamento dei widget…
          </div>
        ) : widgets.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-4 py-14 text-center">
              <div className="rounded-full bg-primary/10 p-4">
                <MessagesSquare className="h-7 w-7 text-primary" />
              </div>
              <div>
                <h2 className="font-medium">Nessun widget configurato</h2>
                <p className="text-sm text-muted-foreground mt-1 max-w-md text-pretty">
                  Crea il primo widget, scegli la base di conoscenza che deve usare e incolla lo snippet nel tuo sito.
                </p>
              </div>
              <Button onClick={() => setCreazioneAperta(true)} className="gap-2">
                <Plus className="h-4 w-4" />
                Crea il primo widget
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {widgets.map((widget) => {
              const aspetto = normalizzaAspetto(widget.appearance)
              return (
                <Card key={widget.id} className={widget.isActive ? undefined : "opacity-75"}>
                  <CardContent className="flex flex-wrap items-start gap-4 p-5">
                    {/* Pastiglia col colore scelto: nell'elenco si riconosce a
                        vista quale widget è quale, senza aprirli. */}
                    <div
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg"
                      style={{ backgroundColor: aspetto.primaryColor, color: aspetto.textColor }}
                      aria-hidden="true"
                    >
                      <MessageCircle className="h-5 w-5" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="font-medium truncate">{widget.name}</h2>
                        {widget.isActive ? (
                          <Badge variant="secondary" className="text-xs">
                            Attivo
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs bg-transparent">
                            Spento
                          </Badge>
                        )}
                      </div>

                      <div className="mt-2 flex flex-col gap-1.5 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1.5 min-w-0">
                          <Globe className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">{widget.siteUrl || "Nessun sito indicato"}</span>
                        </span>

                        {/* La conoscenza collegata è l'informazione che conta:
                            senza base primaria il widget non sa rispondere. */}
                        <span className="flex items-start gap-1.5">
                          <BookOpen className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                          {widget.primaryBase ? (
                            <span className="text-pretty">
                              <span className="text-foreground">{widget.primaryBase.name}</span>
                              {" · "}
                              {ETICHETTE_MODALITA[widget.primaryBase.mode]}
                              {widget.additionalBases.length > 0 && (
                                <> {`· anche ${widget.additionalBases.map((b) => b.name).join(", ")}`}</>
                              )}
                            </span>
                          ) : (
                            <span className="text-amber-700">
                              Nessuna base di conoscenza collegata: il widget non risponde
                            </span>
                          )}
                        </span>

                        <span className="flex items-center gap-1.5">
                          <Bot className="h-3.5 w-3.5 shrink-0" />
                          {widget.conversations === 1 ? "1 conversazione" : `${widget.conversations} conversazioni`}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 ml-auto">
                      <Switch
                        checked={widget.isActive}
                        onCheckedChange={(v) => void cambiaStato(widget, v)}
                        aria-label={widget.isActive ? `Spegni il widget ${widget.name}` : `Accendi il widget ${widget.name}`}
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5 bg-transparent"
                        onClick={() => setInModifica(widget.id)}
                      >
                        <Settings2 className="h-4 w-4" />
                        Configura
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => setDaEliminare(widget)}
                        aria-label={`Elimina il widget ${widget.name}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </div>

      <Dialog open={creazioneAperta} onOpenChange={setCreazioneAperta}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuovo widget chat</DialogTitle>
            <DialogDescription>
              Dagli un nome che ti ricordi dove vive. Grafica e base di conoscenza si scelgono subito dopo.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-2">
              <Label htmlFor="nuovo-nome">Nome</Label>
              <Input
                id="nuovo-nome"
                value={nuovoNome}
                onChange={(e) => setNuovoNome(e.target.value)}
                placeholder="Sito dell'hotel"
                maxLength={80}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="nuovo-sito">Sito dove verrà installato (facoltativo)</Label>
              <Input
                id="nuovo-sito"
                value={nuovoSito}
                onChange={(e) => setNuovoSito(e.target.value)}
                placeholder="https://www.miohotel.it"
              />
            </div>
            {erroreCreazione && (
              <div
                className={`flex flex-col gap-2 rounded-md border p-3 text-sm ${
                  quotaEsaurita
                    ? "border-ha-warning-soft bg-ha-warning-soft text-ha-warning-soft-foreground"
                    : "border-destructive/30 bg-destructive/5 text-destructive"
                }`}
              >
                <span className="flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span className="text-pretty">{erroreCreazione}</span>
                </span>
                {/* Senza questo pulsante il messaggio sarebbe un vicolo cieco:
                    dice che il limite è raggiunto e non offre alcuna via d'uscita. */}
                {quotaEsaurita && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="self-start gap-2 bg-transparent"
                    onClick={acquistaWidget}
                    disabled={acquistoInCorso}
                  >
                    {acquistoInCorso ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                    {`Acquistane uno (${(PREZZO_WIDGET_EXTRA_CENTESIMI / 100).toFixed(0)} € al mese)`}
                  </Button>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" className="bg-transparent" onClick={() => setCreazioneAperta(false)}>
              Annulla
            </Button>
            <Button onClick={() => void creaWidget()} disabled={creazioneInCorso || !nuovoNome.trim()}>
              {creazioneInCorso && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Crea widget
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={daEliminare !== null} onOpenChange={(aperto) => !aperto && setDaEliminare(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminare il widget {daEliminare?.name}?</AlertDialogTitle>
            <AlertDialogDescription className="text-pretty">
              Lo snippet già installato sul sito smetterà di funzionare subito.
              {daEliminare && daEliminare.conversations > 0 && (
                <> {`Le ${daEliminare.conversations} conversazioni ricevute restano in inbox: non vengono cancellate.`}</>
              )}{" "}
              Se vuoi solo sospenderlo, spegnilo: così non occupa un posto e puoi riaccenderlo quando vuoi.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-transparent">Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                void elimina()
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {eliminazioneInCorso && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Elimina definitivamente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
