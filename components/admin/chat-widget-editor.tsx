"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Code,
  Copy,
  Info,
  KeyRound,
  Loader2,
  Palette,
  RefreshCw,
  Trash2,
  Type,
  Upload,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { Checkbox } from "@/components/ui/checkbox"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { ChatWidgetPreview } from "@/components/admin/chat-widget-preview"
import {
  DEFAULT_APPEARANCE,
  type WidgetAppearance,
  normalizzaAspetto,
  valutaContrasto,
} from "@/lib/chat-widgets/appearance"

interface BaseConoscenza {
  id: string
  name: string
  mode: "disabled" | "on_request" | "autopilot"
  source_count?: number
}

export interface WidgetCaricato {
  id: string
  name: string
  siteUrl: string | null
  publicKey: string
  isActive: boolean
  appearance: WidgetAppearance
}

const ETICHETTE_MODALITA: Record<BaseConoscenza["mode"], string> = {
  disabled: "IA spenta",
  on_request: "Solo su richiesta dell'operatore",
  autopilot: "Risponde da sola",
}

export function ChatWidgetEditor({
  widgetId,
  onIndietro,
  onAggiornato,
}: {
  widgetId: string
  onIndietro: () => void
  onAggiornato: () => void
}) {
  const [caricamento, setCaricamento] = useState(true)
  const [salvataggio, setSalvataggio] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)
  const [salvato, setSalvato] = useState(false)
  const [copiato, setCopiato] = useState(false)

  const [nome, setNome] = useState("")
  const [sito, setSito] = useState("")
  const [attivo, setAttivo] = useState(true)
  const [chiave, setChiave] = useState("")
  const [aspetto, setAspetto] = useState<WidgetAppearance>(DEFAULT_APPEARANCE)

  const [basi, setBasi] = useState<BaseConoscenza[]>([])
  const [basePrimaria, setBasePrimaria] = useState<string>("")
  const [basiAggiuntive, setBasiAggiuntive] = useState<string[]>([])

  const inputLogo = useRef<HTMLInputElement>(null)
  const [caricoLogo, setCaricoLogo] = useState(false)

  useEffect(() => {
    let annullato = false
    async function carica() {
      setCaricamento(true)
      setErrore(null)
      try {
        const [rispWidget, rispBasi] = await Promise.all([
          fetch(`/api/admin/chat-widgets/${widgetId}`),
          fetch("/api/admin/ai/knowledge-bases"),
        ])
        const datiWidget = await rispWidget.json()
        if (!rispWidget.ok) throw new Error(datiWidget.error ?? "Widget non caricato")
        const datiBasi = await rispBasi.json().catch(() => ({ bases: [] }))
        if (annullato) return

        setNome(datiWidget.widget.name)
        setSito(datiWidget.widget.siteUrl ?? "")
        setAttivo(datiWidget.widget.isActive)
        setChiave(datiWidget.widget.publicKey)
        setAspetto(normalizzaAspetto(datiWidget.widget.appearance))
        setBasePrimaria(datiWidget.primaryBaseId ?? "")
        setBasiAggiuntive(datiWidget.additionalBaseIds ?? [])
        setBasi(datiBasi.bases ?? [])
      } catch (e) {
        if (!annullato) setErrore(e instanceof Error ? e.message : "Errore")
      } finally {
        if (!annullato) setCaricamento(false)
      }
    }
    carica()
    return () => {
      annullato = true
    }
  }, [widgetId])

  const contrasto = useMemo(() => valutaContrasto(aspetto.primaryColor, aspetto.textColor), [aspetto.primaryColor, aspetto.textColor])

  const primaria = basi.find((b) => b.id === basePrimaria) ?? null

  function cambia<K extends keyof WidgetAppearance>(campo: K, valore: WidgetAppearance[K]) {
    setAspetto((a) => ({ ...a, [campo]: valore }))
    setSalvato(false)
  }

  async function caricaLogo(file: File) {
    setCaricoLogo(true)
    setErrore(null)
    try {
      const fd = new FormData()
      fd.append("file", file)
      const risp = await fetch("/api/admin/chat-widgets/logo", { method: "POST", body: fd })
      const dati = await risp.json()
      if (!risp.ok) throw new Error(dati.error ?? "Caricamento fallito")
      cambia("logoUrl", dati.logoUrl)
    } catch (e) {
      setErrore(e instanceof Error ? e.message : "Errore")
    } finally {
      setCaricoLogo(false)
    }
  }

  async function salva() {
    setSalvataggio(true)
    setErrore(null)
    setSalvato(false)
    try {
      const risp = await fetch(`/api/admin/chat-widgets/${widgetId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: nome,
          siteUrl: sito || null,
          isActive: attivo,
          appearance: aspetto,
          primaryBaseId: basePrimaria || null,
          additionalBaseIds: basiAggiuntive,
        }),
      })
      const dati = await risp.json()
      if (!risp.ok) throw new Error(dati.error ?? "Salvataggio fallito")
      setSalvato(true)
      onAggiornato()
    } catch (e) {
      setErrore(e instanceof Error ? e.message : "Errore")
    } finally {
      setSalvataggio(false)
    }
  }

  async function rigeneraChiave() {
    if (!window.confirm("Rigenerando la chiave, lo snippet installato adesso smetterà di funzionare. Continuare?")) return
    setErrore(null)
    try {
      const risp = await fetch(`/api/admin/chat-widgets/${widgetId}/regenerate-key`, { method: "POST" })
      const dati = await risp.json()
      if (!risp.ok) throw new Error(dati.error ?? "Rigenerazione fallita")
      setChiave(dati.widget.publicKey)
    } catch (e) {
      setErrore(e instanceof Error ? e.message : "Errore")
    }
  }

  const snippet = `<script src="${typeof window !== "undefined" ? window.location.origin : ""}/api/widget/loader.js" data-widget-key="${chiave}" async></script>`

  async function copiaSnippet() {
    await navigator.clipboard.writeText(snippet)
    setCopiato(true)
    setTimeout(() => setCopiato(false), 2000)
  }

  if (caricamento) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onIndietro} className="gap-1.5">
            <ArrowLeft className="h-4 w-4" />
            Tutti i widget
          </Button>
          <div className="h-5 w-px bg-border" />
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground">{nome}</span>
            <Badge variant={attivo ? "default" : "secondary"}>{attivo ? "Attivo" : "Spento"}</Badge>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {salvato && (
            <span className="flex items-center gap-1.5 text-sm text-emerald-700">
              <Check className="h-4 w-4" />
              Salvato
            </span>
          )}
          <Button onClick={salva} disabled={salvataggio || !contrasto.leggibile}>
            {salvataggio ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Salva modifiche
          </Button>
        </div>
      </div>

      {errore && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{errore}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <Tabs defaultValue="aspetto">
          <TabsList>
            <TabsTrigger value="aspetto" className="gap-1.5">
              <Palette className="h-4 w-4" />
              Aspetto
            </TabsTrigger>
            <TabsTrigger value="testi" className="gap-1.5">
              <Type className="h-4 w-4" />
              Testi
            </TabsTrigger>
            <TabsTrigger value="conoscenza" className="gap-1.5">
              <Info className="h-4 w-4" />
              Conoscenza
            </TabsTrigger>
            <TabsTrigger value="installa" className="gap-1.5">
              <Code className="h-4 w-4" />
              Installa
            </TabsTrigger>
          </TabsList>

          {/* ---------------------------------------------------------------- */}
          <TabsContent value="aspetto" className="mt-4 flex flex-col gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Identità</CardTitle>
                <CardDescription>Nome interno e sito su cui è installato questo widget.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="nome-widget">Nome del widget</Label>
                    <Input
                      id="nome-widget"
                      value={nome}
                      onChange={(e) => {
                        setNome(e.target.value)
                        setSalvato(false)
                      }}
                      placeholder="Sito hotel"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="sito-widget">Sito</Label>
                    <Input
                      id="sito-widget"
                      value={sito}
                      onChange={(e) => {
                        setSito(e.target.value)
                        setSalvato(false)
                      }}
                      placeholder="https://www.hotelesempio.it"
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between rounded-lg border border-border p-3">
                  <div>
                    <p className="text-sm font-medium text-foreground">Widget attivo</p>
                    <p className="text-sm text-muted-foreground">Se spento, il widget non compare sul sito.</p>
                  </div>
                  <Switch
                    checked={attivo}
                    onCheckedChange={(v) => {
                      setAttivo(v)
                      setSalvato(false)
                    }}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Colori e logo</CardTitle>
                <CardDescription>Il colore veste la testata, il pulsante e i messaggi dell&apos;ospite.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="colore-principale">Colore principale</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        id="colore-principale"
                        type="color"
                        value={aspetto.primaryColor}
                        onChange={(e) => cambia("primaryColor", e.target.value)}
                        className="h-10 w-14 cursor-pointer p-1"
                      />
                      <Input
                        value={aspetto.primaryColor}
                        onChange={(e) => cambia("primaryColor", e.target.value)}
                        className="font-mono"
                      />
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="colore-testo">Colore del testo</Label>
                    <div className="flex items-center gap-2">
                      <Input
                        id="colore-testo"
                        type="color"
                        value={aspetto.textColor}
                        onChange={(e) => cambia("textColor", e.target.value)}
                        className="h-10 w-14 cursor-pointer p-1"
                      />
                      <Input
                        value={aspetto.textColor}
                        onChange={(e) => cambia("textColor", e.target.value)}
                        className="font-mono"
                      />
                    </div>
                  </div>
                </div>

                {/* Il contrasto si dice QUI, mentre si scelgono i colori: chi
                    configura guarda il pannello, non il sito del cliente. */}
                {contrasto.leggibile ? (
                  <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Check className="h-4 w-4 text-emerald-600" />
                    Contrasto {contrasto.rapporto}:1 — il testo è leggibile.
                  </p>
                ) : (
                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription className="flex flex-col items-start gap-2">
                      <span>
                        {`Contrasto ${contrasto.rapporto}:1, troppo basso (serve almeno 4.5:1). Con questi colori la testata risulterebbe illeggibile sul sito.`}
                      </span>
                      <Button size="sm" variant="outline" className="bg-transparent" onClick={() => cambia("textColor", contrasto.consigliato)}>
                        {`Usa il ${contrasto.consigliato === "#ffffff" ? "bianco" : "nero"}`}
                      </Button>
                    </AlertDescription>
                  </Alert>
                )}

                <div className="flex flex-col gap-2">
                  <Label>Logo nella testata</Label>
                  <div className="flex flex-wrap items-center gap-3">
                    {aspetto.logoUrl ? (
                      <img
                        src={aspetto.logoUrl || "/placeholder.svg"}
                        alt="Logo del widget"
                        className="h-10 w-10 rounded border border-border object-contain"
                      />
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded border border-dashed border-border text-muted-foreground">
                        <Upload className="h-4 w-4" />
                      </div>
                    )}
                    <input
                      ref={inputLogo}
                      type="file"
                      accept="image/png,image/jpeg,image/svg+xml,image/webp"
                      className="hidden"
                      onChange={(e) => {
                        const f = e.target.files?.[0]
                        if (f) caricaLogo(f)
                      }}
                    />
                    <Button variant="outline" size="sm" className="bg-transparent" onClick={() => inputLogo.current?.click()} disabled={caricoLogo}>
                      {caricoLogo ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      {aspetto.logoUrl ? "Cambia logo" : "Carica logo"}
                    </Button>
                    {aspetto.logoUrl && (
                      <Button variant="ghost" size="sm" onClick={() => cambia("logoUrl", null)}>
                        Rimuovi
                      </Button>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">PNG, JPEG, SVG o WebP, fino a 2 MB.</p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Posizione e forma</CardTitle>
                <CardDescription>La distanza dai bordi serve quando il widget copre altri elementi del sito.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-2">
                    <Label>Posizione</Label>
                    <Select value={aspetto.position} onValueChange={(v) => cambia("position", v as WidgetAppearance["position"])}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="bottom-right">Basso a destra</SelectItem>
                        <SelectItem value="bottom-left">Basso a sinistra</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label>Forma</Label>
                    <Select value={aspetto.shape} onValueChange={(v) => cambia("shape", v as WidgetAppearance["shape"])}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="rounded">Angoli arrotondati</SelectItem>
                        <SelectItem value="square">Angoli vivi</SelectItem>
                        <SelectItem value="pill">Pulsante tondo</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <Label>Icona del pulsante</Label>
                  <Select value={aspetto.icon} onValueChange={(v) => cambia("icon", v as WidgetAppearance["icon"])}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="chat">Fumetto</SelectItem>
                      <SelectItem value="message">Messaggio</SelectItem>
                      <SelectItem value="help">Punto di domanda</SelectItem>
                      <SelectItem value="sparkles">Assistente</SelectItem>
                      <SelectItem value="phone">Telefono</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <CursoreValore etichetta="Distanza dal bordo laterale" valore={aspetto.offsetX} min={0} max={200} onChange={(v) => cambia("offsetX", v)} />
                <CursoreValore etichetta="Distanza dal basso" valore={aspetto.offsetY} min={0} max={200} onChange={(v) => cambia("offsetY", v)} />
                <CursoreValore etichetta="Dimensione del pulsante" valore={aspetto.buttonSize} min={40} max={96} onChange={(v) => cambia("buttonSize", v)} />
                <CursoreValore etichetta="Larghezza della finestra" valore={aspetto.windowWidth} min={280} max={560} onChange={(v) => cambia("windowWidth", v)} />
                <CursoreValore etichetta="Altezza della finestra" valore={aspetto.windowHeight} min={320} max={800} onChange={(v) => cambia("windowHeight", v)} />
              </CardContent>
            </Card>
          </TabsContent>

          {/* ---------------------------------------------------------------- */}
          <TabsContent value="testi" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Testi del widget</CardTitle>
                <CardDescription>
                  Ogni widget parla con la sua voce: l&apos;hotel e il ristorante non salutano allo stesso modo.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="titolo">Titolo della testata</Label>
                  <Input id="titolo" value={aspetto.title} onChange={(e) => cambia("title", e.target.value)} maxLength={60} />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="sottotitolo">Sottotitolo</Label>
                  <Input id="sottotitolo" value={aspetto.subtitle} onChange={(e) => cambia("subtitle", e.target.value)} maxLength={80} />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="benvenuto">Messaggio di benvenuto</Label>
                  <Textarea id="benvenuto" value={aspetto.welcomeMessage} onChange={(e) => cambia("welcomeMessage", e.target.value)} rows={3} maxLength={300} />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="segnaposto">Segnaposto del campo di scrittura</Label>
                  <Input id="segnaposto" value={aspetto.placeholder} onChange={(e) => cambia("placeholder", e.target.value)} maxLength={60} />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="fuori-orario">Messaggio a widget spento</Label>
                  <Textarea id="fuori-orario" value={aspetto.offlineMessage} onChange={(e) => cambia("offlineMessage", e.target.value)} rows={2} maxLength={300} />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ---------------------------------------------------------------- */}
          <TabsContent value="conoscenza" className="mt-4 flex flex-col gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Base di conoscenza principale</CardTitle>
                <CardDescription>
                  È la base che risponde e che decide il comportamento dell&apos;assistente per questo widget.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                {basi.length === 0 ? (
                  <Alert>
                    <Info className="h-4 w-4" />
                    <AlertDescription>
                      Non hai ancora nessuna base di conoscenza. Creane una nella sezione Conoscenza, poi torna qui per
                      collegarla.
                    </AlertDescription>
                  </Alert>
                ) : (
                  <>
                    <Select
                      value={basePrimaria || "nessuna"}
                      onValueChange={(v) => {
                        const scelta = v === "nessuna" ? "" : v
                        setBasePrimaria(scelta)
                        // Una base non può essere primaria e aggiuntiva insieme.
                        setBasiAggiuntive((prec) => prec.filter((b) => b !== scelta))
                        setSalvato(false)
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Scegli la base principale" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="nessuna">Nessuna — il widget non risponde da solo</SelectItem>
                        {basi.map((b) => (
                          <SelectItem key={b.id} value={b.id}>
                            {b.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {primaria && (
                      <Alert>
                        <Info className="h-4 w-4" />
                        <AlertDescription>
                          <span className="font-medium">{`Comportamento: ${ETICHETTE_MODALITA[primaria.mode]}.`}</span>{" "}
                          {`Questa impostazione appartiene alla base "${primaria.name}", non al widget: se colleghi la stessa base
                          principale a due widget, i due si comportano allo stesso modo. Si cambia nella sezione Conoscenza.`}
                        </AlertDescription>
                      </Alert>
                    )}
                  </>
                )}
              </CardContent>
            </Card>

            {basi.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Conoscenze aggiuntive</CardTitle>
                  <CardDescription>
                    Consultate quando la risposta non è nella base principale. Esempio: il widget del ristorante ha la
                    propria base come principale e quella dell&apos;hotel come aggiuntiva, così può rispondere anche su
                    orari e camere.
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col gap-2">
                  {basi
                    .filter((b) => b.id !== basePrimaria)
                    .map((b) => (
                      <label
                        key={b.id}
                        className="flex cursor-pointer items-center gap-3 rounded-lg border border-border p-3 hover:bg-muted/50"
                      >
                        <Checkbox
                          checked={basiAggiuntive.includes(b.id)}
                          onCheckedChange={(v) => {
                            setBasiAggiuntive((prec) => (v ? [...prec, b.id] : prec.filter((x) => x !== b.id)))
                            setSalvato(false)
                          }}
                        />
                        <span className="flex-1 text-sm text-foreground">{b.name}</span>
                      </label>
                    ))}
                  {basi.filter((b) => b.id !== basePrimaria).length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      Hai una sola base di conoscenza, già usata come principale.
                    </p>
                  )}
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ---------------------------------------------------------------- */}
          <TabsContent value="installa" className="mt-4 flex flex-col gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Codice da incollare</CardTitle>
                <CardDescription>
                  Va inserito prima della chiusura del tag body, su ogni pagina del sito che deve mostrare la chat.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <pre className="overflow-x-auto rounded-lg bg-muted p-3 text-xs leading-relaxed text-foreground">
                  <code>{snippet}</code>
                </pre>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" className="gap-1.5 bg-transparent" onClick={copiaSnippet}>
                    {copiato ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                    {copiato ? "Copiato" : "Copia il codice"}
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <KeyRound className="h-4 w-4" />
                  Chiave del widget
                </CardTitle>
                <CardDescription>
                  Identifica questo widget. Non è l&apos;identificativo interno: se lo snippet finisce dove non deve,
                  puoi rigenerare la chiave senza toccare la configurazione.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap items-center gap-3">
                <code className="rounded bg-muted px-2 py-1 font-mono text-sm text-foreground">{chiave}</code>
                <Button variant="outline" size="sm" className="gap-1.5 bg-transparent" onClick={rigeneraChiave}>
                  <RefreshCw className="h-4 w-4" />
                  Rigenera
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* L'anteprima resta visibile mentre si cambia scheda: è il punto di
            controllo di tutto ciò che si sta modificando. */}
        <div className="lg:sticky lg:top-4 lg:self-start">
          <ChatWidgetPreview appearance={aspetto} />
          <p className="mt-2 text-sm text-muted-foreground">
            L&apos;anteprima è in scala ridotta, ma rispetta proporzioni, colori e posizione.
          </p>
        </div>
      </div>
    </div>
  )
}

function CursoreValore({
  etichetta,
  valore,
  min,
  max,
  onChange,
}: {
  etichetta: string
  valore: number
  min: number
  max: number
  onChange: (v: number) => void
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <Label>{etichetta}</Label>
        <span className="font-mono text-sm text-muted-foreground">{`${valore} px`}</span>
      </div>
      <Slider value={[valore]} min={min} max={max} step={1} onValueChange={([v]) => onChange(v)} />
    </div>
  )
}
