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
import { Plus, MoreVertical, Pencil, Trash2, Eye, Search, FileText, Loader2 } from "lucide-react"
import Link from "next/link"
import { Suspense } from "react"
import { AdminHeader } from "@/components/admin/admin-header"

interface CMSPage {
  id: string
  slug: string
  title: string
  status: "draft" | "published" | "hidden"
  created_at: string
  updated_at: string
  published_at: string | null
}

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
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [propertyId, setPropertyId] = useState<string | null>(null)
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [selectedPage, setSelectedPage] = useState<CMSPage | null>(null)
  const [newPageTitle, setNewPageTitle] = useState("")
  const [newPageSlug, setNewPageSlug] = useState("")
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
        sections: [],
      }),
    })

    const data = await response.json()

    if (data.page) {
      setPages((prev) => [data.page, ...prev])
      setIsCreateDialogOpen(false)
      setNewPageTitle("")
      setNewPageSlug("")
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
        subtitle="Gestisci le pagine libere del tuo sito"
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
          {filteredPages.map((page) => (
            <Card key={page.id}>
              <CardContent className="flex items-center justify-between p-4">
                <div className="flex items-center gap-4">
                  <div className="p-2 bg-muted rounded-lg">
                    <FileText className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium">{page.title}</h3>
                      {getStatusBadge(page.status)}
                    </div>
                    <p className="text-sm text-muted-foreground">/{page.slug}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground hidden md:block">
                    Modificata: {new Date(page.updated_at).toLocaleDateString("it-IT")}
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
                          <Link href={`/p/${page.slug}`} target="_blank">
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
          ))}
        </div>
      )}

      {/* Dialog: Crea Pagina */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuova Pagina</DialogTitle>
            <DialogDescription>Crea una nuova pagina per il tuo sito</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="title">Titolo</Label>
              <Input
                id="title"
                placeholder="es. Chi Siamo"
                value={newPageTitle}
                onChange={(e) => setNewPageTitle(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="slug">Slug (opzionale)</Label>
              <Input
                id="slug"
                placeholder="es. chi-siamo"
                value={newPageSlug}
                onChange={(e) => setNewPageSlug(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">Se lasciato vuoto, verrà generato dal titolo</p>
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
