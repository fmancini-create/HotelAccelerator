"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { ImageIcon, Upload, Trash2, Tag } from "lucide-react"
import { useAdminAuth } from "@/lib/admin-hooks"
import { createBrowserClient } from "@/lib/supabase-browser"
import { AdminHeader } from "@/components/admin/admin-header"

interface Photo {
  id: string
  url: string
  alt: string
  is_published: boolean
  created_at: string
}

interface Category {
  id: string
  name: string
  slug: string
}

interface PhotoWithCategories extends Photo {
  categories?: Category[]
}

export default function AdminPhotosPage() {
  const router = useRouter()
  const { adminUser, isLoading: authLoading } = useAdminAuth()
  const [photos, setPhotos] = useState<PhotoWithCategories[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedPhoto, setSelectedPhoto] = useState<PhotoWithCategories | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])
  const [isSavingCategories, setIsSavingCategories] = useState(false)

  useEffect(() => {
    if (!authLoading && adminUser) {
      loadPhotos()
      loadCategories()
    }
  }, [authLoading, adminUser])

  const loadCategories = async () => {
    try {
      const supabase = createBrowserClient()
      const { data, error } = await supabase.from("categories").select("id, name, slug").order("name")

      if (error) throw error
      setCategories(data || [])
    } catch (error: any) {
      console.error("[v0] Error loading categories:", error)
    }
  }

  const loadPhotos = async () => {
    try {
      console.log("[v0] Loading photos from database...")
      const supabase = createBrowserClient()

      const { data, error } = await supabase
        .from("photos")
        .select("id, url, alt, is_published, created_at")
        .order("created_at", { ascending: false })

      if (error) {
        console.error("[v0] Error loading photos:", error.message)
        throw error
      }

      const photosWithCategories = (data || []).map((photo: any) => ({
        ...photo,
        categories: [],
      }))

      setPhotos(photosWithCategories)
      console.log("[v0] Loaded", photosWithCategories.length, "photos from database")
    } catch (error: any) {
      console.error("[v0] Error loading photos:", error)
      alert(`Errore caricamento foto: ${error.message}`)
    } finally {
      setIsLoading(false)
    }
  }

  const handlePhotoClick = (photo: PhotoWithCategories) => {
    setSelectedPhoto(photo)
    setSelectedCategories(photo.categories?.map((c) => c.id) || [])
  }

  const handleSaveCategories = async () => {
    if (!selectedPhoto) return

    setIsSavingCategories(true)
    try {
      const response = await fetch("/api/admin/assign-categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          photo_id: selectedPhoto.id,
          category_ids: selectedCategories,
        }),
      })

      if (!response.ok) throw new Error("Failed to save categories")

      alert("Categorie aggiornate con successo!")
      await loadPhotos()
      setSelectedPhoto(null)
    } catch (error: any) {
      alert(`Errore: ${error.message}`)
    } finally {
      setIsSavingCategories(false)
    }
  }

  const toggleCategory = (categoryId: string) => {
    setSelectedCategories((prev) =>
      prev.includes(categoryId) ? prev.filter((id) => id !== categoryId) : [...prev, categoryId],
    )
  }

  const handleDeletePhoto = async () => {
    if (!selectedPhoto) return
    if (!confirm(`Vuoi eliminare definitivamente questa foto?`)) return

    setIsDeleting(true)
    try {
      const supabase = createBrowserClient()
      const { error } = await supabase.from("photos").delete().eq("id", selectedPhoto.id)

      if (error) throw error

      alert("Foto eliminata con successo!")
      setSelectedPhoto(null)
      await loadPhotos()
    } catch (error: any) {
      alert(`Errore: ${error.message}`)
    } finally {
      setIsDeleting(false)
    }
  }

  if (authLoading || isLoading || !adminUser) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-600" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#f8f7f4]">
      <AdminHeader
        title="Gestione Foto"
        subtitle="Carica, elimina e organizza le foto"
        actions={
          <Button className="bg-[#8b7355] hover:bg-[#6d5a43] text-white">
            <Upload className="w-4 h-4 mr-2" />
            Carica Foto
          </Button>
        }
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div className="text-sm text-gray-600">
            {photos.length} foto totali ({photos.filter((p) => p.is_published).length} pubblicate)
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {photos.map((photo, index) => (
            <Card
              key={photo.id}
              onClick={() => handlePhotoClick(photo)}
              className="overflow-hidden hover:shadow-lg transition-shadow cursor-pointer"
            >
              <div className="aspect-[4/3] relative bg-gray-100">
                <img
                  src={photo.url || "/placeholder.svg"}
                  alt={photo.alt || `Photo ${index + 1}`}
                  className="w-full h-full object-cover"
                />
                {photo.is_published && (
                  <div className="absolute top-2 right-2 bg-green-500 text-white px-2 py-1 rounded text-xs font-bold">
                    PUBBLICA
                  </div>
                )}
                {photo.categories && photo.categories.length > 0 && (
                  <div className="absolute top-2 left-2 bg-amber-600 text-white px-2 py-1 rounded text-xs font-bold flex items-center gap-1">
                    <Tag className="h-3 w-3" />
                    {photo.categories.length}
                  </div>
                )}
              </div>
              <div className="p-4 bg-white">
                <p className="text-xs text-gray-600 truncate">{photo.alt || "Senza descrizione"}</p>
                {photo.categories && photo.categories.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {photo.categories.slice(0, 2).map((cat) => (
                      <span key={cat.id} className="text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded">
                        {cat.name}
                      </span>
                    ))}
                    {photo.categories.length > 2 && (
                      <span className="text-xs text-gray-500">+{photo.categories.length - 2}</span>
                    )}
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>

        {photos.length === 0 && (
          <div className="text-center py-12">
            <ImageIcon className="h-16 w-16 mx-auto text-gray-400 mb-4" />
            <p className="text-gray-600 mb-4">Nessuna foto trovata</p>
            <Button onClick={() => router.push("/admin/gallery")} variant="default">
              Carica Prima Foto
            </Button>
          </div>
        )}
      </div>

      {selectedPhoto && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => setSelectedPhoto(null)}
        >
          <Card className="max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h2 className="text-xl font-semibold mb-1">Dettagli Foto</h2>
                  <p className="text-sm text-gray-600">{selectedPhoto.alt || "Senza descrizione"}</p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setSelectedPhoto(null)}>
                  ✕
                </Button>
              </div>

              <div className="aspect-[4/3] relative bg-gray-100 rounded-lg overflow-hidden mb-4">
                <img
                  src={selectedPhoto.url || "/placeholder.svg"}
                  alt={selectedPhoto.alt}
                  className="w-full h-full object-cover"
                />
              </div>

              <div className="space-y-2 mb-4">
                <p className="text-sm">
                  <span className="font-medium">Stato:</span>{" "}
                  {selectedPhoto.is_published ? "Pubblicata" : "Non pubblicata"}
                </p>
                <p className="text-sm">
                  <span className="font-medium">URL:</span> {selectedPhoto.url}
                </p>
              </div>

              <div className="mb-4 border-t pt-4">
                <div className="flex items-center gap-2 mb-3">
                  <Tag className="h-4 w-4 text-amber-600" />
                  <h3 className="font-medium">Assegna Categorie</h3>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {categories.map((category) => (
                    <label
                      key={category.id}
                      className={`flex items-center gap-2 p-3 border rounded cursor-pointer transition-colors ${
                        selectedCategories.includes(category.id) ? "bg-amber-50 border-amber-600" : "hover:bg-gray-50"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedCategories.includes(category.id)}
                        onChange={() => toggleCategory(category.id)}
                        className="rounded border-gray-300 text-amber-600 focus:ring-amber-500"
                      />
                      <span className="text-sm">{category.name}</span>
                    </label>
                  ))}
                </div>
                <Button className="w-full mt-3" onClick={handleSaveCategories} disabled={isSavingCategories}>
                  {isSavingCategories ? "Salvataggio..." : "Salva Categorie"}
                </Button>
              </div>

              <div className="flex gap-3">
                <Button variant="outline" className="flex-1 bg-transparent" onClick={() => setSelectedPhoto(null)}>
                  Chiudi
                </Button>
                {adminUser?.can_delete && (
                  <Button variant="destructive" className="flex-1" onClick={handleDeletePhoto} disabled={isDeleting}>
                    <Trash2 className="h-4 w-4 mr-2" />
                    {isDeleting ? "Eliminazione..." : "Elimina"}
                  </Button>
                )}
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}
