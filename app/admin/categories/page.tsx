"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Plus, Pencil, Trash2, FolderPlus } from "lucide-react"
import { getCurrentUser, type AdminUser } from "@/lib/admin-users"
import { getCategories, addCategory, updateCategory, deleteCategory, SITE_PAGES, type Category } from "@/lib/categories"
import { AdminHeader } from "@/components/admin/admin-header"
import { logout } from "@/lib/auth" // Import logout function

export default function CategoriesPage() {
  const router = useRouter()
  const [user, setUser] = useState<AdminUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [categories, setCategories] = useState<Category[]>([])

  // Dialog states
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null)

  // Form states
  const [newLabel, setNewLabel] = useState("")
  const [newValue, setNewValue] = useState("")
  const [newPath, setNewPath] = useState("")
  const [selectedPages, setSelectedPages] = useState<string[]>([])

  useEffect(() => {
    const currentUser = getCurrentUser()
    if (!currentUser) {
      router.push("/admin")
      return
    }
    setUser(currentUser)
    setCategories(getCategories())
    setIsLoading(false)
  }, [router])

  const handleLogout = () => {
    logout()
    router.push("/admin")
  }

  const resetForm = () => {
    setNewLabel("")
    setNewValue("")
    setNewPath("")
    setSelectedPages([])
  }

  const handleAddCategory = () => {
    if (!newLabel || !newValue) return

    const path = newPath || `/images/${newValue}`
    const updated = addCategory({
      value: newValue,
      label: newLabel,
      path,
      pages: selectedPages,
    })
    setCategories(updated)
    setIsAddDialogOpen(false)
    resetForm()
  }

  const handleEditCategory = () => {
    if (!selectedCategory || !newLabel) return

    const updated = updateCategory(selectedCategory.id, {
      label: newLabel,
      path: newPath || selectedCategory.path,
      pages: selectedPages,
    })
    setCategories(updated)
    setIsEditDialogOpen(false)
    setSelectedCategory(null)
    resetForm()
  }

  const handleDeleteCategory = () => {
    if (!selectedCategory) return

    const updated = deleteCategory(selectedCategory.id)
    setCategories(updated)
    setIsDeleteDialogOpen(false)
    setSelectedCategory(null)
  }

  const openEditDialog = (category: Category) => {
    setSelectedCategory(category)
    setNewLabel(category.label)
    setNewValue(category.value)
    setNewPath(category.path)
    setSelectedPages(category.pages)
    setIsEditDialogOpen(true)
  }

  const openDeleteDialog = (category: Category) => {
    setSelectedCategory(category)
    setIsDeleteDialogOpen(true)
  }

  const togglePage = (pageValue: string) => {
    setSelectedPages((prev) => (prev.includes(pageValue) ? prev.filter((p) => p !== pageValue) : [...prev, pageValue]))
  }

  const generateSlug = (label: string) => {
    return label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f8f5f0]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#8a7355]"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#f8f7f4]">
      <div className="container mx-auto px-4 py-8">
        <AdminHeader
          title="Categorie"
          subtitle="Gestisci le categorie delle foto"
          breadcrumbs={[{ label: "Categorie", href: "/admin/categories" }]}
          actions={
            <Button onClick={() => setIsAddDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Nuova Categoria
            </Button>
          }
        />

        {/* Main Content */}
        <main>
          {/* Actions */}
          <div className="flex justify-between items-center mb-6">
            <p className="text-[#6b6b6b]">{categories.length} categorie configurate</p>
          </div>

          {/* Categories Table */}
          <div className="bg-white rounded-lg border border-[#e5e0d8] overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[200px]">Nome</TableHead>
                  <TableHead className="w-[150px]">Slug</TableHead>
                  <TableHead className="w-[250px]">Path</TableHead>
                  <TableHead>Pagine</TableHead>
                  <TableHead className="w-[100px] text-right">Azioni</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {categories.map((category) => (
                  <TableRow key={category.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <FolderPlus className="h-4 w-4 text-[#8a7355]" />
                        {category.label}
                        {category.isCustom && (
                          <span className="text-xs bg-[#8a7355]/10 text-[#8a7355] px-2 py-0.5 rounded">Custom</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-[#6b6b6b] font-mono text-sm">{category.value}</TableCell>
                    <TableCell className="text-[#6b6b6b] font-mono text-sm">{category.path}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {category.pages.map((page) => (
                          <span key={page} className="text-xs bg-[#f8f5f0] text-[#6b6b6b] px-2 py-0.5 rounded">
                            {SITE_PAGES.find((p) => p.value === page)?.label || page}
                          </span>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="sm" onClick={() => openEditDialog(category)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        {category.isCustom && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openDeleteDialog(category)}
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Info Box */}
          <div className="mt-6 p-4 bg-[#8a7355]/10 rounded-lg">
            <h3 className="font-medium text-[#2c2c2c] mb-2">Come funziona</h3>
            <ul className="text-sm text-[#6b6b6b] space-y-1">
              <li>- Le categorie definiscono come le foto sono organizzate nel sito</li>
              <li>- Il "Path" indica la cartella dove vengono salvate le foto</li>
              <li>- Le "Pagine" determinano in quali sezioni del sito verranno mostrate le foto</li>
              <li>- Le categorie predefinite non possono essere eliminate, ma puoi modificare le pagine associate</li>
            </ul>
          </div>
        </main>

        {/* Add Category Dialog */}
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Nuova Categoria</DialogTitle>
              <DialogDescription>Crea una nuova categoria per organizzare le foto</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Nome categoria</Label>
                <Input
                  placeholder="Es: Spa & Wellness"
                  value={newLabel}
                  onChange={(e) => {
                    setNewLabel(e.target.value)
                    setNewValue(generateSlug(e.target.value))
                    setNewPath(`/images/${generateSlug(e.target.value)}`)
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label>Slug (identificativo)</Label>
                <Input
                  placeholder="es: spa-wellness"
                  value={newValue}
                  onChange={(e) => {
                    setNewValue(e.target.value)
                    setNewPath(`/images/${e.target.value}`)
                  }}
                  className="font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label>Path cartella</Label>
                <Input
                  placeholder="/images/spa-wellness"
                  value={newPath}
                  onChange={(e) => setNewPath(e.target.value)}
                  className="font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label>Mostra nelle pagine</Label>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {SITE_PAGES.map((page) => (
                    <div key={page.value} className="flex items-center space-x-2">
                      <Checkbox
                        id={`add-${page.value}`}
                        checked={selectedPages.includes(page.value)}
                        onCheckedChange={() => togglePage(page.value)}
                      />
                      <label htmlFor={`add-${page.value}`} className="text-sm cursor-pointer">
                        {page.label}
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setIsAddDialogOpen(false)
                  resetForm()
                }}
              >
                Annulla
              </Button>
              <Button
                onClick={handleAddCategory}
                disabled={!newLabel || !newValue}
                className="bg-[#8a7355] hover:bg-[#6b5a43]"
              >
                Crea Categoria
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Category Dialog */}
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Modifica Categoria</DialogTitle>
              <DialogDescription>
                Modifica le impostazioni della categoria "{selectedCategory?.label}"
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Nome categoria</Label>
                <Input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Slug (identificativo)</Label>
                <Input value={newValue} disabled={!selectedCategory?.isCustom} className="font-mono bg-gray-50" />
                {!selectedCategory?.isCustom && (
                  <p className="text-xs text-[#6b6b6b]">
                    Lo slug delle categorie predefinite non può essere modificato
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Path cartella</Label>
                <Input value={newPath} onChange={(e) => setNewPath(e.target.value)} className="font-mono" />
              </div>
              <div className="space-y-2">
                <Label>Mostra nelle pagine</Label>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {SITE_PAGES.map((page) => (
                    <div key={page.value} className="flex items-center space-x-2">
                      <Checkbox
                        id={`edit-${page.value}`}
                        checked={selectedPages.includes(page.value)}
                        onCheckedChange={() => togglePage(page.value)}
                      />
                      <label htmlFor={`edit-${page.value}`} className="text-sm cursor-pointer">
                        {page.label}
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setIsEditDialogOpen(false)
                  resetForm()
                }}
              >
                Annulla
              </Button>
              <Button onClick={handleEditCategory} disabled={!newLabel} className="bg-[#8a7355] hover:bg-[#6b5a43]">
                Salva Modifiche
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Elimina Categoria</DialogTitle>
              <DialogDescription>
                Sei sicuro di voler eliminare la categoria "{selectedCategory?.label}"? Le foto associate non verranno
                eliminate, ma dovranno essere riassegnate.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDeleteDialogOpen(false)}>
                Annulla
              </Button>
              <Button onClick={handleDeleteCategory} variant="destructive">
                Elimina
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}
