"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { ArrowLeft, Check, Eye, Loader2, Mic, Monitor, Play, Redo2, Save, Smartphone, Tablet, Undo2, X } from "lucide-react"
import { AdminHeader } from "@/components/admin/admin-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { createEmptyBuilderDocument, type CMSBuilderDocument } from "@/lib/cms/builder-document"
import { applyBuilderCommand, parseBuilderCommand, type BuilderCommand, type BuilderBreakpoint } from "@/lib/cms/builder-command"

type HistoryState = { past: CMSBuilderDocument[]; present: CMSBuilderDocument; future: CMSBuilderDocument[] }
type PendingCommand = { command: BuilderCommand; summary: string } | null

type SpeechRecognitionInstance = {
  lang: string
  interimResults: boolean
  continuous: boolean
  start: () => void
  stop: () => void
  onresult: ((event: any) => void) | null
  onerror: ((event: any) => void) | null
  onend: (() => void) | null
}

const placement = {
  desktop: { order: 0, columnStart: 1, columnSpan: 12, align: "stretch" as const, hidden: false },
  tablet: { order: 0, columnStart: 1, columnSpan: 8, align: "stretch" as const, hidden: false },
  mobile: { order: 0, columnStart: 1, columnSpan: 4, align: "stretch" as const, hidden: false },
}

function starterDocument(templateId = "luxury"): CMSBuilderDocument {
  const document = createEmptyBuilderDocument(templateId)
  document.pages[0].sections = [
    {
      id: "section-hero",
      type: "hero",
      variant: "split",
      label: "Hero principale",
      background: { color: "#F3F0EA", overlayOpacity: 0 },
      gridColumns: { desktop: 12, tablet: 8, mobile: 4 },
      elements: [
        { id: "hero-title", type: "heading", content: "Il tuo hotel, raccontato meglio", level: "h1", textAlign: "left", placement, locked: false },
        { id: "hero-text", type: "text", content: "Modifica il sito con mouse, testo o voce.", textAlign: "left", placement: { ...placement, desktop: { ...placement.desktop, order: 1 } }, locked: false },
        { id: "hero-cta", type: "button", label: "Prenota", href: "#booking", variant: "primary", openInNewTab: false, placement: { ...placement, desktop: { ...placement.desktop, order: 2 } }, locked: false },
      ],
    },
    {
      id: "section-rooms",
      type: "rooms",
      variant: "cards",
      label: "Camere",
      background: { color: "#FFFFFF", overlayOpacity: 0 },
      gridColumns: { desktop: 12, tablet: 8, mobile: 4 },
      elements: [
        { id: "rooms-title", type: "heading", content: "Le nostre camere", level: "h2", textAlign: "center", placement, locked: false },
        { id: "rooms-text", type: "text", content: "Presenta le sistemazioni con immagini, servizi e call to action.", textAlign: "center", placement: { ...placement, desktop: { ...placement.desktop, order: 1 } }, locked: false },
      ],
    },
    {
      id: "section-booking",
      type: "offers",
      variant: "bar",
      label: "Prenotazione",
      background: { color: "#E9F3EC", overlayOpacity: 0 },
      gridColumns: { desktop: 12, tablet: 8, mobile: 4 },
      elements: [{ id: "booking-widget", type: "booking-widget", mode: "bar", label: "Verifica disponibilità", placement, locked: false }],
    },
  ]
  return document
}

function elementLabel(element: any) {
  if (element.type === "heading" || element.type === "text") return element.content
  if (element.type === "button" || element.type === "booking-widget") return element.label
  if (element.type === "image") return element.alt || "Immagine"
  return element.type
}

export default function CMSVisualBuilderPage() {
  const [history, setHistory] = useState<HistoryState>({ past: [], present: starterDocument(), future: [] })
  const [breakpoint, setBreakpoint] = useState<BuilderBreakpoint>("desktop")
  const [selectedSectionId, setSelectedSectionId] = useState("section-hero")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [commandText, setCommandText] = useState("")
  const [commandError, setCommandError] = useState<string | null>(null)
  const [pendingCommand, setPendingCommand] = useState<PendingCommand>(null)
  const [listening, setListening] = useState(false)
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null)

  const page = history.present.pages[0]
  const selectedSection = page.sections.find((section) => section.id === selectedSectionId) ?? page.sections[0]

  useEffect(() => {
    async function load() {
      try {
        const response = await fetch("/api/cms/ai-project", { cache: "no-store" })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || "Impossibile caricare il progetto")
        const document = data.project?.builder_document || starterDocument(data.project?.template_id || "luxury")
        setHistory({ past: [], present: document, future: [] })
        setSelectedSectionId(document.pages[0]?.sections[0]?.id || "")
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Errore di caricamento")
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  function commit(next: CMSBuilderDocument) {
    setHistory((current) => ({ past: [...current.past, current.present].slice(-40), present: next, future: [] }))
  }

  function undo() {
    setHistory((current) => {
      if (!current.past.length) return current
      const previous = current.past[current.past.length - 1]
      return { past: current.past.slice(0, -1), present: previous, future: [current.present, ...current.future] }
    })
  }

  function redo() {
    setHistory((current) => {
      if (!current.future.length) return current
      const next = current.future[0]
      return { past: [...current.past, current.present], present: next, future: current.future.slice(1) }
    })
  }

  async function save() {
    setSaving(true)
    setMessage(null)
    try {
      const response = await fetch("/api/cms/ai-project", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template_id: history.present.templateId, builder_document: history.present, current_step: 3 }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Salvataggio non riuscito")
      setMessage("Progetto visuale salvato")
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Errore di salvataggio")
    } finally {
      setSaving(false)
    }
  }

  function prepareCommand(value = commandText) {
    setCommandError(null)
    setPendingCommand(null)
    const parsed = parseBuilderCommand(value, history.present)
    if (!parsed.ok) {
      setCommandError(parsed.error)
      return
    }
    setPendingCommand({ command: parsed.command, summary: parsed.summary })
  }

  function executeCommand() {
    if (!pendingCommand) return
    commit(applyBuilderCommand(history.present, pendingCommand.command))
    setMessage(`Eseguito: ${pendingCommand.summary}`)
    setCommandText("")
    setPendingCommand(null)
    setCommandError(null)
  }

  function startListening() {
    setCommandError(null)
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) {
      setCommandError("Il riconoscimento vocale non è supportato da questo browser. Usa Chrome o Edge aggiornato.")
      return
    }
    if (listening) {
      recognitionRef.current?.stop()
      return
    }
    const recognition: SpeechRecognitionInstance = new SpeechRecognition()
    recognition.lang = "it-IT"
    recognition.interimResults = false
    recognition.continuous = false
    recognition.onresult = (event: any) => {
      const transcript = Array.from(event.results).map((result: any) => result[0]?.transcript || "").join(" ").trim()
      setCommandText(transcript)
      prepareCommand(transcript)
    }
    recognition.onerror = (event: any) => {
      const errors: Record<string, string> = {
        "not-allowed": "Permesso microfono negato.",
        "no-speech": "Non ho rilevato la voce.",
        "audio-capture": "Microfono non disponibile.",
      }
      setCommandError(errors[event.error] || "Errore durante il riconoscimento vocale.")
    }
    recognition.onend = () => setListening(false)
    recognitionRef.current = recognition
    setListening(true)
    recognition.start()
  }

  function moveSection(sectionId: string, direction: -1 | 1) {
    const sections = structuredClone(page.sections)
    const index = sections.findIndex((section) => section.id === sectionId)
    const target = index + direction
    if (index < 0 || target < 0 || target >= sections.length) return
    const [moved] = sections.splice(index, 1)
    sections.splice(target, 0, moved)
    const next = structuredClone(history.present)
    next.pages[0].sections = sections
    commit(next)
  }

  const canvasWidth = useMemo(() => breakpoint === "desktop" ? "100%" : breakpoint === "tablet" ? "768px" : "390px", [breakpoint])

  if (loading) return <div className="flex min-h-[500px] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>

  return (
    <div className="space-y-5">
      <AdminHeader title="Editor visuale CMS" subtitle="Modifica il sito con mouse, testo o voce" actions={<Button variant="outline" asChild><Link href="/admin/cms/studio"><ArrowLeft className="mr-2 h-4 w-4" />Torna allo studio</Link></Button>} />

      <Card className="border-primary/20">
        <CardHeader className="pb-3"><CardTitle className="text-base">Comando intelligente</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col gap-2 lg:flex-row">
            <Textarea value={commandText} onChange={(event) => setCommandText(event.target.value)} placeholder="Es. Sposta la sezione Camere prima della sezione Prenotazione" className="min-h-20 flex-1" />
            <div className="flex gap-2 lg:flex-col">
              <Button variant={listening ? "destructive" : "outline"} onClick={startListening}><Mic className={`mr-2 h-4 w-4 ${listening ? "animate-pulse" : ""}`} />{listening ? "Ferma" : "Parla"}</Button>
              <Button onClick={() => prepareCommand()} disabled={!commandText.trim()}><Play className="mr-2 h-4 w-4" />Interpreta</Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Esempi: “Rinomina la sezione Camere in Suite e camere”, “Nascondi la sezione Prenotazione su mobile”, “Aggiungi un pulsante con etichetta Prenota ora alla sezione Hero principale”.</p>
          {commandError && <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{commandError}</div>}
          {pendingCommand && <div className="flex flex-col gap-3 rounded-md border border-primary/30 bg-primary/5 p-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Anteprima comando</p><p className="font-medium">{pendingCommand.summary}</p></div><div className="flex gap-2"><Button variant="outline" onClick={() => setPendingCommand(null)}><X className="mr-2 h-4 w-4" />Annulla</Button><Button onClick={executeCommand}><Check className="mr-2 h-4 w-4" />Esegui</Button></div></div>}
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-background p-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={undo} disabled={!history.past.length}><Undo2 className="h-4 w-4" /></Button>
          <Button variant="outline" size="icon" onClick={redo} disabled={!history.future.length}><Redo2 className="h-4 w-4" /></Button>
          <div className="ml-2 flex rounded-md border p-1">
            <Button size="sm" variant={breakpoint === "desktop" ? "secondary" : "ghost"} onClick={() => setBreakpoint("desktop")}><Monitor className="mr-2 h-4 w-4" />Desktop</Button>
            <Button size="sm" variant={breakpoint === "tablet" ? "secondary" : "ghost"} onClick={() => setBreakpoint("tablet")}><Tablet className="mr-2 h-4 w-4" />Tablet</Button>
            <Button size="sm" variant={breakpoint === "mobile" ? "secondary" : "ghost"} onClick={() => setBreakpoint("mobile")}><Smartphone className="mr-2 h-4 w-4" />Mobile</Button>
          </div>
        </div>
        <div className="flex items-center gap-2">{message && <span className="text-sm text-muted-foreground">{message}</span>}<Badge variant="outline"><Eye className="mr-1 h-3 w-3" />Bozza</Badge><Button onClick={save} disabled={saving}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Salva</Button></div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[240px_minmax(0,1fr)_280px]">
        <Card className="h-fit"><CardHeader><CardTitle className="text-base">Sezioni</CardTitle></CardHeader><CardContent className="space-y-2">{page.sections.map((section, index) => <button key={section.id} type="button" onClick={() => setSelectedSectionId(section.id)} className={`w-full rounded-md border p-3 text-left ${selectedSectionId === section.id ? "border-primary bg-primary/5" : ""}`}><div className="flex items-center justify-between gap-2"><span className="truncate font-medium">{section.label}</span><span className="text-xs text-muted-foreground">{index + 1}</span></div></button>)}</CardContent></Card>

        <div className="overflow-x-auto rounded-xl border bg-muted/30 p-5">
          <div className="mx-auto min-h-[700px] overflow-hidden rounded-lg border bg-background shadow-sm transition-all" style={{ width: canvasWidth, maxWidth: "100%" }}>
            {page.sections.map((section) => {
              const visibleElements = section.elements.filter((element) => !element.placement[breakpoint].hidden).sort((a, b) => a.placement[breakpoint].order - b.placement[breakpoint].order)
              return <section key={section.id} onClick={() => setSelectedSectionId(section.id)} className={`relative border-b p-6 transition ${selectedSectionId === section.id ? "ring-2 ring-inset ring-primary" : "hover:ring-1 hover:ring-inset hover:ring-primary/30"}`} style={{ backgroundColor: section.background.color || "#FFFFFF" }}>
                <div className="mb-4 text-xs font-medium text-muted-foreground">{section.label}</div>
                <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${section.gridColumns[breakpoint]}, minmax(0, 1fr))` }}>
                  {visibleElements.map((element) => <div key={element.id} className="rounded border border-dashed border-transparent p-2 hover:border-primary/50" style={{ gridColumn: `${element.placement[breakpoint].columnStart} / span ${Math.min(element.placement[breakpoint].columnSpan, section.gridColumns[breakpoint])}`, textAlign: "textAlign" in element ? element.textAlign : "left" }}>
                    {element.type === "heading" && <div className={element.level === "h1" ? "text-4xl font-bold" : "text-2xl font-semibold"}>{element.content}</div>}
                    {element.type === "text" && <p className="text-muted-foreground">{element.content}</p>}
                    {element.type === "button" && <Button>{element.label}</Button>}
                    {element.type === "booking-widget" && <div className="rounded-lg border bg-background p-4"><strong>{element.label}</strong><div className="mt-3 grid grid-cols-3 gap-2"><div className="h-9 rounded bg-muted" /><div className="h-9 rounded bg-muted" /><div className="h-9 rounded bg-primary" /></div></div>}
                    {element.type === "image" && <div className="aspect-video rounded bg-muted p-3 text-sm">{element.alt}</div>}
                    {element.type === "spacer" && <div style={{ height: element.height[breakpoint] }} />}
                  </div>)}
                  {!visibleElements.length && <div className="col-span-full rounded border border-dashed p-8 text-center text-sm text-muted-foreground">Sezione nascosta o vuota su questo dispositivo</div>}
                </div>
              </section>
            })}
          </div>
        </div>

        <Card className="h-fit"><CardHeader><CardTitle className="text-base">Sezione selezionata</CardTitle></CardHeader><CardContent className="space-y-4">{selectedSection ? <><div><label className="text-xs text-muted-foreground">Nome</label><Input value={selectedSection.label} readOnly /></div><div><label className="text-xs text-muted-foreground">Sfondo</label><div className="mt-1 flex items-center gap-2"><div className="h-8 w-8 rounded border" style={{ backgroundColor: selectedSection.background.color || "#FFFFFF" }} /><code className="text-xs">{selectedSection.background.color || "#FFFFFF"}</code></div></div><div className="space-y-2"><p className="text-xs text-muted-foreground">Elementi</p>{selectedSection.elements.map((element) => <div key={element.id} className="rounded border p-2 text-sm"><span className="line-clamp-2">{elementLabel(element)}</span></div>)}</div><div className="grid grid-cols-2 gap-2"><Button variant="outline" onClick={() => moveSection(selectedSection.id, -1)}>Sposta su</Button><Button variant="outline" onClick={() => moveSection(selectedSection.id, 1)}>Sposta giù</Button></div></> : <p className="text-sm text-muted-foreground">Seleziona una sezione.</p>}</CardContent></Card>
      </div>
    </div>
  )
}
