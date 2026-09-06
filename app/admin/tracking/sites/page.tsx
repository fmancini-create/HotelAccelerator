"use client"

import { useState } from "react"
import Link from "next/link"
import useSWR, { mutate } from "swr"
import { toast } from "sonner"
import {
  Activity,
  BarChart3,
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

type SharedSetup = {
  _status: number
  publicToken?: string
  scriptUrl?: string
  receiving?: boolean
  installed?: boolean
  lastDataDay?: string | null
  lastDayPageviews?: number
  lastDaySessions?: number
  error?: string
}

const fetcher = (url: string) => fetch(url).then((r) => r.json())
const setupFetcher = async (url: string): Promise<SharedSetup> => {
  const response = await fetch(url)
  const body = await response.json().catch(() => ({}))
  return { ...body, _status: response.status }
}
const SITES_KEY = "/api/admin/tracking/sites"

export default function TrackingSitesPage() {
  const { data, isLoading } = useSWR<{ sites: TrackingSite[] }>(SITES_KEY, fetcher)
  const sites = data?.sites ?? []

  return (
    <div className="min-h-full bg-muted">
      <AdminHeader
        title="Tracking - Siti"
        subtitle="Analytics condivisa con Santaddeo + tracking CRM di HotelAccelerator"
      />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <SharedWebTrafficCard />

        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-foreground">
              <Globe className="h-5 w-5 text-ha-info-soft-foreground" /> Due livelli, un solo sito
            </CardTitle>
            <CardDescription className="text-ha-brand-soft-foreground">
              <strong>Visite sito</strong> è il modulo condiviso con Santaddeo e raccoglie analytics anonime e aggregate.
              Il tracker <strong>HotelAccelerator CRM</strong> qui sotto resta invece dedicato a sessioni live, eventi e
              identificazione dei contatti. Sul CMS HotelAccelerator entrambi vengono installati automaticamente quando attivi.
            </CardDescription>
          </CardHeader>
        </Card>

        <div>
          <h2 className="text-base font-semibold text-foreground">Tracking CRM HotelAccelerator</h2>
          <p className="mt-1 text-sm text-muted-foreground">Chiavi e domini per sessioni live, eventi e collegamento dei visitatori ai contatti CRM.</p>
        </div>

        <CreateSiteCard />

        {isLoading ? (
          <Card className="bg-card border-border">
            <CardContent className="py-10 flex items-center justify-center text-ha-brand-soft-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              Caricamento siti...
            </CardContent>
          </Card>
        ) : sites.length === 0 ? (
          <Card className="bg-card border-border">
            <CardContent className="py-10 text-center text-ha-brand-soft-foreground">
              Nessun sito CRM configurato. Se usi il CMS, il modulo Visite sito condiviso può comunque essere installato automaticamente.
            </CardContent>
          </Card>
        ) : (
          sites.map((site) => <SiteCard key={site.id} site={site} />)
        )}
      </div>
    </div>
  )
}

function SharedWebTrafficCard() {
  const { data, isLoading } = useSWR<SharedSetup>("/api/admin/web-traffic/setup", setupFetcher, { revalidateOnFocus: false })
  const [copied, setCopied] = useState(false)

  if (isLoading) {
    return <Card><CardContent className="flex items-center gap-2 p-5 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Verifica modulo Visite sito…</CardContent></Card>
  }

  if (!data || data._status === 403) {
    return (
      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-foreground"><BarChart3 className="h-5 w-5" /> Visite sito · modulo condiviso</CardTitle>
          <CardDescription>
            Attivalo una sola volta in HotelAccelerator o Santaddeo: l&apos;entitlement viene condiviso nella suite e non esistono due raccolte dati separate.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline"><Link href="/admin/modules">Vai ai moduli</Link></Button>
        </CardContent>
      </Card>
    )
  }

  if (data._status !== 200 || !data.publicToken || !data.scriptUrl) {
    return (
      <Card className="border-ha-warning-soft">
        <CardContent className="p-5 text-sm text-ha-warning-soft-foreground">Il modulo Visite sito risulta attivo, ma la configurazione condivisa non è disponibile in questo momento.</CardContent>
      </Card>
    )
  }

  const snippet = `<script src="${data.scriptUrl}" data-token="${data.publicToken}" data-widget="track" async></script>`

  async function copySnippet() {
    try {
      await navigator.clipboard.writeText(snippet)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error("Copia non disponibile")
    }
  }

  return (
    <Card className="border-ha-brand/20 bg-card">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-foreground"><BarChart3 className="h-5 w-5 text-ha-brand" /> Visite sito · Santaddeo Analytics Intelligence</CardTitle>
            <CardDescription className="mt-1">Stessa attivazione, stesso tracker e stessi dati in tutta la suite 4BID.</CardDescription>
          </div>
          <Badge className={data.receiving ? "bg-ha-success-soft text-ha-success-soft-foreground" : "bg-muted text-foreground"}>
            {data.receiving ? "Dati in arrivo" : data.installed ? "Installato" : "In attesa dei primi dati"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Ultimo dato</p><p className="mt-1 font-semibold">{data.lastDataDay || "—"}</p></div>
          <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Pageview ultimo giorno</p><p className="mt-1 font-semibold tabular-nums">{data.lastDayPageviews ?? 0}</p></div>
          <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Sessioni ultimo giorno</p><p className="mt-1 font-semibold tabular-nums">{data.lastDaySessions ?? 0}</p></div>
        </div>

        <div className="rounded-lg border bg-ha-brand-soft/30 p-4">
          <p className="text-sm font-medium text-foreground">Se il sito è nel CMS HotelAccelerator</p>
          <p className="mt-1 text-sm text-muted-foreground">Non devi incollare nulla: il tracker Santaddeo viene inserito automaticamente dal CMS, insieme al tracker CRM HotelAccelerator.</p>
        </div>

        <div className="space-y-2">
          <Label className="text-foreground">Se il sito è esterno a HotelAccelerator</Label>
          <div className="relative">
            <pre className="overflow-x-auto rounded bg-[#1e1e1e] p-3 pr-14 text-xs text-border"><code>{snippet}</code></pre>
            <Button variant="outline" size="sm" className="absolute right-2 top-2 bg-card" onClick={copySnippet}>{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}</Button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button asChild className="bg-primary text-white hover:bg-ha-brand/90"><Link href="/admin/tracking/analytics"><BarChart3 className="mr-2 h-4 w-4" />Apri Visite sito</Link></Button>
          <p className="self-center text-xs text-muted-foreground">Le sessioni identificabili e live restano nella voce Visitatori del CRM.</p>
        </div>
      </CardContent>
    </Card>
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
      const allowed_origins = origins.split(/[\n,]/).map((s) => s.trim()).filter(Boolean)
      const res = await fetch(SITES_KEY, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, allowed_origins }) })
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

  if (!open) return <Button onClick={() => setOpen(true)} className="bg-primary hover:bg-ha-brand/90 text-white"><Plus className="h-4 w-4 mr-2" /> Nuovo sito CRM</Button>

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle className="text-foreground">Nuovo sito di tracking CRM</CardTitle>
        <CardDescription className="text-ha-brand-soft-foreground">Specifica il nome e almeno un origin autorizzato. Esempi: <code className="px-1 py-0.5 bg-muted rounded">https://www.villaibarronci.it</code>, <code className="px-1 py-0.5 bg-muted rounded">https://*.villaibarronci.it</code>.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2"><Label className="text-foreground">Nome</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Sito ufficiale" className="bg-card" /></div>
        <div className="space-y-2"><Label className="text-foreground">Origin autorizzati</Label><Textarea value={origins} onChange={(e) => setOrigins(e.target.value)} placeholder={"https://www.villaibarronci.it\nhttps://villaibarronci.it"} className="font-mono text-sm bg-card min-h-24" /><p className="text-xs text-muted-foreground">Uno per riga. Supporta wildcard come {`"*.example.com"`}.</p></div>
        <div className="flex gap-2"><Button onClick={onCreate} disabled={submitting} className="bg-primary hover:bg-ha-brand/90 text-white">{submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Crea</Button><Button variant="outline" onClick={() => setOpen(false)}>Annulla</Button></div>
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
      const res = await fetch(`/api/admin/tracking/sites/${site.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) })
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
    if (!res.ok) { const j = await res.json().catch(() => ({})); return toast.error(j?.error || "Errore") }
    toast.success("Sito eliminato")
    mutate(SITES_KEY)
  }

  async function copy(value: string, setter: (b: boolean) => void) {
    try { await navigator.clipboard.writeText(value); setter(true); setTimeout(() => setter(false), 2000) } catch { toast.error("Copia non disponibile") }
  }

  async function saveOriginsAndName() {
    const next = origins.split(/[\n,]/).map((s) => s.trim()).filter(Boolean)
    await onSave({ name, allowed_origins: next })
  }

  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2 text-foreground"><Globe className="h-5 w-5 text-ha-info-soft-foreground" /><span className="truncate">{site.name}</span>{site.is_active ? <Badge className="bg-ha-success-soft text-ha-success-soft-foreground border-ha-success-soft"><ShieldCheck className="h-3 w-3 mr-1" /> Attivo</Badge> : <Badge variant="outline" className="text-ha-warning-soft-foreground border-ha-warning-soft"><ShieldX className="h-3 w-3 mr-1" /> Disattivato</Badge>}</CardTitle>
            <CardDescription className="text-ha-brand-soft-foreground">ID: <code className="text-xs">{site.id.slice(0, 8)}</code></CardDescription>
          </div>
          <div className="flex items-center gap-2"><Label htmlFor={`active-${site.id}`} className="text-sm text-foreground">{site.is_active ? "On" : "Off"}</Label><Switch id={`active-${site.id}`} checked={site.is_active} onCheckedChange={(v) => onSave({ is_active: v })} disabled={saving} /></div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2"><Label className="flex items-center gap-2 text-foreground"><KeyRound className="h-4 w-4" /> Chiave pubblica</Label><div className="flex items-center gap-2"><code className="flex-1 px-3 py-2 bg-muted border border-border rounded text-xs font-mono break-all">{site.write_key}</code><Button variant="outline" size="sm" onClick={() => copy(site.write_key, setKeyCopied)}>{keyCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}</Button><Button variant="outline" size="sm" onClick={() => { if (confirm("Ruotare la chiave? Dovrai aggiornare tutti gli script che la usano.")) onSave({ rotate_key: true }) }} disabled={saving}><RefreshCw className="h-4 w-4" /></Button></div></div>
        <Separator />
        <div className="grid gap-4 md:grid-cols-2"><div className="space-y-2"><Label className="text-foreground">Nome</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div><div className="space-y-2"><Label className="text-foreground">Origin autorizzati</Label><Textarea value={origins} onChange={(e) => setOrigins(e.target.value)} className="font-mono text-sm min-h-24" placeholder="https://www.villaibarronci.it" /></div></div>
        <Button onClick={saveOriginsAndName} disabled={saving} className="bg-primary hover:bg-ha-brand/90 text-white">{saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Salva modifiche</Button>
        <Separator />
        <div className="space-y-2"><Label className="flex items-center gap-2 text-foreground"><Activity className="h-4 w-4" /> Script CRM da incollare nel {"<head>"} del sito</Label><div className="relative"><pre className="p-3 bg-[#1e1e1e] text-border rounded text-xs overflow-x-auto"><code>{snippet}</code></pre><Button variant="outline" size="sm" className="absolute top-2 right-2 bg-card" onClick={() => copy(snippet, setSnippetCopied)}>{snippetCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}</Button></div><p className="text-xs text-muted-foreground">Questo è il tracker CRM: <code>window.ha.track(&apos;cta_click&apos;, {`{cta:'book_now'}`})</code> e <code>window.ha.identify({`{email:'guest@...'}`})</code>. Le analytics aggregate sono gestite dal modulo Visite sito sopra.</p></div>
        <Separator />
        <div className="flex justify-end"><Button variant="outline" className="text-ha-error-soft-foreground hover:bg-ha-error-soft" onClick={onDelete}><Trash2 className="h-4 w-4 mr-2" /> Elimina sito</Button></div>
      </CardContent>
    </Card>
  )
}
