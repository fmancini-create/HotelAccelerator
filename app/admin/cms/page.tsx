"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Plus, MoreVertical, Pencil, Trash2, Eye, Search, FileText, Loader2, LayoutTemplate, Globe } from "lucide-react"
import Link from "next/link"
import { Suspense } from "react"
import { AdminHeader } from "@/components/admin/admin-header"

interface CMSPage {
  id: string
  slug: string
  title: string
  status: "draft" | "published" | "hidden"
  page_type: string
  language: string
  template_id: string | null
  created_at: string
  updated_at: string
  published_at: string | null
}

interface CMSTemplate {
  id: string
  name: string
  slug: string
  description: string | null
  category: string
  is_system: boolean
}

const PAGE_TYPES = {
  home: { label: "Homepage", icon: "🏠" },
  room: { label: "Camera", icon: "🛏️" },
  service: { label: "Servizio", icon: "🛎️" },
  location: { label: "Località", icon: "📍" },
  contact: { label: "Contatti", icon: "📧" },
  gallery: { label: "Galleria", icon: "🖼️" },
  custom: { label: "Personalizzata", icon: "✨" },
}

const LANGUAGES = [
  { code: "it", label: "Italiano", flag: "🇮🇹" },
  { code: "en", label: "English", flag: "🇬🇧" },
  { code: "de", label: "Deutsch", flag: "🇩🇪" },
  { code: "fr", label: "Français", flag: "🇫🇷" },
]

export default function CMSPagesPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <CMSPagesContent />
    </Suspense>
  )
}

function CMSPagesContent() {
  const [pages, setPages] = useState<CMSPage[]>([])
  const [templates, setTemplates] = useState<CMSTemplate[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [propertyId, setPropertyId] = useState<string | null>(null)
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [selectedPage, setSelectedPage] = useState<CMSPage | null>(null)
  const [newPageTitle, setNewPageTitle] = useState("")
  const [newPageSlug, setNewPageSlug] = useState("")
  const [newPageType, setNewPageType] = useState("custom")
  const [newPageLanguage, setNewPageLanguage] = useState("it")
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  useEffect(() => {
    loadPropertyAndPages()
  }, [])

  async function loadPropertyAndPages() {
    const supabase = createClient()
    if (!supabase) return

    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return

    // Carica admin user per ottenere property_id
    const { data: adminUser } = await supabase
      .from("admin_users")
      .select("property_id, role")
      .eq("id", user.id)
      .single()

    if (!adminUser?.property_id) return
    setPropertyId(adminUser.property_id)

    // Carica templates disponibili
    const { data: templatesData } = await supabase
      .from("cms_templates")
      .select("id, name, slug, description, category, is_system")
      .eq("is_active", true)
      .or(`property_id.is.null,property_id.eq.${adminUser.property_id}`)
      .order("is_system", { ascending: false })

    if (templatesData) {
      setTemplates(templatesData)
      // Imposta template default (Villa I Barronci)
      const defaultTemplate = templatesData.find((t) => t.slug === "villa-i-barronci")
      if (defaultTemplate) {
        setSelectedTemplateId(defaultTemplate.id)
      }
    }

    // Carica pagine
    const response = await fetch(`/api/cms/pages?property_id=${adminUser.property_id}`)
    const data = await response.json()

    if (data.pages) {
      setPages(data.pages)
    }
    setIsLoading(false)
  }

  async function handleCreatePage() {
    if (!propertyId || !newPageTitle.trim()) return

    setIsSaving(true)

    const slug =
      newPageSlug.trim() ||
      newPageTitle
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9-]/g, "")

    const response = await fetch("/api/cms/pages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        property_id: propertyId,
        title: newPageTitle.trim(),
        slug,
        status: "draft",
        page_type: newPageType,
        language: newPageLanguage,
        template_id: selectedTemplateId,
        sections: [],
      }),
    })

    const data = await response.json()

    if (data.page) {
      setPages((prev) => [data.page, ...prev])
      setIsCreateDialogOpen(false)
      setNewPageTitle("")
      setNewPageSlug("")
      setNewPageType("custom")
      setNewPageLanguage("it")
    } else {
      alert(data.error || "Errore nella creazione")
    }

    setIsSaving(false)
  }

  async function handleDeletePage() {
    if (!selectedPage) return

    setIsSaving(true)

    const response = await fetch(`/api/cms/pages/${selectedPage.id}`, {
      method: "DELETE",
    })

    if (response.ok) {
      setPages((prev) => prev.filter((p) => p.id !== selectedPage.id))
      setIsDeleteDialogOpen(false)
      setSelectedPage(null)
    } else {
      const data = await response.json()
      alert(data.error || "Errore nell'eliminazione")
    }

    setIsSaving(false)
  }

  const filteredPages = pages.filter(
    (page) =>
      page.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      page.slug.toLowerCase().includes(searchQuery.toLowerCase()),
  )

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "published":
        return <Badge className="bg-green-500/10 text-green-600 border-green-500/20">Pubblicata</Badge>
      case "draft":
        return <Badge variant="secondary">Bozza</Badge>
      case "hidden":
        return <Badge variant="outline">Nascosta</Badge>
      default:
        return null
    }
  }

  const getPageTypeInfo = (pageType: string) => {
    return PAGE_TYPES[pageType as keyof typeof PAGE_TYPES] || PAGE_TYPES.custom
  }

  const getLanguageInfo = (langCode: string) => {
    return LANGUAGES.find((l) => l.code === langCode) || LANGUAGES[0]
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <AdminHeader
        title="Pagine CMS"
        subtitle="Gestisci le pagine del tuo sito"
        breadcrumbs={[{ label: "CMS", href: "/admin/cms" }]}
        actions={
          <Button onClick={() => setIsCreateDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Nuova Pagina
          </Button>
        }
      />

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Cerca pagine..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {filteredPages.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <FileText className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">Nessuna pagina</h3>
            <p className="text-muted-foreground text-center mb-4">
              {searchQuery ? "Nessuna pagina corrisponde alla ricerca" : "Crea la tua prima pagina CMS"}
            </p>
            {!searchQuery && (
              <Button onClick={() => setIsCreateDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Nuova Pagina
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {filteredPages.map((page) => {
            const pageTypeInfo = getPageTypeInfo(page.page_type || "custom")
            const langInfo = getLanguageInfo(page.language || "it")

            return (
              <Card key={page.id}>
                <CardContent className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-4">
                    <div className="p-2 bg-muted rounded-lg text-lg">{pageTypeInfo.icon}</div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-medium">{page.title}</h3>
                        {getStatusBadge(page.status)}
                        <span className="text-sm" title={langInfo.label}>
                          {langInfo.flag}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span>/{page.slug}</span>
                        <span className="text-xs px-1.5 py-0.5 bg-muted rounded">{pageTypeInfo.label}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground hidden md:block">
                      {new Date(page.updated_at).toLocaleDateString("it-IT")}
                    </span>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link href={`/admin/cms/${page.id}`}>
                            <Pencil className="h-4 w-4 mr-2" />
                            Modifica
                          </Link>
                        </DropdownMenuItem>
                        {page.status === "published" && (
                          <DropdownMenuItem asChild>
                            <Link href={`/${page.slug}`} target="_blank">
                              <Eye className="h-4 w-4 mr-2" />
                              Visualizza
                            </Link>
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => {
                            setSelectedPage(page)
                            setIsDeleteDialogOpen(true)
                          }}
                        >
                          <Trash2 className="h-4 w-4 mr-2" />
                          Elimina
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Nuova Pagina</DialogTitle>
            <DialogDescription>Crea una nuova pagina per il tuo sito</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {/* Template Selection */}
            {templates.length > 0 && (
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <LayoutTemplate className="h-4 w-4" />
                  Template
                </Label>
                <Select value={selectedTemplateId || ""} onValueChange={setSelectedTemplateId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleziona un template" />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map((template) => (
                      <SelectItem key={template.id} value={template.id}>
                        <div className="flex items-center gap-2">
                          <span>{template.name}</span>
                          {template.is_system && (
                            <Badge variant="secondary" className="text-xs">
                              Sistema
                            </Badge>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">Il template definisce lo stile e i blocchi predefiniti</p>
              </div>
            )}

            {/* Page Type */}
            <div className="space-y-2">
              <Label>Tipo Pagina</Label>
              <Select value={newPageType} onValueChange={setNewPageType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PAGE_TYPES).map(([value, { label, icon }]) => (
                    <SelectItem key={value} value={value}>
                      <span className="flex items-center gap-2">
                        <span>{icon}</span>
                        <span>{label}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Language */}
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Globe className="h-4 w-4" />
                Lingua
              </Label>
              <Select value={newPageLanguage} onValueChange={setNewPageLanguage}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LANGUAGES.map(({ code, label, flag }) => (
                    <SelectItem key={code} value={code}>
                      <span className="flex items-center gap-2">
                        <span>{flag}</span>
                        <span>{label}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Title */}
            <div className="space-y-2">
              <Label htmlFor="title">Titolo</Label>
              <Input
                id="title"
                placeholder="es. Chi Siamo"
                value={newPageTitle}
                onChange={(e) => setNewPageTitle(e.target.value)}
              />
            </div>

            {/* Slug */}
            <div className="space-y-2">
              <Label htmlFor="slug">Slug (URL)</Label>
              <Input
                id="slug"
                placeholder="es. chi-siamo"
                value={newPageSlug}
                onChange={(e) => setNewPageSlug(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                La pagina sarà accessibile su /
                {newPageSlug ||
                  newPageTitle
                    .toLowerCase()
                    .replace(/\s+/g, "-")
                    .replace(/[^a-z0-9-]/g, "") ||
                  "slug"}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
              Annulla
            </Button>
            <Button onClick={handleCreatePage} disabled={isSaving || !newPageTitle.trim()}>
              {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Crea Pagina
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Conferma Eliminazione */}
      <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Elimina Pagina</DialogTitle>
            <DialogDescription>
              Sei sicuro di voler eliminare &quot;{selectedPage?.title}&quot;? Questa azione non può essere annullata.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>
              Annulla
            </Button>
            <Button variant="destructive" onClick={handleDeletePage} disabled={isSaving}>
              {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Elimina
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
