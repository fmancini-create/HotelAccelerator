"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { ArrowLeft, Eye, GripVertical, Loader2, Monitor, Plus, Redo2, Save, Smartphone, Tablet, Trash2, Undo2 } from "lucide-react"
import { AdminHeader } from "@/components/admin/admin-header"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { createEmptyBuilderDocument, type CMSBuilderDocument } from "@/lib/cms/builder-document"

type Breakpoint = "desktop" | "tablet" | "mobile"
type HistoryState = { past: CMSBuilderDocument[]; present: CMSBuilderDocument; future: CMSBuilderDocument[] }
type DragPayload = { kind: "section"; sectionId: string } | { kind: "element"; sectionId: string; elementId: string }

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
        { id: "hero-text", type: "text", content: "Modifica testi, pulsanti e immagini trascinandoli nel canvas.", textAlign: "left", placement: { ...placement, desktop: { ...placement.desktop, order: 1 } }, locked: false },
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
      elements: [
        { id: "booking-widget", type: "booking-widget", mode: "bar", label: "Verifica disponibilità", placement, locked: false },
      ],
    },
  ]
  return document
}

function clone<T>(value: T): T {
  return structuredClone(value)
}

function elementLabel(element: any) {
  if (element.type === "heading") return element.content
  if (element.type === "text") return element.content
  if (element.type === "button") return element.label
  if (element.type === "booking-widget") return element.label
  if (element.type === "image") return element.alt || "Immagine"
  return element.type
}

export default function CMSVisualBuilderPage() {
  const [history, setHistory] = useState<HistoryState>({ past: [], present: starterDocument(), future: [] })
  const [breakpoint, setBreakpoint] = useState<Breakpoint>("desktop")
  const [selectedSectionId, setSelectedSectionId] = useState("section-hero")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

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

  function commit(mutator: (draft: CMSBuilderDocument) => void) {
    setHistory((current) => {
      const next = clone(current.present)
      mutator(next)
      return { past: [...current.past, current.present].slice(-40), present: next, future: [] }
    })
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

  function addSection() {
    const id = `section-${Date.now()}`
    commit((draft) => draft.pages[0].sections.push({
      id,
      type: "custom",
      variant: "default",
      label: "Nuova sezione",
      background: { color: "#FFFFFF", overlayOpacity: 0 },
      gridColumns: { desktop: 12, tablet: 8, mobile: 4 },
      elements: [],
    }))
    setSelectedSectionId(id)
  }

  function addElement(type: "heading" | "text" | "button" | "booking-widget") {
    if (!selectedSection) return
    const id = `${type}-${Date.now()}`
    commit((draft) => {
      const section = draft.pages[0].sections.find((item) => item.id === selectedSection.id)
      if (!section) return
      const order = section.elements.length
      if (type === "heading") section.elements.push({ id, type, content: "Nuovo titolo", level: "h2", textAlign: "left", placement: { ...placement, desktop: { ...placement.desktop, order } }, locked: false })
      if (type === "text") section.elements.push({ id, type, content: "Nuovo testo", textAlign: "left", placement: { ...placement, desktop: { ...placement.desktop, order } }, locked: false })
      if (type === "button") section.elements.push({ id, type, label: "Scopri di più", href: "#", variant: "primary", openInNewTab: false, placement: { ...placement, desktop: { ...placement.desktop, order } }, locked: false })
      if (type === "booking-widget") section.elements.push({ id, type, label: "Prenota", mode: "button", placement: { ...placement, desktop: { ...placement.desktop, order } }, locked: false })
    })
  }

  function removeSection(id: string) {
    commit((draft) => { draft.pages[0].sections = draft.pages[0].sections.filter((section) => section.id !== id) })
    setSelectedSectionId(page.sections.find((section) => section.id !== id)?.id || "")
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
    })
  }

  function parseDrag(event: React.DragEvent): DragPayload | null {
    try { return JSON.parse(event.dataTransfer.getData("application/json")) } catch { return null }
  }

  const canvasWidth = useMemo(() => breakpoint === "desktop" ? "100%" : breakpoint === "tablet" ? "768px" : "390px", [breakpoint])

  if (loading) return <div className="flex min-h-[500px] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>

  return (
    <div className="space-y-5">
      <AdminHeader title="Editor visuale CMS" subtitle="Trascina sezioni ed elementi, poi salva il documento strutturato" actions={<Button variant="outline" asChild><Link href="/admin/cms/studio"><ArrowLeft className="mr-2 h-4 w-4" />Torna allo studio</Link></Button>} />

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
          <Badge variant="outline"><Eye className="mr-1 h-3 w-3" />Bozza</Badge>
          <Button onClick={save} disabled={saving}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Salva</Button>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[260px_minmax(0,1fr)_280px]">
        <Card className="h-fit"><CardHeader><CardTitle className="text-base">Blocchi</CardTitle></CardHeader><CardContent className="space-y-2">
          <Button variant="outline" className="w-full justify-start" onClick={() => addElement("heading")}><Plus className="mr-2 h-4 w-4" />Titolo</Button>
          <Button variant="outline" className="w-full justify-start" onClick={() => addElement("text")}><Plus className="mr-2 h-4 w-4" />Testo</Button>
          <Button variant="outline" className="w-full justify-start" onClick={() => addElement("button")}><Plus className="mr-2 h-4 w-4" />Pulsante</Button>
          <Button variant="outline" className="w-full justify-start" onClick={() => addElement("booking-widget")}><Plus className="mr-2 h-4 w-4" />Booking widget</Button>
          <Button className="mt-4 w-full" onClick={addSection}><Plus className="mr-2 h-4 w-4" />Nuova sezione</Button>
        </CardContent></Card>

        <div className="overflow-x-auto rounded-xl border bg-muted/30 p-5">
          <div className="mx-auto min-h-[700px] overflow-hidden rounded-lg border bg-background shadow-sm transition-all" style={{ width: canvasWidth, maxWidth: "100%" }}>
            {page.sections.map((section) => (
              <section key={section.id} draggable onDragStart={(event) => event.dataTransfer.setData("application/json", JSON.stringify({ kind: "section", sectionId: section.id }))} onDragOver={(event) => event.preventDefault()} onDrop={(event) => {
                event.preventDefault(); const payload = parseDrag(event); if (!payload) return
                if (payload.kind === "section") moveSection(payload.sectionId, section.id)
                else moveElement(payload.sectionId, payload.elementId, section.id)
              }} onClick={() => setSelectedSectionId(section.id)} className={`group relative border-b p-6 transition ${selectedSectionId === section.id ? "ring-2 ring-inset ring-primary" : "hover:ring-1 hover:ring-inset hover:ring-primary/30"}`} style={{ backgroundColor: section.background.color || "#FFFFFF" }}>
                <div className="absolute left-2 top-2 flex items-center gap-1 rounded bg-background/90 px-2 py-1 text-xs opacity-0 shadow group-hover:opacity-100"><GripVertical className="h-3 w-3" />{section.label}</div>
                <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${section.gridColumns[breakpoint]}, minmax(0, 1fr))` }}>
                  {section.elements.filter((element) => !element.placement[breakpoint].hidden).sort((a, b) => a.placement[breakpoint].order - b.placement[breakpoint].order).map((element) => (
                    <div key={element.id} draggable onDragStart={(event) => { event.stopPropagation(); event.dataTransfer.setData("application/json", JSON.stringify({ kind: "element", sectionId: section.id, elementId: element.id })) }} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.stopPropagation(); event.preventDefault(); const payload = parseDrag(event); if (payload?.kind === "element") moveElement(payload.sectionId, payload.elementId, section.id, element.id) }} className="cursor-move rounded border border-dashed border-transparent p-2 hover:border-primary/50" style={{ gridColumn: `${element.placement[breakpoint].columnStart} / span ${Math.min(element.placement[breakpoint].columnSpan, section.gridColumns[breakpoint])}`, textAlign: "textAlign" in element ? element.textAlign : "left" }}>
                      {element.type === "heading" && <div className={element.level === "h1" ? "text-4xl font-bold" : "text-2xl font-semibold"}>{element.content}</div>}
                      {element.type === "text" && <p className="text-muted-foreground">{element.content}</p>}
                      {element.type === "button" && <Button>{element.label}</Button>}
                      {element.type === "booking-widget" && <div className="rounded-lg border bg-background p-4"><strong>{element.label}</strong><div className="mt-3 grid grid-cols-3 gap-2"><div className="h-9 rounded bg-muted" /><div className="h-9 rounded bg-muted" /><div className="h-9 rounded bg-primary" /></div></div>}
                      {element.type === "image" && <div className="aspect-video rounded bg-muted">{element.alt}</div>}
                      {element.type === "spacer" && <div style={{ height: element.height[breakpoint] }} />}
                    </div>
                  ))}
                  {!section.elements.length && <div className="col-span-full rounded border border-dashed p-8 text-center text-sm text-muted-foreground">Trascina qui un elemento o aggiungilo dalla colonna sinistra</div>}
                </div>
              </section>
            ))}
          </div>
        </div>

        <Card className="h-fit"><CardHeader><CardTitle className="text-base">Sezione selezionata</CardTitle></CardHeader><CardContent className="space-y-4">
          {selectedSection ? <>
            <div><label className="text-xs text-muted-foreground">Nome</label><Input value={selectedSection.label} onChange={(event) => commit((draft) => { const section = draft.pages[0].sections.find((item) => item.id === selectedSection.id); if (section) section.label = event.target.value })} /></div>
            <div><label className="text-xs text-muted-foreground">Colore sfondo</label><Input type="color" value={selectedSection.background.color || "#FFFFFF"} onChange={(event) => commit((draft) => { const section = draft.pages[0].sections.find((item) => item.id === selectedSection.id); if (section) section.background.color = event.target.value })} /></div>
            <div className="space-y-2"><p className="text-xs text-muted-foreground">Elementi</p>{selectedSection.elements.map((element) => <div key={element.id} className="flex items-center justify-between rounded border p-2 text-sm"><span className="truncate">{elementLabel(element)}</span><GripVertical className="h-4 w-4 text-muted-foreground" /></div>)}</div>
            <Button variant="destructive" className="w-full" onClick={() => removeSection(selectedSection.id)} disabled={page.sections.length <= 1}><Trash2 className="mr-2 h-4 w-4" />Elimina sezione</Button>
          </> : <p className="text-sm text-muted-foreground">Seleziona una sezione nel canvas.</p>}
        </CardContent></Card>
      </div>
    </div>
  )
}
