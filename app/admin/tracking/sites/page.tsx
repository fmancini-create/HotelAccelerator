"use client"

import { useState } from "react"
import useSWR, { mutate } from "swr"
import { toast } from "sonner"
import {
  Activity,
  Check,
  Copy,
  Globe,
  KeyRound,
  Loader2,
  Plus,
  RefreshCw,
  ShieldCheck,
  ShieldX,
  Trash2,
} from "lucide-react"

import { AdminHeader } from "@/components/admin/admin-header"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"

interface TrackingSite {
  id: string
  name: string
  write_key: string
  allowed_origins: string[]
  is_active: boolean
  created_at: string
  updated_at: string
}

const fetcher = (url: string) => fetch(url).then((r) => r.json())
const SITES_KEY = "/api/admin/tracking/sites"

export default function TrackingSitesPage() {
  const { data, isLoading } = useSWR<{ sites: TrackingSite[] }>(SITES_KEY, fetcher)
  const sites = data?.sites ?? []

  return (
    <div className="min-h-screen bg-[#f8f7f4]">
      <AdminHeader
        title="Tracking - Siti"
        subtitle="Gestisci le chiavi di tracking per i siti dei tuoi clienti"
      />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <Card className="bg-white border-[#e8e0d8]">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-[#5c4a3a]">
              <Globe className="h-5 w-5 text-blue-600" /> Come funziona
            </CardTitle>
            <CardDescription className="text-[#8b7355]">
              Ogni sito riceve una <strong>chiave pubblica</strong> ({`tw_...`}) da incollare nello script embed. Le
              scritture sono accettate solo dagli <strong>Origin autorizzati</strong>. Puoi disattivare un sito senza
              ruotare la chiave per pausarlo immediatamente.
            </CardDescription>
          </CardHeader>
        </Card>

        <CreateSiteCard />

        {isLoading ? (
          <Card className="bg-white border-[#e8e0d8]">
            <CardContent className="py-10 flex items-center justify-center text-[#8b7355]">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              Caricamento siti...
            </CardContent>
          </Card>
        ) : sites.length === 0 ? (
          <Card className="bg-white border-[#e8e0d8]">
            <CardContent className="py-10 text-center text-[#8b7355]">
              Nessun sito configurato. Creane uno per iniziare a tracciare.
            </CardContent>
          </Card>
        ) : (
          sites.map((site) => <SiteCard key={site.id} site={site} />)
        )}
      </div>
    </div>
  )
}

function CreateSiteCard() {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [origins, setOrigins] = useState("")
  const [submitting, setSubmitting] = useState(false)

  async function onCreate() {
    setSubmitting(true)
    try {
      const allowed_origins = origins
        .split(/[\n,]/)
        .map((s) => s.trim())
        .filter(Boolean)
      const res = await fetch(SITES_KEY, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, allowed_origins }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || "Errore")
      toast.success("Sito creato")
      setName("")
      setOrigins("")
      setOpen(false)
      mutate(SITES_KEY)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Errore")
    } finally {
      setSubmitting(false)
    }
  }

  if (!open)
    return (
      <Button onClick={() => setOpen(true)} className="bg-[#5c4a3a] hover:bg-[#463729] text-white">
        <Plus className="h-4 w-4 mr-2" /> Nuovo sito
      </Button>
    )

  return (
    <Card className="bg-white border-[#e8e0d8]">
      <CardHeader>
        <CardTitle className="text-[#5c4a3a]">Nuovo sito di tracking</CardTitle>
        <CardDescription className="text-[#8b7355]">
          Specifica il nome (es. {`"Sito ufficiale"`}) e almeno un origin autorizzato. Esempi:{" "}
          <code className="px-1 py-0.5 bg-[#f8f7f4] rounded">https://www.villaibarronci.it</code>,{" "}
          <code className="px-1 py-0.5 bg-[#f8f7f4] rounded">https://*.villaibarronci.it</code>.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label className="text-[#5c4a3a]">Nome</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Sito ufficiale"
            className="bg-white"
          />
        </div>
        <div className="space-y-2">
          <Label className="text-[#5c4a3a]">Origin autorizzati</Label>
          <Textarea
            value={origins}
            onChange={(e) => setOrigins(e.target.value)}
            placeholder={"https://www.villaibarronci.it\nhttps://villaibarronci.it"}
            className="font-mono text-sm bg-white min-h-24"
          />
          <p className="text-xs text-[#8b7355]">Uno per riga. Supporta wildcard come {`"*.example.com"`}.</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={onCreate} disabled={submitting} className="bg-[#5c4a3a] hover:bg-[#463729] text-white">
            {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Crea
          </Button>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Annulla
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function SiteCard({ site }: { site: TrackingSite }) {
  const [origins, setOrigins] = useState(site.allowed_origins.join("\n"))
  const [name, setName] = useState(site.name)
  const [saving, setSaving] = useState(false)
  const [keyCopied, setKeyCopied] = useState(false)
  const [snippetCopied, setSnippetCopied] = useState(false)

  const endpoint = typeof window !== "undefined" ? window.location.origin : ""
  const snippet = `<script defer src="${endpoint}/tracker.js"\n  data-key="${site.write_key}"\n  data-endpoint="${endpoint}"></script>`

  async function onSave(patch: Partial<TrackingSite> & { rotate_key?: boolean }) {
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/tracking/sites/${site.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || "Errore")
      toast.success("Salvato")
      mutate(SITES_KEY)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Errore")
    } finally {
      setSaving(false)
    }
  }

  async function onDelete() {
    if (!confirm(`Eliminare "${site.name}"? Gli eventi storici restano ma site_id verra' impostato a NULL.`)) return
    const res = await fetch(`/api/admin/tracking/sites/${site.id}`, { method: "DELETE" })
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      return toast.error(j?.error || "Errore")
    }
    toast.success("Sito eliminato")
    mutate(SITES_KEY)
  }

  async function copy(value: string, setter: (b: boolean) => void) {
    try {
      await navigator.clipboard.writeText(value)
      setter(true)
      setTimeout(() => setter(false), 2000)
    } catch {
      toast.error("Copia non disponibile")
    }
  }

  async function saveOriginsAndName() {
    const next = origins
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean)
    await onSave({ name, allowed_origins: next })
  }

  return (
    <Card className="bg-white border-[#e8e0d8]">
      <CardHeader>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2 text-[#5c4a3a]">
              <Globe className="h-5 w-5 text-blue-600" />
              <span className="truncate">{site.name}</span>
              {site.is_active ? (
                <Badge className="bg-green-100 text-green-800 border-green-200">
                  <ShieldCheck className="h-3 w-3 mr-1" /> Attivo
                </Badge>
              ) : (
                <Badge variant="outline" className="text-amber-700 border-amber-300">
                  <ShieldX className="h-3 w-3 mr-1" /> Disattivato
                </Badge>
              )}
            </CardTitle>
            <CardDescription className="text-[#8b7355]">
              ID: <code className="text-xs">{site.id.slice(0, 8)}</code>
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor={`active-${site.id}`} className="text-sm text-[#5c4a3a]">
              {site.is_active ? "On" : "Off"}
            </Label>
            <Switch
              id={`active-${site.id}`}
              checked={site.is_active}
              onCheckedChange={(v) => onSave({ is_active: v })}
              disabled={saving}
            />
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* Key */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2 text-[#5c4a3a]">
            <KeyRound className="h-4 w-4" /> Chiave pubblica
          </Label>
          <div className="flex items-center gap-2">
            <code className="flex-1 px-3 py-2 bg-[#f8f7f4] border border-[#e8e0d8] rounded text-xs font-mono break-all">
              {site.write_key}
            </code>
            <Button variant="outline" size="sm" onClick={() => copy(site.write_key, setKeyCopied)}>
              {keyCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (confirm("Ruotare la chiave? Dovrai aggiornare tutti gli script che la usano.")) {
                  onSave({ rotate_key: true })
                }
              }}
              disabled={saving}
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <Separator />

        {/* Name + Origins */}
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label className="text-[#5c4a3a]">Nome</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label className="text-[#5c4a3a]">Origin autorizzati</Label>
            <Textarea
              value={origins}
              onChange={(e) => setOrigins(e.target.value)}
              className="font-mono text-sm min-h-24"
              placeholder="https://www.villaibarronci.it"
            />
          </div>
        </div>
        <Button onClick={saveOriginsAndName} disabled={saving} className="bg-[#5c4a3a] hover:bg-[#463729] text-white">
          {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          Salva modifiche
        </Button>

        <Separator />

        {/* Snippet */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2 text-[#5c4a3a]">
            <Activity className="h-4 w-4" /> Script da incollare nel {"<head>"} del sito
          </Label>
          <div className="relative">
            <pre className="p-3 bg-[#1e1e1e] text-[#e8e0d8] rounded text-xs overflow-x-auto">
              <code>{snippet}</code>
            </pre>
            <Button
              variant="outline"
              size="sm"
              className="absolute top-2 right-2 bg-white"
              onClick={() => copy(snippet, setSnippetCopied)}
            >
              {snippetCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
          <p className="text-xs text-[#8b7355]">
            Puoi chiamare <code>window.ha.track(&apos;cta_click&apos;, {`{cta:'book_now'}`})</code> o{" "}
            <code>window.ha.identify({`{email:'guest@...'}`})</code> per catturare eventi ed identita&apos;.
          </p>
        </div>

        <Separator />

        <div className="flex justify-end">
          <Button variant="outline" className="text-red-600 hover:bg-red-50" onClick={onDelete}>
            <Trash2 className="h-4 w-4 mr-2" /> Elimina sito
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
