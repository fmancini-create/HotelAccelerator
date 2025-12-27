"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Save, Eye, Plus, GripVertical, Trash2, Loader2, ChevronUp, ChevronDown, AlertCircle } from "lucide-react"
import Link from "next/link"
import { SECTION_TYPES, type SectionType, getSectionDefault, PageSchema } from "@/lib/cms/section-schemas"
import { AdminHeader } from "@/components/admin/admin-header"

interface ValidationErrors {
  formErrors: string[]
  fieldErrors: {
    slug?: string[]
    title?: string[]
    status?: string[]
    sections?: string[]
    seo_title?: string[]
    seo_description?: string[]
    seo_noindex?: string[]
  }
}

interface CMSPageState {
  slug: string
  title: string
  status: "draft" | "published" | "hidden"
  seo_title: string | null
  seo_description: string | null
  seo_noindex: boolean
  sections: Section[]
}

interface Section {
  id: string
  type: SectionType
  data: Record<string, unknown>
}

function normalizeSlug(value: string): string {
  return value.toLowerCase().trim().replace(/\s+/g, "-")
}

export default function CMSPageEditor({ params }: { params: { id: string } | Promise<{ id: string }> }) {
  const [pageId, setPageId] = useState<string | null>(null)
  const [page, setPage] = useState<CMSPageState | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)
  const [errors, setErrors] = useState<ValidationErrors | null>(null)

  useEffect(() => {
    async function resolveParams() {
      const resolved = params instanceof Promise ? await params : params
      setPageId(resolved.id)
    }
    resolveParams()
  }, [params])

  useEffect(() => {
    if (pageId) loadPage()
  }, [pageId])

  async function loadPage() {
    if (!pageId) return
    const response = await fetch(`/api/cms/pages/${pageId}`)
    const data = await response.json()

    if (data.page) {
      const { slug, title, status, seo_title, seo_description, seo_noindex, sections } = data.page
      setPage({ slug, title, status, seo_title, seo_description, seo_noindex, sections })
    }
    setIsLoading(false)
  }

  const isSaveDisabled =
    !page || isSaving || !hasChanges || !page.slug.trim() || !page.title.trim() || page.sections.length === 0

  async function handleSave(newStatus?: string) {
    if (!page || !pageId) return

    setErrors(null)

    const payload = {
      slug: normalizeSlug(page.slug),
      title: page.title,
      status: newStatus || page.status,
      seo_title: page.seo_title,
      seo_description: page.seo_description,
      seo_noindex: page.seo_noindex,
      sections: page.sections,
    }

    const result = PageSchema.safeParse(payload)
    if (!result.success) {
      setErrors(result.error.flatten())
      return
    }

    setIsSaving(true)

    const response = await fetch(`/api/cms/pages/${pageId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })

    const data = await response.json()

    if (!response.ok) {
      if (data.errors) {
        setErrors(data.errors)
      } else {
        setErrors({ formErrors: [data.error || "Errore nel salvataggio"], fieldErrors: {} })
      }
      setIsSaving(false)
      return
    }

    if (data.page) {
      const { slug, title, status, seo_title, seo_description, seo_noindex, sections } = data.page
      setPage({ slug, title, status, seo_title, seo_description, seo_noindex, sections })
      setHasChanges(false)
    }

    setIsSaving(false)
  }

  function updatePage(updates: Partial<CMSPageState>) {
    if (!page) return
    setPage({ ...page, ...updates })
    setHasChanges(true)
    if (errors) setErrors(null)
  }

  function addSection(type: SectionType) {
    if (!page) return
    const newSection: Section = {
      id: crypto.randomUUID(),
      type,
      data: getSectionDefault(type),
    }
    updatePage({ sections: [...page.sections, newSection] })
  }

  function updateSection(sectionId: string, data: Record<string, unknown>) {
    if (!page) return
    const newSections = page.sections.map((s) => (s.id === sectionId ? { ...s, data } : s))
    updatePage({ sections: newSections })
  }

  function removeSection(sectionId: string) {
    if (!page) return
    updatePage({ sections: page.sections.filter((s) => s.id !== sectionId) })
  }

  function moveSection(sectionId: string, direction: "up" | "down") {
    if (!page) return
    const index = page.sections.findIndex((s) => s.id === sectionId)
    if (index === -1) return
    const newIndex = direction === "up" ? index - 1 : index + 1
    if (newIndex < 0 || newIndex >= page.sections.length) return
    const newSections = [...page.sections]
    const [moved] = newSections.splice(index, 1)
    newSections.splice(newIndex, 0, moved)
    updatePage({ sections: newSections })
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!page) {
    return (
      <div className="text-center py-12">
        <h2 className="text-lg font-medium">Pagina non trovata</h2>
        <Link href="/admin/cms" className="text-primary">
          Torna alle pagine
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <AdminHeader
        title={page.title}
        subtitle={`/${page.slug}`}
        breadcrumbs={[{ label: "CMS", href: "/admin/cms" }, { label: page.title }]}
        actions={
          <div className="flex items-center gap-2">
            {page.status === "published" && (
              <Link href={`/p/${page.slug}`} target="_blank">
                <Button variant="outline">
                  <Eye className="h-4 w-4 mr-2" />
                  Anteprima
                </Button>
              </Link>
            )}
            <Button onClick={() => handleSave()} disabled={isSaveDisabled}>
              {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              <Save className="h-4 w-4 mr-2" />
              Salva
            </Button>
            {page.status === "draft" && (
              <Button onClick={() => handleSave("published")} disabled={isSaveDisabled}>
                Pubblica
              </Button>
            )}
          </div>
        }
      />

      {errors && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <ul className="list-disc list-inside space-y-1">
              {errors.formErrors.map((err, i) => (
                <li key={i}>{err}</li>
              ))}
              {errors.fieldErrors.slug?.map((err, i) => (
                <li key={`slug-${i}`}>Slug: {err}</li>
              ))}
              {errors.fieldErrors.title?.map((err, i) => (
                <li key={`title-${i}`}>Titolo: {err}</li>
              ))}
              {errors.fieldErrors.sections?.map((err, i) => (
                <li key={`sections-${i}`}>Sezioni: {err}</li>
              ))}
              {errors.fieldErrors.seo_title?.map((err, i) => (
                <li key={`seo-title-${i}`}>Meta Title: {err}</li>
              ))}
              {errors.fieldErrors.seo_description?.map((err, i) => (
                <li key={`seo-desc-${i}`}>Meta Description: {err}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Sezioni</CardTitle>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    Aggiungi Sezione
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  {Object.entries(SECTION_TYPES).map(([type, meta]) => (
                    <DropdownMenuItem key={type} onClick={() => addSection(type as SectionType)}>
                      <span className="mr-2">{meta.icon}</span>
                      {meta.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </CardHeader>
            <CardContent className="space-y-4">
              {page.sections.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <p>Nessuna sezione. Aggiungi la prima sezione.</p>
                  <p className="text-sm text-destructive mt-2">Almeno una sezione è richiesta per salvare.</p>
                </div>
              ) : (
                page.sections.map((section, index) => (
                  <SectionEditor
                    key={section.id}
                    section={section}
                    index={index}
                    total={page.sections.length}
                    onUpdate={(data) => updateSection(section.id, data)}
                    onRemove={() => removeSection(section.id)}
                    onMove={(dir) => moveSection(section.id, dir)}
                  />
                ))
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Impostazioni Pagina</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Titolo</Label>
                <Input
                  value={page.title}
                  onChange={(e) => updatePage({ title: e.target.value })}
                  className={errors?.fieldErrors.title ? "border-destructive" : ""}
                />
                {!page.title.trim() && <p className="text-xs text-destructive">Il titolo è obbligatorio</p>}
              </div>
              <div className="space-y-2">
                <Label>Slug</Label>
                <Input
                  value={page.slug}
                  onChange={(e) => updatePage({ slug: normalizeSlug(e.target.value) })}
                  className={errors?.fieldErrors.slug ? "border-destructive" : ""}
                />
                {!page.slug.trim() && <p className="text-xs text-destructive">Lo slug è obbligatorio</p>}
              </div>
              <div className="space-y-2">
                <Label>Stato</Label>
                <Select value={page.status} onValueChange={(v) => updatePage({ status: v as CMSPageState["status"] })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Bozza</SelectItem>
                    <SelectItem value="published">Pubblicata</SelectItem>
                    <SelectItem value="hidden">Nascosta</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>SEO</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Meta Title</Label>
                <Input
                  value={page.seo_title || ""}
                  onChange={(e) => updatePage({ seo_title: e.target.value || null })}
                  placeholder={page.title}
                />
              </div>
              <div className="space-y-2">
                <Label>Meta Description</Label>
                <Textarea
                  value={page.seo_description || ""}
                  onChange={(e) => updatePage({ seo_description: e.target.value || null })}
                  placeholder="Descrizione per i motori di ricerca..."
                  rows={3}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label>Nascondi dai motori di ricerca</Label>
                <Switch checked={page.seo_noindex} onCheckedChange={(v) => updatePage({ seo_noindex: v })} />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

// Component: Section Editor
function SectionEditor({
  section,
  index,
  total,
  onUpdate,
  onRemove,
  onMove,
}: {
  section: Section
  index: number
  total: number
  onUpdate: (data: Record<string, unknown>) => void
  onRemove: () => void
  onMove: (direction: "up" | "down") => void
}) {
  const meta = SECTION_TYPES[section.type]

  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-2 py-3 px-4">
        <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" />
        <span className="mr-2">{meta?.icon}</span>
        <span className="font-medium flex-1">{meta?.label || section.type}</span>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" disabled={index === 0} onClick={() => onMove("up")}>
            <ChevronUp className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" disabled={index === total - 1} onClick={() => onMove("down")}>
            <ChevronDown className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={onRemove}>
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <SectionDataEditor type={section.type} data={section.data} onChange={onUpdate} />
      </CardContent>
    </Card>
  )
}

// Component: Section Data Editor (dynamic based on type)
function SectionDataEditor({
  type,
  data,
  onChange,
}: {
  type: SectionType
  data: Record<string, unknown>
  onChange: (data: Record<string, unknown>) => void
}) {
  switch (type) {
    case "hero":
      return (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Titolo</Label>
            <Input
              value={(data.title as string) || ""}
              onChange={(e) => onChange({ ...data, title: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>Sottotitolo</Label>
            <Input
              value={(data.subtitle as string) || ""}
              onChange={(e) => onChange({ ...data, subtitle: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>Immagine di sfondo (URL)</Label>
            <Input
              value={(data.backgroundImage as string) || ""}
              onChange={(e) => onChange({ ...data, backgroundImage: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>Testo CTA</Label>
            <Input
              value={(data.ctaText as string) || ""}
              onChange={(e) => onChange({ ...data, ctaText: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>Link CTA</Label>
            <Input
              value={(data.ctaLink as string) || ""}
              onChange={(e) => onChange({ ...data, ctaLink: e.target.value })}
            />
          </div>
        </div>
      )

    case "text":
      return (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Titolo (opzionale)</Label>
            <Input
              value={(data.title as string) || ""}
              onChange={(e) => onChange({ ...data, title: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>Contenuto</Label>
            <Textarea
              value={(data.content as string) || ""}
              onChange={(e) => onChange({ ...data, content: e.target.value })}
              rows={6}
            />
          </div>
        </div>
      )

    case "image":
      return (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>URL Immagine</Label>
            <Input value={(data.src as string) || ""} onChange={(e) => onChange({ ...data, src: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Alt Text</Label>
            <Input value={(data.alt as string) || ""} onChange={(e) => onChange({ ...data, alt: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Didascalia</Label>
            <Input
              value={(data.caption as string) || ""}
              onChange={(e) => onChange({ ...data, caption: e.target.value })}
            />
          </div>
        </div>
      )

    case "gallery":
      return (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Titolo (opzionale)</Label>
            <Input
              value={(data.title as string) || ""}
              onChange={(e) => onChange({ ...data, title: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>Immagini (una per riga: url|alt)</Label>
            <Textarea
              value={((data.images as { src: string; alt: string }[]) || []).map((i) => `${i.src}|${i.alt}`).join("\n")}
              onChange={(e) => {
                const images = e.target.value
                  .split("\n")
                  .filter((line) => line.trim())
                  .map((line) => {
                    const [src, alt] = line.split("|")
                    return { src: src?.trim() || "", alt: alt?.trim() || "" }
                  })
                onChange({ ...data, images })
              }}
              rows={6}
              placeholder="https://example.com/image1.jpg|Descrizione 1&#10;https://example.com/image2.jpg|Descrizione 2"
            />
          </div>
        </div>
      )

    case "cta":
      return (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Titolo</Label>
            <Input
              value={(data.title as string) || ""}
              onChange={(e) => onChange({ ...data, title: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>Descrizione</Label>
            <Textarea
              value={(data.description as string) || ""}
              onChange={(e) => onChange({ ...data, description: e.target.value })}
              rows={3}
            />
          </div>
          <div className="space-y-2">
            <Label>Testo Bottone</Label>
            <Input
              value={(data.buttonText as string) || ""}
              onChange={(e) => onChange({ ...data, buttonText: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>Link Bottone</Label>
            <Input
              value={(data.buttonLink as string) || ""}
              onChange={(e) => onChange({ ...data, buttonLink: e.target.value })}
            />
          </div>
        </div>
      )

    case "contact_form":
      return (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Titolo</Label>
            <Input
              value={(data.title as string) || ""}
              onChange={(e) => onChange({ ...data, title: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>Email destinazione</Label>
            <Input
              value={(data.email as string) || ""}
              onChange={(e) => onChange({ ...data, email: e.target.value })}
            />
          </div>
        </div>
      )

    case "map":
      return (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Latitudine</Label>
            <Input
              type="number"
              step="any"
              value={(data.latitude as number) || 0}
              onChange={(e) => onChange({ ...data, latitude: Number.parseFloat(e.target.value) || 0 })}
            />
          </div>
          <div className="space-y-2">
            <Label>Longitudine</Label>
            <Input
              type="number"
              step="any"
              value={(data.longitude as number) || 0}
              onChange={(e) => onChange({ ...data, longitude: Number.parseFloat(e.target.value) || 0 })}
            />
          </div>
          <div className="space-y-2">
            <Label>Indirizzo</Label>
            <Input
              value={(data.address as string) || ""}
              onChange={(e) => onChange({ ...data, address: e.target.value })}
            />
          </div>
        </div>
      )

    case "faq":
      return (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Titolo</Label>
            <Input
              value={(data.title as string) || ""}
              onChange={(e) => onChange({ ...data, title: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>FAQ (formato: domanda|risposta, una per riga)</Label>
            <Textarea
              value={((data.items as { question: string; answer: string }[]) || [])
                .map((i) => `${i.question}|${i.answer}`)
                .join("\n")}
              onChange={(e) => {
                const items = e.target.value
                  .split("\n")
                  .filter((line) => line.trim())
                  .map((line) => {
                    const [question, answer] = line.split("|")
                    return { question: question?.trim() || "", answer: answer?.trim() || "" }
                  })
                onChange({ ...data, items })
              }}
              rows={6}
              placeholder="Qual è la domanda?|Questa è la risposta&#10;Altra domanda?|Altra risposta"
            />
          </div>
        </div>
      )

    default:
      return (
        <div className="text-sm text-muted-foreground">
          Editor non disponibile per questo tipo di sezione. Dati raw:
          <pre className="mt-2 p-2 bg-muted rounded text-xs overflow-auto">{JSON.stringify(data, null, 2)}</pre>
        </div>
      )
  }
}
