"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import {
  ArrowLeft, Check, Eye, GripVertical, ImagePlus, Loader2, Mic, Monitor, Play,
  Plus, Redo2, Save, Smartphone, Tablet, Trash2, Undo2, X,
} from "lucide-react"
import { AdminHeader } from "@/components/admin/admin-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { CMSMediaPickerDialog, type CMSMediaSelection } from "@/components/cms/media-picker-dialog"
import { createEmptyBuilderDocument, type CMSBuilderDocument } from "@/lib/cms/builder-document"
import { applyBuilderCommand, parseBuilderCommand, type BuilderCommand, type BuilderBreakpoint } from "@/lib/cms/builder-command"

type HistoryState = { past: CMSBuilderDocument[]; present: CMSBuilderDocument; future: CMSBuilderDocument[] }
type PendingCommand = { command: BuilderCommand; summary: string } | null
type DragPayload = { kind: "section"; sectionId: string } | { kind: "element"; sectionId: string; elementId: string }
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

function makePlacement(order = 0) {
  return {
    desktop: { order, columnStart: 1, columnSpan: 12, align: "stretch" as const, hidden: false },
    tablet: { order, columnStart: 1, columnSpan: 8, align: "stretch" as const, hidden: false },
    mobile: { order, columnStart: 1, columnSpan: 4, align: "stretch" as const, hidden: false },
  }
}

function starterDocument(templateId = "luxury"): CMSBuilderDocument {
  const document = createEmptyBuilderDocument(templateId)
  document.pages[0].sections = [
    {
      id: "section-hero", type: "hero", variant: "split", label: "Hero principale",
      background: { color: "#F3F0EA", overlayOpacity: 0 }, gridColumns: { desktop: 12, tablet: 8, mobile: 4 },
      elements: [
        { id: "hero-title", type: "heading", content: "Il tuo hotel, raccontato meglio", level: "h1", textAlign: "left", placement: makePlacement(0), locked: false },
        { id: "hero-text", type: "text", content: "Modifica il sito con mouse, testo o voce.", textAlign: "left", placement: makePlacement(1), locked: false },
        { id: "hero-cta", type: "button", label: "Prenota", href: "#booking", variant: "primary", openInNewTab: false, placement: makePlacement(2), locked: false },
      ],
    },
    {
      id: "section-rooms", type: "rooms", variant: "cards", label: "Camere",
      background: { color: "#FFFFFF", overlayOpacity: 0 }, gridColumns: { desktop: 12, tablet: 8, mobile: 4 },
      elements: [
        { id: "rooms-title", type: "heading", content: "Le nostre camere", level: "h2", textAlign: "center", placement: makePlacement(0), locked: false },
        { id: "rooms-text", type: "text", content: "Presenta le sistemazioni con immagini, servizi e call to action.", textAlign: "center", placement: makePlacement(1), locked: false },
      ],
    },
    {
      id: "section-booking", type: "offers", variant: "bar", label: "Prenotazione",
      background: { color: "#E9F3EC", overlayOpacity: 0 }, gridColumns: { desktop: 12, tablet: 8, mobile: 4 },
      elements: [{ id: "booking-widget", type: "booking-widget", mode: "bar", label: "Verifica disponibilità", placement: makePlacement(0), locked: false }],
    },
  ]
  return document
}

function clone<T>(value: T): T { return structuredClone(value) }
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
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [commandText, setCommandText] = useState("")
  const [commandError, setCommandError] = useState<string | null>(null)
  const [pendingCommand, setPendingCommand] = useState<PendingCommand>(null)
  const [listening, setListening] = useState(false)
  const [imageUrl, setImageUrl] = useState("")
  const [imageAlt, setImageAlt] = useState("")
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null)
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latestDocument = useRef(history.present)

  const page = history.present.pages[0]
  const selectedSection = page.sections.find((section) => section.id === selectedSectionId) ?? page.sections[0]
  const selectedElement: any = selectedSection?.elements.find((element) => element.id === selectedElementId) ?? null

  useEffect(() => { latestDocument.current = history.present }, [history.present])
  useEffect(() => () => { recognitionRef.current?.stop(); if (autosaveTimer.current) clearTimeout(autosaveTimer.current) }, [])

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
      } finally { setLoading(false) }
    }
    load()
  }, [])

  async function persist(document: CMSBuilderDocument, silent = false) {
    setSaving(true)
    if (!silent) setMessage(null)
    try {
      const response = await fetch("/api/cms/ai-project", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template_id: document.templateId, builder_document: document, current_step: 3 }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Salvataggio non riuscito")
      setDirty(false)
      setMessage(silent ? "Bozza salvata automaticamente" : "Progetto visuale salvato")
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Errore di salvataggio")
    } finally { setSaving(false) }
  }

  function scheduleAutosave() {
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current)
    autosaveTimer.current = setTimeout(() => persist(latestDocument.current, true), 2500)
  }

  function commit(mutator: (draft: CMSBuilderDocument) => void) {
    setHistory((current) => {
      const next = clone(current.present)
      mutator(next)
      latestDocument.current = next
      return { past: [...current.past, current.present].slice(-40), present: next, future: [] }
    })
    setDirty(true)
    scheduleAutosave()
  }

  function commitDocument(next: CMSBuilderDocument) {
    setHistory((current) => ({ past: [...current.past, current.present].slice(-40), present: next, future: [] }))
    latestDocument.current = next
    setDirty(true)
    scheduleAutosave()
  }

  function undo() {
    setHistory((current) => {
      if (!current.past.length) return current
      const previous = current.past[current.past.length - 1]
      latestDocument.current = previous
      return { past: current.past.slice(0, -1), present: previous, future: [current.present, ...current.future] }
    })
    setDirty(true); scheduleAutosave()
  }

  function redo() {
    setHistory((current) => {
      if (!current.future.length) return current
      const next = current.future[0]
      latestDocument.current = next
      return { past: [...current.past, current.present], present: next, future: current.future.slice(1) }
    })
    setDirty(true); scheduleAutosave()
  }

  function prepareCommand(value = commandText) {
    setCommandError(null); setPendingCommand(null)
    const parsed = parseBuilderCommand(value, history.present)
    if (!parsed.ok) return setCommandError(parsed.error)
    setPendingCommand({ command: parsed.command, summary: parsed.summary })
  }

  function executeCommand() {
    if (!pendingCommand) return
    commitDocument(applyBuilderCommand(history.present, pendingCommand.command))
    setMessage(`Eseguito: ${pendingCommand.summary}`)
    setCommandText(""); setPendingCommand(null); setCommandError(null)
  }

  function startListening() {
    setCommandError(null)
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) return setCommandError("Il riconoscimento vocale non è supportato. Usa Chrome o Edge aggiornato.")
    if (listening) return recognitionRef.current?.stop()
    const recognition: SpeechRecognitionInstance = new SpeechRecognition()
    recognition.lang = "it-IT"; recognition.interimResults = false; recognition.continuous = false
    recognition.onresult = (event: any) => {
      const transcript = Array.from(event.results).map((result: any) => result[0]?.transcript || "").join(" ").trim()
      setCommandText(transcript); prepareCommand(transcript)
    }
    recognition.onerror = (event: any) => {
      const errors: Record<string, string> = { "not-allowed": "Permesso microfono negato.", "no-speech": "Non ho rilevato la voce.", "audio-capture": "Microfono non disponibile." }
      setCommandError(errors[event.error] || "Errore durante il riconoscimento vocale.")
    }
    recognition.onend = () => setListening(false)
    recognitionRef.current = recognition; setListening(true); recognition.start()
  }

  function parseDrag(event: React.DragEvent): DragPayload | null {
    try { return JSON.parse(event.dataTransfer.getData("application/json")) } catch { return null }
  }

  function moveSection(sourceId: string, targetId: string) {
    if (sourceId === targetId) return
    commit((draft) => {
      const sections = draft.pages[0].sections
      const from = sections.findIndex((section) => section.id === sourceId)
      const to = sections.findIndex((section) => section.id === targetId)
      if (from < 0 || to < 0) return
      const [moved] = sections.splice(from, 1)
      sections.splice(to, 0, moved)
    })
  }

  function moveElement(sourceSectionId: string, elementId: string, targetSectionId: string, targetElementId?: string) {
    commit((draft) => {
      const source = draft.pages[0].sections.find((section) => section.id === sourceSectionId)
      const target = draft.pages[0].sections.find((section) => section.id === targetSectionId)
      if (!source || !target) return
      const index = source.elements.findIndex((element) => element.id === elementId)
      if (index < 0) return
      const [moved] = source.elements.splice(index, 1)
      const targetIndex = targetElementId ? target.elements.findIndex((element) => element.id === targetElementId) : target.elements.length
      target.elements.splice(targetIndex < 0 ? target.elements.length : targetIndex, 0, moved)
      target.elements.forEach((element, order) => { element.placement[breakpoint].order = order })
      source.elements.forEach((element, order) => { element.placement[breakpoint].order = order })
    })
  }

  function addSection() {
    const id = `section-${Date.now()}`
    commit((draft) => draft.pages[0].sections.push({
      id, type: "custom", variant: "default", label: "Nuova sezione",
      background: { color: "#FFFFFF", overlayOpacity: 0 },
      gridColumns: { desktop: 12, tablet: 8, mobile: 4 }, elements: [],
    }))
    setSelectedSectionId(id); setSelectedElementId(null)
  }

  function addElement(type: "heading" | "text" | "button" | "booking-widget") {
    if (!selectedSection) return
    const id = `${type}-${Date.now()}`
    commit((draft) => {
      const section = draft.pages[0].sections.find((item) => item.id === selectedSection.id)
      if (!section) return
      const order = section.elements.length
      if (type === "heading") section.elements.push({ id, type, content: "Nuovo titolo", level: "h2", textAlign: "left", placement: makePlacement(order), locked: false })
      if (type === "text") section.elements.push({ id, type, content: "Nuovo testo", textAlign: "left", placement: makePlacement(order), locked: false })
      if (type === "button") section.elements.push({ id, type, label: "Scopri di più", href: "#", variant: "primary", openInNewTab: false, placement: makePlacement(order), locked: false })
      if (type === "booking-widget") section.elements.push({ id, type, label: "Prenota", mode: "button", placement: makePlacement(order), locked: false })
    })
    setSelectedElementId(id)
  }

  function insertImage(selection: CMSMediaSelection) {
    if (!selectedSection) return
    const id = `image-${Date.now()}`
    commit((draft) => {
      const section = draft.pages[0].sections.find((item) => item.id === selectedSection.id)
      if (!section) return
      section.elements.push({
        id, type: "image", src: selection.publicUrl,
        alt: selection.altText || selection.originalName || "Immagine della struttura",
        fit: "cover", focalPoint: { x: 50, y: 50 },
        placement: makePlacement(section.elements.length), locked: false,
      })
    })
    setSelectedElementId(id)
    setMessage("Immagine inserita dalla libreria")
  }

  function addImageFromUrl() {
    if (!selectedSection || !/^https:\/\//i.test(imageUrl)) return setMessage("Inserisci un URL immagine HTTPS valido")
    insertImage({ publicUrl: imageUrl, altText: imageAlt || "Immagine della struttura", originalName: "Immagine esterna" })
    setImageUrl(""); setImageAlt("")
  }

  function replaceSelectedImage(selection: CMSMediaSelection) {
    if (!selectedSection || !selectedElement || selectedElement.type !== "image") return
    commit((draft) => {
      const section = draft.pages[0].sections.find((item) => item.id === selectedSection.id)
      const element: any = section?.elements.find((item) => item.id === selectedElement.id)
      if (!element) return
      element.src = selection.publicUrl
      element.alt = selection.altText || selection.originalName || element.alt || "Immagine della struttura"
    })
    setMessage("Immagine sostituita")
  }

  function removeSelectedElement() {
    if (!selectedSection || !selectedElementId) return
    commit((draft) => {
      const section = draft.pages[0].sections.find((item) => item.id === selectedSection.id)
      if (section) section.elements = section.elements.filter((element) => element.id !== selectedElementId)
    })
    setSelectedElementId(null)
  }

  const canvasWidth = useMemo(() => breakpoint === "desktop" ? "100%" : breakpoint === "tablet" ? "768px" : "390px", [breakpoint])
  if (loading) return <div className="flex min-h-[500px] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>

  return (
    <div className="space-y-5">
      <AdminHeader
        title="Editor visuale CMS"
        subtitle="Mouse, testo e voce modificano lo stesso documento"
        actions={<Button variant="outline" asChild><Link href="/admin/cms/studio"><ArrowLeft className="mr-2 h-4 w-4" />Torna allo studio</Link></Button>}
      />

      <Card className="border-primary/20">
        <CardHeader className="pb-3"><CardTitle className="text-base">Comando intelligente</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col gap-2 lg:flex-row">
            <Textarea value={commandText} onChange={(event) => setCommandText(event.target.value)} placeholder="Es. Sposta la sezione Camere prima di Prenotazione" className="min-h-20 flex-1" />
            <div className="flex gap-2 lg:flex-col">
              <Button variant={listening ? "destructive" : "outline"} onClick={startListening}><Mic className={`mr-2 h-4 w-4 ${listening ? "animate-pulse" : ""}`} />{listening ? "Ferma" : "Parla"}</Button>
              <Button onClick={() => prepareCommand()} disabled={!commandText.trim()}><Play className="mr-2 h-4 w-4" />Interpreta</Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Il comando viene mostrato in anteprima e richiede conferma. Le modifiche restano annullabili.</p>
          {commandError && <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{commandError}</div>}
          {pendingCommand && (
            <div className="flex flex-col gap-3 rounded-md border border-primary/30 bg-primary/5 p-3 sm:flex-row sm:items-center sm:justify-between">
              <div><p className="text-xs uppercase text-muted-foreground">Anteprima</p><p className="font-medium">{pendingCommand.summary}</p></div>
              <div className="flex gap-2"><Button variant="outline" onClick={() => setPendingCommand(null)}><X className="mr-2 h-4 w-4" />Annulla</Button><Button onClick={executeCommand}><Check className="mr-2 h-4 w-4" />Esegui</Button></div>
            </div>
          )}
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
        <div className="flex items-center gap-2">
          {message && <span className="text-sm text-muted-foreground">{message}</span>}
          <Badge variant={dirty ? "secondary" : "outline"}><Eye className="mr-1 h-3 w-3" />{dirty ? "Modifiche non salvate" : "Bozza salvata"}</Badge>
          <Button onClick={() => persist(history.present)} disabled={saving}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Salva</Button>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[250px_minmax(0,1fr)_300px]">
        <Card className="h-fit">
          <CardHeader><CardTitle className="text-base">Blocchi</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <Button variant="outline" className="w-full justify-start" onClick={() => addElement("heading")}><Plus className="mr-2 h-4 w-4" />Titolo</Button>
            <Button variant="outline" className="w-full justify-start" onClick={() => addElement("text")}><Plus className="mr-2 h-4 w-4" />Testo</Button>
            <Button variant="outline" className="w-full justify-start" onClick={() => addElement("button")}><Plus className="mr-2 h-4 w-4" />Pulsante</Button>
            <Button variant="outline" className="w-full justify-start" onClick={() => addElement("booking-widget")}><Plus className="mr-2 h-4 w-4" />Booking widget</Button>
            <div className="space-y-2 border-t pt-3">
              <CMSMediaPickerDialog onSelect={insertImage} triggerLabel="Scegli immagine" />
              <details className="rounded-md border p-2">
                <summary className="cursor-pointer text-xs font-medium text-muted-foreground">Usa URL esterno</summary>
                <div className="mt-2 space-y-2">
                  <Input value={imageUrl} onChange={(event) => setImageUrl(event.target.value)} placeholder="https://.../foto.jpg" />
                  <Input value={imageAlt} onChange={(event) => setImageAlt(event.target.value)} placeholder="Descrizione accessibile" />
                  <Button variant="outline" className="w-full" onClick={addImageFromUrl}><ImagePlus className="mr-2 h-4 w-4" />Aggiungi da URL</Button>
                </div>
              </details>
            </div>
            <Button className="mt-3 w-full" onClick={addSection}><Plus className="mr-2 h-4 w-4" />Nuova sezione</Button>
          </CardContent>
        </Card>

        <div className="overflow-x-auto rounded-xl border bg-muted/30 p-5">
          <div className="mx-auto min-h-[700px] overflow-hidden rounded-lg border bg-background shadow-sm transition-all" style={{ width: canvasWidth, maxWidth: "100%" }}>
            {page.sections.map((section) => (
              <section
                key={section.id}
                draggable
                onDragStart={(event) => event.dataTransfer.setData("application/json", JSON.stringify({ kind: "section", sectionId: section.id }))}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault()
                  const payload = parseDrag(event)
                  if (!payload) return
                  payload.kind === "section" ? moveSection(payload.sectionId, section.id) : moveElement(payload.sectionId, payload.elementId, section.id)
                }}
                onClick={() => { setSelectedSectionId(section.id); setSelectedElementId(null) }}
                className={`group relative border-b p-6 transition ${selectedSectionId === section.id ? "ring-2 ring-inset ring-primary" : "hover:ring-1 hover:ring-inset hover:ring-primary/30"}`}
                style={{ backgroundColor: section.background.color || "#FFFFFF" }}
              >
                <div className="mb-4 flex items-center gap-1 text-xs font-medium text-muted-foreground"><GripVertical className="h-3 w-3" />{section.label}</div>
                <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${section.gridColumns[breakpoint]}, minmax(0,1fr))` }}>
                  {section.elements
                    .filter((element) => !element.placement[breakpoint].hidden)
                    .sort((a, b) => a.placement[breakpoint].order - b.placement[breakpoint].order)
                    .map((element: any) => (
                      <div
                        key={element.id}
                        draggable
                        onDragStart={(event) => { event.stopPropagation(); event.dataTransfer.setData("application/json", JSON.stringify({ kind: "element", sectionId: section.id, elementId: element.id })) }}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={(event) => { event.stopPropagation(); event.preventDefault(); const payload = parseDrag(event); if (payload?.kind === "element") moveElement(payload.sectionId, payload.elementId, section.id, element.id) }}
                        onClick={(event) => { event.stopPropagation(); setSelectedSectionId(section.id); setSelectedElementId(element.id) }}
                        className={`cursor-move rounded border border-dashed p-2 ${selectedElementId === element.id ? "border-primary bg-primary/5" : "border-transparent hover:border-primary/50"}`}
                        style={{ gridColumn: `${element.placement[breakpoint].columnStart} / span ${Math.min(element.placement[breakpoint].columnSpan, section.gridColumns[breakpoint])}`, textAlign: element.textAlign || "left" }}
                      >
                        {element.type === "heading" && <div className={element.level === "h1" ? "text-4xl font-bold" : "text-2xl font-semibold"}>{element.content}</div>}
                        {element.type === "text" && <p className="text-muted-foreground">{element.content}</p>}
                        {element.type === "button" && <Button>{element.label}</Button>}
                        {element.type === "booking-widget" && <div className="rounded-lg border bg-background p-4"><strong>{element.label}</strong><div className="mt-3 grid grid-cols-3 gap-2"><div className="h-9 rounded bg-muted" /><div className="h-9 rounded bg-muted" /><div className="h-9 rounded bg-primary" /></div></div>}
                        {element.type === "image" && <img src={element.src} alt={element.alt} className="aspect-video w-full rounded object-cover" style={{ objectPosition: `${element.focalPoint.x}% ${element.focalPoint.y}%` }} />}
                        {element.type === "spacer" && <div style={{ height: element.height[breakpoint] }} />}
                      </div>
                    ))}
                  {!section.elements.length && <div className="col-span-full rounded border border-dashed p-8 text-center text-sm text-muted-foreground">Aggiungi o trascina qui un elemento</div>}
                </div>
              </section>
            ))}
          </div>
        </div>

        <Card className="h-fit">
          <CardHeader><CardTitle className="text-base">Proprietà</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {selectedSection && (
              <>
                <div>
                  <label className="text-xs text-muted-foreground">Nome sezione</label>
                  <Input value={selectedSection.label} onChange={(event) => commit((draft) => { const section = draft.pages[0].sections.find((item) => item.id === selectedSection.id); if (section) section.label = event.target.value })} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Sfondo</label>
                  <Input type="color" value={selectedSection.background.color || "#FFFFFF"} onChange={(event) => commit((draft) => { const section = draft.pages[0].sections.find((item) => item.id === selectedSection.id); if (section) section.background.color = event.target.value })} />
                </div>
              </>
            )}

            {selectedElement ? (
              <div className="space-y-3 border-t pt-4">
                <p className="text-sm font-medium">Elemento: {selectedElement.type}</p>
                {(selectedElement.type === "heading" || selectedElement.type === "text") && <Textarea value={selectedElement.content} onChange={(event) => commit((draft) => { const section = draft.pages[0].sections.find((item) => item.id === selectedSection.id); const element: any = section?.elements.find((item) => item.id === selectedElement.id); if (element) element.content = event.target.value })} />}
                {(selectedElement.type === "button" || selectedElement.type === "booking-widget") && <Input value={selectedElement.label} onChange={(event) => commit((draft) => { const section = draft.pages[0].sections.find((item) => item.id === selectedSection.id); const element: any = section?.elements.find((item) => item.id === selectedElement.id); if (element) element.label = event.target.value })} />}
                {selectedElement.type === "button" && <Input value={selectedElement.href} onChange={(event) => commit((draft) => { const section = draft.pages[0].sections.find((item) => item.id === selectedSection.id); const element: any = section?.elements.find((item) => item.id === selectedElement.id); if (element) element.href = event.target.value })} placeholder="/pagina o https://..." />}
                {selectedElement.type === "image" && (
                  <>
                    <CMSMediaPickerDialog onSelect={replaceSelectedImage} triggerLabel="Sostituisci dalla libreria" />
                    <label className="text-xs text-muted-foreground">URL immagine</label>
                    <Input value={selectedElement.src || ""} onChange={(event) => commit((draft) => { const section = draft.pages[0].sections.find((item) => item.id === selectedSection.id); const element: any = section?.elements.find((item) => item.id === selectedElement.id); if (element) element.src = event.target.value })} />
                    <label className="text-xs text-muted-foreground">Descrizione accessibile</label>
                    <Input value={selectedElement.alt} onChange={(event) => commit((draft) => { const section = draft.pages[0].sections.find((item) => item.id === selectedSection.id); const element: any = section?.elements.find((item) => item.id === selectedElement.id); if (element) element.alt = event.target.value })} />
                  </>
                )}
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={selectedElement.placement[breakpoint].hidden} onChange={(event) => commit((draft) => { const section = draft.pages[0].sections.find((item) => item.id === selectedSection.id); const element = section?.elements.find((item) => item.id === selectedElement.id); if (element) element.placement[breakpoint].hidden = event.target.checked })} />Nascondi su {breakpoint}</label>
                <Button variant="destructive" className="w-full" onClick={removeSelectedElement}><Trash2 className="mr-2 h-4 w-4" />Elimina elemento</Button>
              </div>
            ) : (
              <div className="space-y-2 border-t pt-4">
                <p className="text-xs text-muted-foreground">Elementi della sezione</p>
                {selectedSection?.elements.map((element) => <button key={element.id} type="button" onClick={() => setSelectedElementId(element.id)} className="w-full rounded border p-2 text-left text-sm"><span className="line-clamp-2">{elementLabel(element)}</span></button>)}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
