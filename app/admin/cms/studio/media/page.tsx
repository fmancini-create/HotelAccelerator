"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { ArrowLeft, Check, Copy, ImagePlus, Loader2, Search, Trash2, Upload } from "lucide-react"
import { AdminHeader } from "@/components/admin/admin-header"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"

interface MediaAsset {
  id: string
  public_url: string
  original_name: string
  mime_type: string
  size_bytes: number
  alt_text: string | null
  width: number | null
  height: number | null
  created_at: string
}

export default function CMSMediaLibraryPage() {
  const [assets, setAssets] = useState<MediaAsset[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [query, setQuery] = useState("")
  const [altText, setAltText] = useState("")
  const [message, setMessage] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  async function loadAssets() {
    setLoading(true)
    try {
      const response = await fetch("/api/cms/media", { cache: "no-store" })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || "Impossibile caricare le immagini")
      setAssets(data.assets || [])
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Errore di caricamento")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadAssets() }, [])

  const filtered = useMemo(() => {
    const value = query.trim().toLowerCase()
    if (!value) return assets
    return assets.filter((asset) =>
      asset.original_name.toLowerCase().includes(value) || asset.alt_text?.toLowerCase().includes(value),
    )
  }, [assets, query])

  async function uploadFiles(files: FileList | null) {
    if (!files?.length) return
    setUploading(true)
    setMessage(null)
    try {
      for (const file of Array.from(files)) {
        const form = new FormData()
        form.append("file", file)
        if (altText.trim()) form.append("alt_text", altText.trim())
        const response = await fetch("/api/cms/media", { method: "POST", body: form })
        const data = await response.json()
        if (!response.ok) throw new Error(`${file.name}: ${data.error || "Upload non riuscito"}`)
        setAssets((current) => [data.asset, ...current])
      }
      setAltText("")
      setMessage("Immagini caricate correttamente")
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Errore durante l’upload")
    } finally {
      setUploading(false)
    }
  }

  async function copyUrl(asset: MediaAsset) {
    await navigator.clipboard.writeText(asset.public_url)
    setCopiedId(asset.id)
    setTimeout(() => setCopiedId(null), 1500)
  }

  async function removeAsset(asset: MediaAsset) {
    if (!window.confirm(`Eliminare ${asset.original_name}? L’immagine potrebbe essere già usata in una pagina.`)) return
    setMessage(null)
    const response = await fetch(`/api/cms/media?id=${encodeURIComponent(asset.id)}`, { method: "DELETE" })
    const data = await response.json()
    if (!response.ok) return setMessage(data.error || "Eliminazione non riuscita")
    setAssets((current) => current.filter((item) => item.id !== asset.id))
    setMessage("Immagine eliminata")
  }

  return (
    <div className="space-y-5">
      <AdminHeader
        title="Libreria media CMS"
        subtitle="Immagini isolate per struttura e pronte per il sito"
        actions={<Button variant="outline" asChild><Link href="/admin/cms/studio/builder"><ArrowLeft className="mr-2 h-4 w-4" />Torna al builder</Link></Button>}
      />

      <Card><CardContent className="space-y-4 p-5">
        <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
          <div className="space-y-2">
            <Input value={altText} onChange={(event) => setAltText(event.target.value)} maxLength={500} placeholder="Descrizione accessibile comune alle immagini caricate (facoltativa)" />
            <p className="text-xs text-muted-foreground">JPEG, PNG, WebP, AVIF o GIF. Massimo 10 MB per immagine.</p>
          </div>
          <label className="inline-flex cursor-pointer items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            {uploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
            {uploading ? "Caricamento…" : "Carica immagini"}
            <input type="file" accept="image/jpeg,image/png,image/webp,image/avif,image/gif" multiple className="hidden" disabled={uploading} onChange={(event) => uploadFiles(event.target.files)} />
          </label>
        </div>
        {message && <div className="rounded-md border bg-muted/40 p-3 text-sm">{message}</div>}
      </CardContent></Card>

      <div className="relative max-w-xl">
        <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Cerca per nome o descrizione" className="pl-9" />
      </div>

      {loading ? (
        <div className="flex min-h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>
      ) : filtered.length ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {filtered.map((asset) => (
            <Card key={asset.id} className="overflow-hidden">
              <div className="aspect-[4/3] bg-muted">
                <img src={asset.public_url} alt={asset.alt_text || asset.original_name} className="h-full w-full object-cover" loading="lazy" />
              </div>
              <CardContent className="space-y-3 p-4">
                <div>
                  <p className="truncate font-medium" title={asset.original_name}>{asset.original_name}</p>
                  <p className="text-xs text-muted-foreground">{(asset.size_bytes / 1024 / 1024).toFixed(2)} MB · {asset.mime_type.replace("image/", "").toUpperCase()}</p>
                </div>
                {asset.alt_text && <p className="line-clamp-2 text-sm text-muted-foreground">{asset.alt_text}</p>}
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => copyUrl(asset)}>
                    {copiedId === asset.id ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
                    {copiedId === asset.id ? "Copiato" : "Copia URL"}
                  </Button>
                  <Button variant="destructive" size="icon" onClick={() => removeAsset(asset)} aria-label={`Elimina ${asset.original_name}`}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="flex min-h-64 flex-col items-center justify-center rounded-xl border border-dashed text-center">
          <ImagePlus className="mb-3 h-10 w-10 text-muted-foreground" />
          <p className="font-medium">Nessuna immagine disponibile</p>
          <p className="mt-1 text-sm text-muted-foreground">Carica le fotografie della struttura per sostituire le immagini demo.</p>
        </div>
      )}
    </div>
  )
}
