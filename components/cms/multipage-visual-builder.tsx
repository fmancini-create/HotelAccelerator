"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import {
  ArrowDown, ArrowLeft, ArrowUp, Copy, Eye, ImagePlus, Loader2, Monitor,
  Plus, Save, Smartphone, Tablet, Trash2,
} from "lucide-react"
import { AdminHeader } from "@/components/admin/admin-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { CMSMediaPickerDialog, type CMSMediaSelection } from "@/components/cms/media-picker-dialog"
import { CMSBuilderDocumentSchema, createEmptyBuilderDocument, type CMSBuilderDocument } from "@/lib/cms/builder-document"

type Breakpoint = "desktop" | "tablet" | "mobile"
type PageType = CMSBuilderDocument["pages"][number]

type HistoryState = {
  past: CMSBuilderDocument[]
  present: CMSBuilderDocument
  future: CMSBuilderDocument[]
}

function placement(order = 0) {
  return {
    desktop: { order, columnStart: 1, columnSpan: 12, align: "stretch" as const, hidden: false },
    tablet: { order, columnStart: 1, columnSpan: 8, align: "stretch" as const, hidden: false },
    mobile: { order, columnStart: 1, columnSpan: 4, align: "stretch" as const, hidden: false },
  }
}

function slugify(value: string) {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
  return normalized ? `/${normalized}` : "/pagina"
}

function uniqueId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

function emptyPage(title: string, existing: PageType[]): PageType {
  let slug = slugify(title)
  let suffix = 2
  while (existing.some((page) => page.slug === slug)) {
    slug = `${slugify(title)}-${suffix++}`
  }
  return {
    id: uniqueId("page"),
    title,
    slug,
    language: "it",
    seo: { title: "", description: "", noindex: false },
    sections: [{
      id: uniqueId("section"),
      type: "content",
      variant: "default",
      label: "Contenuto principale",
      background: { color: "#FFFFFF", overlayOpacity: 0 },
      gridColumns: { desktop: 12, tablet: 8, mobile: 4 },
      elements: [
        { id: uniqueId("heading"), type: "heading", content: title, level: "h1", textAlign: "left", placement: placement(0), locked: false },
        { id: uniqueId("text"), type: "text", content: "Aggiungi qui i contenuti della pagina.", textAlign: "left", placement: placement(1), locked: false },
      ],
    }],
  }
}

function starterDocument(): CMSBuilderDocument {
  const document = createEmptyBuilderDocument("luxury")
  document.pages[0].sections = emptyPage("Home", []).sections
  document.pages[0].slug = "/"
  return document
}

export function CMSMultipageVisualBuilder() {
  const [history, setHistory] = useState<HistoryState>({ past: [], present: starterDocument(), future: [] })
  const [activePageId, setActivePageId] = useState("page-home")
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null)
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null)
  const [breakpoint, setBreakpoint] = useState<Breakpoint>("desktop")
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latestDocument = useRef(history.present)
  const dirtyRef = useRef(false)
  const editVersion = useRef(1)

  const document = history.present
  const page = document.pages.find((item) => item.id === activePageId) ?? document.pages[0]
  const selectedSection = page?.sections.find((item) => item.id === selectedSectionId) ?? page?.sections[0]
  const selectedElement: any = selectedSection?.elements.find((item) => item.id === selectedElementId) ?? null

  useEffect(() => { latestDocument.current = history.present }, [history.present])

  useEffect(() => {
    function flushPendingAutosave() {
      if (!dirtyRef.current) return
      if (autosaveTimer.current) {
        clearTimeout(autosaveTimer.current)
        autosaveTimer.current = null
      }

      try {
        const validated = CMSBuilderDocumentSchema.parse(latestDocument.current)
        void fetch("/api/cms/ai-project", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            template_id: validated.templateId,
            builder_document: validated,
            current_step: 3,
            project_version: editVersion.current,
          }),
          credentials: "same-origin",
          keepalive: true,
        }).catch(() => undefined)
      } catch {
        // The normal save flow reports validation errors while the editor is open.
      }
    }

    function handleVisibilityChange() {
      if (globalThis.document.visibilityState === "hidden") flushPendingAutosave()
    }

    window.addEventListener("pagehide", flushPendingAutosave)
    globalThis.document.addEventListener("visibilitychange", handleVisibilityChange)

    return () => {
      window.removeEventListener("pagehide", flushPendingAutosave)
      globalThis.document.removeEventListener("visibilitychange", handleVisibilityChange)
      flushPendingAutosave()
    }
  }, [])

  useEffect(() => {
    async function load() {
      try {
        const response = await fetch("/api/cms/ai-project", { cache: "no-store" })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || "Impossibile caricare il progetto")
        const loaded = data.project?.builder_document || starterDocument()
        const parsed = CMSBuilderDocumentSchema.parse(loaded)
        editVersion.current = Math.max(1, Number(data.project?.project_version) || 1)
        setHistory({ past: [], present: parsed, future: [] })
        setActivePageId(parsed.pages[0].id)
        setSelectedSectionId(parsed.pages[0].sections[0]?.id ?? null)
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Errore di caricamento")
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  async function persist(value: CMSBuilderDocument, silent = false) {
    const savedVersion = editVersion.current
    setSaving(true)
    try {
      const validated = CMSBuilderDocumentSchema.parse(value)
      const response = await fetch("/api/cms/ai-project", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          template_id: validated.templateId,
          builder_document: validated,
          current_step: 3,
          project_version: savedVersion,
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Salvataggio non riuscito")
      if (savedVersion === editVersion.current) {
        dirtyRef.current = false
        setDirty(false)
        setMessage(silent ? "Bozza salvata automaticamente" : "Progetto salvato")
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Errore di salvataggio")
    } finally {
      setSaving(false)
    }
  }

  function scheduleAutosave() {
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current)
    autosaveTimer.current = setTimeout(() => {
      autosaveTimer.current = null
      void persist(latestDocument.current, true)
    }, 2500)
  }

  function commit(mutator: (draft: CMSBuilderDocument) => void) {
    setHistory((current) => {
      const next = structuredClone(current.present)
      mutator(next)
      latestDocument.current = next
      return { past: [...current.past, current.present].slice(-40), present: next, future: [] }
    })
    editVersion.current += 1
    dirtyRef.current = true
    setDirty(true)
    scheduleAutosave()
  }

  function selectPage(pageId: string) {
    const nextPage = document.pages.find((item) => item.id === pageId)
    if (!nextPage) return
    setActivePageId(pageId)
    setSelectedSectionId(nextPage.sections[0]?.id ?? null)
    setSelectedElementId(null)
  }

  function createPage() {
    const next = emptyPage("Nuova pagina", document.pages)
    commit((draft) => {
      draft.pages.push(next)
      draft.navigation.push({ id: uniqueId("nav"), label: next.title, href: next.slug, order: draft.navigation.length })
    })
    setActivePageId(next.id)
    setSelectedSectionId(next.sections[0]?.id ?? null)
    setSelectedElementId(null)
  }

  function duplicatePage() {
    if (!page) return
    const copy = structuredClone(page)
    copy.id = uniqueId("page")
    copy.title = `${page.title} copia`
    copy.slug = emptyPage(copy.title, document.pages).slug
    copy.sections.forEach((section) => {
      section.id = uniqueId("section")
      section.elements.forEach((element) => { element.id = uniqueId(element.type) })
    })
    commit((draft) => {
      draft.pages.push(copy)
      draft.navigation.push({ id: uniqueId("nav"), label: copy.title, href: copy.slug, order: draft.navigation.length })
    })
    setActivePageId(copy.id)
    setSelectedSectionId(copy.sections[0]?.id ?? null)
    setSelectedElementId(null)
  }

  function deletePage() {
    if (!page || document.pages.length === 1) return
    if (!window.confirm(`Eliminare la pagina “${page.title}”?`)) return
    const fallback = document.pages.find((item) => item.id !== page.id)!
    commit((draft) => {
      draft.pages = draft.pages.filter((item) => item.id !== page.id)
      draft.navigation = draft.navigation
        .filter((item) => item.href !== page.slug)
        .map((item, index) => ({ ...item, order: index }))
    })
    setActivePageId(fallback.id)
    setSelectedSectionId(fallback.sections[0]?.id ?? null)
    setSelectedElementId(null)
  }

  function updatePage(patch: Partial<PageType>) {
    commit((draft) => {
      const target = draft.pages.find((item) => item.id === page.id)
      if (!target) return
      const oldSlug = target.slug
      Object.assign(target, patch)
      if (patch.slug && patch.slug !== oldSlug) {
        const nav = draft.navigation.find((item) => item.href === oldSlug)
        if (nav) nav.href = patch.slug
      }
    })
  }

  function toggleNavigation() {
    const nav = document.navigation.find((item) => item.href === page.slug)
    commit((draft) => {
      const index = draft.navigation.findIndex((item) => item.href === page.slug)
      if (index >= 0) {
        draft.navigation.splice(index, 1)
      } else {
        draft.navigation.push({ id: uniqueId("nav"), label: page.title, href: page.slug, order: draft.navigation.length })
      }
      draft.navigation.forEach((item, order) => { item.order = order })
    })
    setMessage(nav ? "Pagina rimossa dal menu" : "Pagina aggiunta al menu")
  }

  function moveNavigation(direction: -1 | 1) {
    commit((draft) => {
      const ordered = [...draft.navigation].sort((a, b) => a.order - b.order)
      const index = ordered.findIndex((item) => item.href === page.slug)
      const target = index + direction
      if (index < 0 || target < 0 || target >= ordered.length) return
      ;[ordered[index], ordered[target]] = [ordered[target], ordered[index]]
      ordered.forEach((item, order) => { item.order = order })
      draft.navigation = ordered
    })
  }

  function addSection() {
    const sectionId = uniqueId("section")
    commit((draft) => {
      const target = draft.pages.find((item) => item.id === page.id)
      target?.sections.push({
        id: sectionId, type: "custom", variant: "default", label: "Nuova sezione",
        background: { color: "#FFFFFF", overlayOpacity: 0 },
        gridColumns: { desktop: 12, tablet: 8, mobile: 4 }, elements: [],
      })
    })
    setSelectedSectionId(sectionId)
    setSelectedElementId(null)
  }

  function addElement(type: "heading" | "text" | "button" | "booking-widget") {
    if (!selectedSection) return
    const id = uniqueId(type)
    commit((draft) => {
      const targetPage = draft.pages.find((item) => item.id === page.id)
      const section = targetPage?.sections.find((item) => item.id === selectedSection.id)
      if (!section) return
      const order = section.elements.length
      if (type === "heading") section.elements.push({ id, type, content: "Nuovo titolo", level: "h2", textAlign: "left", placement: placement(order), locked: false })
      if (type === "text") section.elements.push({ id, type, content: "Nuovo testo", textAlign: "left", placement: placement(order), locked: false })
      if (type === "button") section.elements.push({ id, type, label: "Scopri di più", href: "#", variant: "primary", openInNewTab: false, placement: placement(order), locked: false })
      if (type === "booking-widget") section.elements.push({ id, type, label: "Prenota", mode: "button", placement: placement(order), locked: false })
    })
    setSelectedElementId(id)
  }

  function insertImage(selection: CMSMediaSelection) {
    if (!selectedSection) return
    const id = uniqueId("image")
    commit((draft) => {
      const targetPage = draft.pages.find((item) => item.id === page.id)
      const section = targetPage?.sections.find((item) => item.id === selectedSection.id)
      if (!section) return
      section.elements.push({
        id, type: "image", src: selection.publicUrl,
        alt: selection.altText || selection.originalName || "Immagine della struttura",
        fit: "cover", focalPoint: { x: 50, y: 50 }, placement: placement(section.elements.length), locked: false,
      })
    })
    setSelectedElementId(id)
  }

  function replaceImage(selection: CMSMediaSelection) {
    if (!selectedElement || selectedElement.type !== "image") return
    commit((draft) => {
      const targetPage = draft.pages.find((item) => item.id === page.id)
      const section = targetPage?.sections.find((item) => item.id === selectedSection?.id)
      const element: any = section?.elements.find((item) => item.id === selectedElement.id)
      if (!element) return
      element.src = selection.publicUrl
      element.alt = selection.altText || selection.originalName || element.alt
    })
  }

  function updateSelectedElement(patch: Record<string, unknown>) {
    if (!selectedElement || !selectedSection) return
    commit((draft) => {
      const targetPage = draft.pages.find((item) => item.id === page.id)
      const section = targetPage?.sections.find((item) => item.id === selectedSection.id)
      const element = section?.elements.find((item) => item.id === selectedElement.id)
      if (element) Object.assign(element, patch)
    })
  }

  function removeElement() {
    if (!selectedElement || !selectedSection) return
    commit((draft) => {
      const targetPage = draft.pages.find((item) => item.id === page.id)
      const section = targetPage?.sections.find((item) => item.id === selectedSection.id)
      if (section) section.elements = section.elements.filter((item) => item.id !== selectedElement.id)
    })
    setSelectedElementId(null)
  }

  const canvasWidth = useMemo(() => breakpoint === "desktop" ? "100%" : breakpoint === "tablet" ? "768px" : "390px", [breakpoint])
  const inNavigation = document.navigation.some((item) => item.href === page?.slug)

  if (loading) return <div className="flex min-h-[500px] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>

  return <div className="space-y-5">
    <AdminHeader
      title="Editor visuale multipagina"
      subtitle="Pagine, menu, SEO e contenuti nello stesso documento"
      actions={<Button variant="outline" asChild><Link href="/admin/cms/studio"><ArrowLeft className="mr-2 h-4 w-4" />Torna allo studio</Link></Button>}
    />

    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-background p-3">
      <div className="flex rounded-md border p-1">
        <Button size="sm" variant={breakpoint === "desktop" ? "secondary" : "ghost"} onClick={() => setBreakpoint("desktop")}><Monitor className="mr-2 h-4 w-4" />Desktop</Button>
        <Button size="sm" variant={breakpoint === "tablet" ? "secondary" : "ghost"} onClick={() => setBreakpoint("tablet")}><Tablet className="mr-2 h-4 w-4" />Tablet</Button>
        <Button size="sm" variant={breakpoint === "mobile" ? "secondary" : "ghost"} onClick={() => setBreakpoint("mobile")}><Smartphone className="mr-2 h-4 w-4" />Mobile</Button>
      </div>
      <div className="flex items-center gap-2">
        {message && <span className="text-sm text-muted-foreground">{message}</span>}
        <Badge variant={dirty ? "secondary" : "outline"}><Eye className="mr-1 h-3 w-3" />{dirty ? "Modifiche non salvate" : "Bozza salvata"}</Badge>
        <Button onClick={() => persist(document)} disabled={saving}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}Salva</Button>
      </div>
    </div>

    <div className="grid gap-4 xl:grid-cols-[270px_minmax(0,1fr)_320px]">
      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Pagine</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {document.pages.map((item) => <button key={item.id} type="button" onClick={() => selectPage(item.id)} className={`w-full rounded-md border p-3 text-left ${item.id === page.id ? "border-primary bg-primary/5" : "hover:bg-muted/50"}`}>
              <p className="font-medium">{item.title}</p><p className="truncate text-xs text-muted-foreground">{item.slug} · {item.language}</p>
            </button>)}
            <Button variant="outline" className="w-full" onClick={createPage}><Plus className="mr-2 h-4 w-4" />Nuova pagina</Button>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" size="sm" onClick={duplicatePage}><Copy className="mr-2 h-4 w-4" />Duplica</Button>
              <Button variant="destructive" size="sm" onClick={deletePage} disabled={document.pages.length === 1}><Trash2 className="mr-2 h-4 w-4" />Elimina</Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Blocchi</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <Button variant="outline" className="w-full justify-start" onClick={() => addElement("heading")}><Plus className="mr-2 h-4 w-4" />Titolo</Button>
            <Button variant="outline" className="w-full justify-start" onClick={() => addElement("text")}><Plus className="mr-2 h-4 w-4" />Testo</Button>
            <Button variant="outline" className="w-full justify-start" onClick={() => addElement("button")}><Plus className="mr-2 h-4 w-4" />Pulsante</Button>
            <Button variant="outline" className="w-full justify-start" onClick={() => addElement("booking-widget")}><Plus className="mr-2 h-4 w-4" />Booking widget</Button>
            <CMSMediaPickerDialog triggerLabel="Scegli immagine" onSelect={insertImage} />
            <Button className="w-full" onClick={addSection}><Plus className="mr-2 h-4 w-4" />Nuova sezione</Button>
          </CardContent>
        </Card>
      </div>

      <div className="overflow-x-auto rounded-xl border bg-muted/30 p-5">
        <div className="mx-auto min-h-[700px] overflow-hidden rounded-lg border bg-background shadow-sm transition-all" style={{ width: canvasWidth, maxWidth: "100%" }}>
          {page.sections.map((section) => <section key={section.id} onClick={() => { setSelectedSectionId(section.id); setSelectedElementId(null) }} className={`border-b p-6 ${selectedSectionId === section.id ? "ring-2 ring-inset ring-primary" : "hover:ring-1 hover:ring-inset hover:ring-primary/30"}`} style={{ backgroundColor: section.background.color || "#FFFFFF" }}>
            <div className="mb-4 text-xs font-medium text-muted-foreground">{section.label}</div>
            <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${section.gridColumns[breakpoint]}, minmax(0,1fr))` }}>
              {section.elements.filter((element) => !element.placement[breakpoint].hidden).sort((a, b) => a.placement[breakpoint].order - b.placement[breakpoint].order).map((element: any) => <div key={element.id} onClick={(event) => { event.stopPropagation(); setSelectedSectionId(section.id); setSelectedElementId(element.id) }} className={`rounded border border-dashed p-2 ${selectedElementId === element.id ? "border-primary bg-primary/5" : "border-transparent hover:border-primary/50"}`} style={{ gridColumn: `${element.placement[breakpoint].columnStart} / span ${Math.min(element.placement[breakpoint].columnSpan, section.gridColumns[breakpoint])}`, textAlign: element.textAlign || "left" }}>
                {element.type === "heading" && <div className={element.level === "h1" ? "text-4xl font-bold" : "text-2xl font-semibold"}>{element.content}</div>}
                {element.type === "text" && <p className="text-muted-foreground">{element.content}</p>}
                {element.type === "button" && <Button>{element.label}</Button>}
                {element.type === "booking-widget" && <div className="rounded-lg border bg-background p-4"><strong>{element.label}</strong><div className="mt-3 grid grid-cols-3 gap-2"><div className="h-9 rounded bg-muted" /><div className="h-9 rounded bg-muted" /><div className="h-9 rounded bg-primary" /></div></div>}
                {element.type === "image" && <img src={element.src} alt={element.alt} className="aspect-video w-full rounded object-cover" style={{ objectPosition: `${element.focalPoint.x}% ${element.focalPoint.y}%` }} />}
              </div>)}
              {!section.elements.length && <div className="col-span-full rounded border border-dashed p-8 text-center text-sm text-muted-foreground">Aggiungi un elemento</div>}
            </div>
          </section>)}
        </div>
      </div>

      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Pagina e SEO</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div><label className="text-xs text-muted-foreground">Titolo pagina</label><Input value={page.title} onChange={(event) => updatePage({ title: event.target.value })} /></div>
            <div><label className="text-xs text-muted-foreground">Slug</label><Input value={page.slug} disabled={page.slug === "/"} onChange={(event) => updatePage({ slug: event.target.value.startsWith("/") ? event.target.value : `/${event.target.value}` })} /></div>
            <div><label className="text-xs text-muted-foreground">Lingua</label><Input value={page.language} maxLength={10} onChange={(event) => updatePage({ language: event.target.value })} /></div>
            <div><label className="text-xs text-muted-foreground">Meta title</label><Input value={page.seo.title} maxLength={70} onChange={(event) => updatePage({ seo: { ...page.seo, title: event.target.value } })} /><p className="text-right text-xs text-muted-foreground">{page.seo.title.length}/70</p></div>
            <div><label className="text-xs text-muted-foreground">Meta description</label><Textarea value={page.seo.description} maxLength={180} onChange={(event) => updatePage({ seo: { ...page.seo, description: event.target.value } })} /><p className="text-right text-xs text-muted-foreground">{page.seo.description.length}/180</p></div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={page.seo.noindex} onChange={(event) => updatePage({ seo: { ...page.seo, noindex: event.target.checked } })} />Non indicizzare questa pagina</label>
            <div className="rounded-md border p-3">
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={inNavigation} onChange={toggleNavigation} />Mostra nel menu</label>
              {inNavigation && <div className="mt-3 flex gap-2"><Button variant="outline" size="sm" onClick={() => moveNavigation(-1)}><ArrowUp className="mr-2 h-4 w-4" />Su</Button><Button variant="outline" size="sm" onClick={() => moveNavigation(1)}><ArrowDown className="mr-2 h-4 w-4" />Giù</Button></div>}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3"><CardTitle className="text-base">Proprietà elemento</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {selectedSection && <div><label className="text-xs text-muted-foreground">Nome sezione</label><Input value={selectedSection.label} onChange={(event) => commit((draft) => { const target = draft.pages.find((item) => item.id === page.id)?.sections.find((item) => item.id === selectedSection.id); if (target) target.label = event.target.value })} /></div>}
            {selectedElement ? <>
              {(selectedElement.type === "heading" || selectedElement.type === "text") && <Textarea value={selectedElement.content} onChange={(event) => updateSelectedElement({ content: event.target.value })} />}
              {(selectedElement.type === "button" || selectedElement.type === "booking-widget") && <Input value={selectedElement.label} onChange={(event) => updateSelectedElement({ label: event.target.value })} />}
              {selectedElement.type === "button" && <Input value={selectedElement.href} onChange={(event) => updateSelectedElement({ href: event.target.value })} />}
              {selectedElement.type === "image" && <><Input value={selectedElement.alt} onChange={(event) => updateSelectedElement({ alt: event.target.value })} /><CMSMediaPickerDialog triggerLabel="Sostituisci dalla libreria" onSelect={replaceImage} /></>}
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={selectedElement.placement[breakpoint].hidden} onChange={(event) => updateSelectedElement({ placement: { ...selectedElement.placement, [breakpoint]: { ...selectedElement.placement[breakpoint], hidden: event.target.checked } } })} />Nascondi su {breakpoint}</label>
              <Button variant="destructive" className="w-full" onClick={removeElement}><Trash2 className="mr-2 h-4 w-4" />Elimina elemento</Button>
            </> : <p className="text-sm text-muted-foreground">Seleziona un elemento nel canvas.</p>}
          </CardContent>
        </Card>
      </div>
    </div>
  </div>
}
