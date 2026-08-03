"use client"

import { useEffect, useMemo, useState } from "react"
import { Check, ImagePlus, Loader2, Search, Upload } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"

export interface CMSMediaSelection {
  publicUrl: string
  altText: string
  originalName: string
}

interface MediaAsset {
  id: string
  public_url: string
  original_name: string
  alt_text: string | null
  mime_type: string
  size_bytes: number
}

interface CMSMediaPickerDialogProps {
  triggerLabel?: string
  onSelect: (selection: CMSMediaSelection) => void
}

export function CMSMediaPickerDialog({ triggerLabel = "Scegli dalla libreria", onSelect }: CMSMediaPickerDialogProps) {
  const [open, setOpen] = useState(false)
  const [assets, setAssets] = useState<MediaAsset[]>([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [query, setQuery] = useState("")
  const [message, setMessage] = useState<string | null>(null)

  async function loadAssets() {
    setLoading(true)
    setMessage(null)
    try {
      const response = await fetch("/api/cms/media", { cache: "no-store" })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Impossibile caricare la libreria")
      setAssets(data.assets || [])
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Errore di caricamento")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (open) loadAssets()
  }, [open])

  const filtered = useMemo(() => {
    const value = query.trim().toLowerCase()
    if (!value) return assets
    return assets.filter((asset) =>
      asset.original_name.toLowerCase().includes(value) || asset.alt_text?.toLowerCase().includes(value),
    )
  }, [assets, query])

  async function uploadFile(file: File | null) {
    if (!file) return
    setUploading(true)
    setMessage(null)
    try {
      const form = new FormData()
      form.append("file", file)
      const response = await fetch("/api/cms/media", { method: "POST", body: form })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Upload non riuscito")
      const asset = data.asset as MediaAsset
      setAssets((current) => [asset, ...current])
      onSelect({ publicUrl: asset.public_url, altText: asset.alt_text || asset.original_name, originalName: asset.original_name })
      setOpen(false)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Errore durante l’upload")
    } finally {
      setUploading(false)
    }
  }

  function choose(asset: MediaAsset) {
    onSelect({
      publicUrl: asset.public_url,
      altText: asset.alt_text || asset.original_name,
      originalName: asset.original_name,
    })
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" className="w-full">
          <ImagePlus className="mr-2 h-4 w-4" />
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] max-w-5xl overflow-hidden">
        <DialogHeader>
          <DialogTitle>Scegli un’immagine</DialogTitle>
          <DialogDescription>
            Seleziona una foto già caricata oppure caricane una nuova. Le immagini appartengono solo alla struttura attiva.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cerca per nome o descrizione" className="pl-9" />
          </div>
          <label className="inline-flex cursor-pointer items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
            {uploading ? "Caricamento…" : "Carica nuova"}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif,image/gif"
              className="hidden"
              disabled={uploading}
              onChange={(event) => uploadFile(event.target.files?.[0] || null)}
            />
          </label>
        </div>

        {message && <div className="rounded-md border bg-muted/40 p-3 text-sm">{message}</div>}

        <div className="min-h-64 overflow-y-auto pr-1">
          {loading ? (
            <div className="flex min-h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>
          ) : filtered.length ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filtered.map((asset) => (
                <button
                  key={asset.id}
                  type="button"
                  onClick={() => choose(asset)}
                  className="group overflow-hidden rounded-lg border bg-background text-left transition hover:border-primary hover:shadow-sm"
                >
                  <div className="relative aspect-[4/3] bg-muted">
                    <img src={asset.public_url} alt={asset.alt_text || asset.original_name} className="h-full w-full object-cover" loading="lazy" />
                    <span className="absolute right-2 top-2 rounded-full bg-background/90 p-1 opacity-0 shadow transition group-hover:opacity-100">
                      <Check className="h-4 w-4" />
                    </span>
                  </div>
                  <div className="p-3">
                    <p className="truncate text-sm font-medium">{asset.original_name}</p>
                    <p className="mt-1 truncate text-xs text-muted-foreground">{asset.alt_text || "Nessuna descrizione"}</p>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="flex min-h-64 flex-col items-center justify-center rounded-lg border border-dashed text-center">
              <ImagePlus className="mb-3 h-9 w-9 text-muted-foreground" />
              <p className="font-medium">Nessuna immagine trovata</p>
              <p className="mt-1 text-sm text-muted-foreground">Carica la prima fotografia oppure modifica la ricerca.</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
