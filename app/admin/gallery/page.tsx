"use client"

import { useEffect, useState } from "react"
import type React from "react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { createBrowserClient } from "@/lib/supabase/client"
import { AdminHeader } from "@/components/admin/admin-header"

type Photo = {
  id: string
  url: string
  alt: string | null
  is_published: boolean
  categories: { id: string; name: string }[]
}

type Category = {
  id: string
  name: string
  slug: string
}

export default function GalleryPage() {
  const [photos, setPhotos] = useState<Photo[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [selectedPhotos, setSelectedPhotos] = useState<Set<string>>(new Set())
  const [uploading, setUploading] = useState(false)
  const supabase = createBrowserClient()
  const router = useRouter()

  // Carica foto e categorie
  useEffect(() => {
    loadPhotos()
    loadCategories()
  }, [])

  async function loadPhotos() {
    const { data, error } = await supabase
      .from("photos")
      .select(`
        id,
        url,
        alt,
        is_published,
        photo_categories (
          category:categories (
            id,
            name
          )
        )
      `)
      .order("created_at", { ascending: false })

    if (!error && data) {
      const formattedPhotos = data.map((photo: any) => ({
        ...photo,
        categories: photo.photo_categories?.map((pc: any) => pc.category) || [],
      }))
      setPhotos(formattedPhotos)
    }
  }

  async function loadCategories() {
    const { data, error } = await supabase.from("categories").select("*").order("name")

    if (!error && data) {
      setCategories(data)
    }
  }

  // Upload multiplo
  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (!files || files.length === 0) return

    setUploading(true)
    const formData = new FormData()
    Array.from(files).forEach((file) => formData.append("files", file))

    try {
      const res = await fetch("/api/admin/upload-photos", {
        method: "POST",
        body: formData,
      })

      if (res.ok) {
        await loadPhotos()
      }
    } finally {
      setUploading(false)
    }
  }

  // Toggle selezione foto
  function togglePhotoSelection(photoId: string) {
    const newSelection = new Set(selectedPhotos)
    if (newSelection.has(photoId)) {
      newSelection.delete(photoId)
    } else {
      newSelection.add(photoId)
    }
    setSelectedPhotos(newSelection)
  }

  // Toggle pubblicazione singola foto
  async function togglePublish(photo: Photo) {
    await fetch("/api/admin/update-photo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        photoId: photo.id,
        alt: photo.alt,
        isPublished: !photo.is_published,
        categoryIds: photo.categories.map((c) => c.id),
      }),
    })
    await loadPhotos()
  }

  // Aggiorna ALT
  async function updateAlt(photoId: string, newAlt: string) {
    const photo = photos.find((p) => p.id === photoId)
    if (!photo) return

    await fetch("/api/admin/update-photo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        photoId,
        alt: newAlt,
        isPublished: photo.is_published,
        categoryIds: photo.categories.map((c) => c.id),
      }),
    })
  }

  // Assegna categorie alle foto selezionate
  async function assignCategories(categoryIds: string[]) {
    for (const photoId of Array.from(selectedPhotos)) {
      const photo = photos.find((p) => p.id === photoId)
      if (!photo) continue

      await fetch("/api/admin/update-photo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          photoId,
          alt: photo.alt,
          isPublished: photo.is_published,
          categoryIds,
        }),
      })
    }
    await loadPhotos()
    setSelectedPhotos(new Set())
  }

  // Elimina foto
  async function deletePhoto(photoId: string) {
    if (!confirm("Eliminare questa foto?")) return

    await fetch("/api/admin/delete-photo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ photoId }),
    })
    await loadPhotos()
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        <AdminHeader
          title="Galleria"
          subtitle="Gestisci le foto della struttura"
          breadcrumbs={[{ label: "Galleria", href: "/admin/gallery" }]}
        />

        {/* Upload Section */}
        <div className="bg-white p-6 rounded-lg shadow mb-8">
          <h2 className="text-xl font-semibold mb-4">Upload Foto</h2>
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
            <Input
              type="file"
              multiple
              accept="image/*"
              onChange={handleUpload}
              disabled={uploading}
              className="max-w-md mx-auto"
            />
            <p className="text-sm text-gray-500 mt-2">
              {uploading ? "Caricamento..." : "Seleziona una o più immagini"}
            </p>
          </div>
        </div>

        {/* Azioni Multiple */}
        {selectedPhotos.size > 0 && (
          <div className="bg-blue-50 p-4 rounded-lg mb-8">
            <p className="font-semibold mb-3">{selectedPhotos.size} foto selezionate</p>
            <div className="flex gap-2 flex-wrap">
              {categories.map((cat) => (
                <Button key={cat.id} variant="outline" size="sm" onClick={() => assignCategories([cat.id])}>
                  Assegna a {cat.name}
                </Button>
              ))}
            </div>
          </div>
        )}

        {/* Griglia Foto */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {photos.map((photo) => (
            <div key={photo.id} className="bg-white rounded-lg shadow overflow-hidden">
              {/* Checkbox selezione */}
              <div className="p-3 border-b flex items-center gap-2">
                <Checkbox
                  checked={selectedPhotos.has(photo.id)}
                  onCheckedChange={() => togglePhotoSelection(photo.id)}
                />
                <span className="text-sm text-gray-600">Seleziona</span>
              </div>

              {/* Immagine */}
              <div className="relative aspect-[4/3] bg-gray-100">
                <Image src={photo.url || "/placeholder.svg"} alt={photo.alt || "Photo"} fill className="object-cover" />
                {!photo.is_published && (
                  <div className="absolute top-2 right-2 bg-orange-500 text-white px-2 py-1 rounded text-xs font-semibold">
                    NON PUBBLICATA
                  </div>
                )}
              </div>

              {/* Dettagli */}
              <div className="p-3 space-y-3">
                {/* ALT/Descrizione */}
                <div>
                  <Label className="text-xs text-gray-600">Descrizione/ALT</Label>
                  <Input
                    value={photo.alt || ""}
                    onChange={(e) => updateAlt(photo.id, e.target.value)}
                    onBlur={() => loadPhotos()}
                    placeholder="Descrizione foto"
                    className="mt-1"
                  />
                </div>

                {/* Categorie */}
                <div>
                  <Label className="text-xs text-gray-600">Categorie</Label>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {photo.categories.length > 0 ? (
                      photo.categories.map((cat) => (
                        <span key={cat.id} className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">
                          {cat.name}
                        </span>
                      ))
                    ) : (
                      <span className="text-xs text-gray-400">Nessuna categoria</span>
                    )}
                  </div>
                </div>

                {/* Azioni */}
                <div className="flex gap-2 pt-2">
                  <Button
                    size="sm"
                    variant={photo.is_published ? "outline" : "default"}
                    onClick={() => togglePublish(photo)}
                    className="flex-1"
                  >
                    {photo.is_published ? "Nascondi" : "Pubblica"}
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => deletePhoto(photo.id)}>
                    Elimina
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {photos.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            Nessuna foto caricata. Inizia caricando le tue prime immagini.
          </div>
        )}
      </div>
    </div>
  )
}
