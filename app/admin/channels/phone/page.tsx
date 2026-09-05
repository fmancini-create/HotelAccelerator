"use client"

import Image from "next/image"
import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { AlertTriangle, CheckCircle2, ExternalLink, Loader2, Phone, Save, Settings2 } from "lucide-react"
import { AdminHeader } from "@/components/admin/admin-header"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { getTelephonyProvider, TELEPHONY_PROVIDERS, type TelephonyProviderId } from "@/lib/telephony/providers"

type Integration = {
  provider: TelephonyProviderId
  base_url: string
  client_id: string
  default_extension: string
  provider_config: Record<string, string>
  credentials_preview: { client_secret: string }
  has_client_secret: boolean
  is_active: boolean
  last_check_status: string | null
  last_check_error: string | null
  last_check_at: string | null
}

type ProviderForm = {
  base_url: string
  client_id: string
  client_secret: string
  default_extension: string
  provider_config: Record<string, string>
}

const EMPTY_FORM: ProviderForm = { base_url: "", client_id: "", client_secret: "", default_extension: "", provider_config: {} }

function capabilityLabel(value: boolean, yes: string, no: string) {
  return <Badge variant={value ? "default" : "outline"}>{value ? yes : no}</Badge>
}

export default function PhoneChannelPage() {
  const [integrations, setIntegrations] = useState<Integration[]>([])
  const [activeProvider, setActiveProvider] = useState<TelephonyProviderId | null>(null)
  const [selected, setSelected] = useState<TelephonyProviderId>("3cx")
  const [form, setForm] = useState<ProviderForm>(EMPTY_FORM)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")
  const [error, setError] = useState("")

  const provider = useMemo(() => getTelephonyProvider(selected)!, [selected])
  const selectedIntegration = useMemo(() => integrations.find((item) => item.provider === selected) ?? null, [integrations, selected])

  async function load() {
    setLoading(true)
    setError("")
    try {
      const response = await fetch("/api/telephony/providers", { credentials: "include", cache: "no-store" })
      const body = await response.json()
      if (!response.ok) throw new Error(body?.error || "Impossibile caricare i centralini.")
      const rows = (body.integrations || []) as Integration[]
      setIntegrations(rows)
      const active = (body.active_integration?.provider || null) as TelephonyProviderId | null
      setActiveProvider(active)
      if (active) setSelected(active)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Impossibile caricare i centralini.")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  useEffect(() => {
    const current = integrations.find((item) => item.provider === selected)
    const defaults: Record<string, string> = {}
    for (const field of provider.fields) {
      if (field.storage.startsWith("provider_config.")) {
        const key = field.storage.slice("provider_config.".length)
        defaults[key] = current?.provider_config?.[key] || field.defaultValue || ""
      }
    }
    setForm({
      base_url: current?.base_url || "",
      client_id: current?.client_id || "",
      client_secret: "",
      default_extension: current?.default_extension || "",
      provider_config: defaults,
    })
    setMessage("")
    setError("")
  }, [selected, integrations, provider])

  function updateField(storage: string, value: string) {
    if (storage.startsWith("provider_config.")) {
      const key = storage.slice("provider_config.".length)
      setForm((current) => ({ ...current, provider_config: { ...current.provider_config, [key]: value } }))
      return
    }
    setForm((current) => ({ ...current, [storage]: value }))
  }

  function valueOf(storage: string): string {
    if (storage.startsWith("provider_config.")) return form.provider_config[storage.slice("provider_config.".length)] || ""
    return String(form[storage as keyof Omit<ProviderForm, "provider_config">] || "")
  }

  async function save() {
    setSaving(true)
    setMessage("")
    setError("")
    try {
      const response = await fetch("/api/telephony/providers", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: selected, ...form }),
      })
      const body = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(body?.error || "Configurazione non salvata.")
      setMessage(body.message || "Configurazione salvata.")
      await load()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Configurazione non salvata.")
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="p-6 text-sm text-muted-foreground">Caricamento centralini...</div>

  return (
    <div className="min-h-full bg-background">
      <AdminHeader title="Centralino telefonico" subtitle="Scegli il PBX della struttura: HotelAccelerator usa un adapter, non dipende da un solo fornitore." />
      <main className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
        {error && <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertTitle>Attenzione</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
        {message && <Alert><CheckCircle2 className="h-4 w-4" /><AlertTitle>Salvato</AlertTitle><AlertDescription>{message}</AlertDescription></Alert>}

        <Card>
          <CardHeader>
            <CardTitle>Scegli il centralino</CardTitle>
            <CardDescription>Aprire una guida non cambia nulla. Il provider diventa attivo soltanto quando premi “Imposta come centralino attivo”.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {TELEPHONY_PROVIDERS.map((item) => {
              const row = integrations.find((candidate) => candidate.provider === item.id)
              const isActive = activeProvider === item.id
              return (
                <button
                  type="button"
                  key={item.id}
                  onClick={() => setSelected(item.id)}
                  className={`rounded-xl border p-4 text-left transition hover:border-foreground/30 ${selected === item.id ? "border-primary ring-1 ring-primary" : ""}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div><div className="font-semibold">{item.name}</div><p className="mt-1 text-xs text-muted-foreground">{item.shortDescription}</p></div>
                    {isActive && <Badge>Attivo</Badge>}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1">
                    {row?.last_check_status === "ok" && <Badge variant="secondary">API verificata</Badge>}
                    {row?.last_check_status === "guided" && <Badge variant="outline">Guida</Badge>}
                    {row?.last_check_status === "bridge_required" && <Badge variant="outline">Bridge</Badge>}
                    {row?.last_check_status === "error" && <Badge variant="destructive">Da correggere</Badge>}
                  </div>
                </button>
              )
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2"><Phone className="h-5 w-5" />{provider.name}</CardTitle>
                <CardDescription className="mt-1 max-w-3xl">{provider.connectionNote}</CardDescription>
              </div>
              <Dialog>
                <DialogTrigger asChild><Button variant="outline">Guida alla configurazione</Button></DialogTrigger>
                <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
                  <DialogHeader><DialogTitle>Configurare {provider.name}</DialogTitle><DialogDescription>{provider.guide.intro}</DialogDescription></DialogHeader>
                  <ol className="space-y-4">
                    {provider.guide.steps.map((step, index) => (
                      <li key={`${step.title}-${index}`} className="flex gap-3 rounded-lg border p-4">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">{index + 1}</div>
                        <div className="space-y-1"><div className="font-medium">{step.title}</div><p className="text-sm text-muted-foreground">{step.body}</p>{step.url && <a className="inline-flex items-center gap-1 text-sm font-medium underline" href={step.url} target="_blank" rel="noreferrer">{step.linkLabel || "Apri guida ufficiale"}<ExternalLink className="h-3 w-3" /></a>}</div>
                      </li>
                    ))}
                  </ol>
                  {provider.guide.screenshots.length > 0 && (
                    <div className="space-y-4"><h3 className="font-semibold">Schermate ufficiali</h3>{provider.guide.screenshots.map((shot) => <figure key={shot.src} className="overflow-hidden rounded-xl border"><a href={shot.sourceUrl} target="_blank" rel="noreferrer"><Image src={shot.src} alt={shot.alt} width={1200} height={760} className="h-auto w-full object-contain" unoptimized /></a><figcaption className="border-t p-3 text-xs text-muted-foreground">{shot.caption} · clicca l'immagine per aprire la fonte ufficiale.</figcaption></figure>)}</div>
                  )}
                  <div className="space-y-2"><h3 className="font-semibold">Documentazione ufficiale</h3>{provider.guide.officialDocs.map((doc) => <a key={doc.url} className="flex items-center gap-2 text-sm underline" href={doc.url} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" />{doc.label}</a>)}</div>
                </DialogContent>
              </Dialog>
            </div>
            <div className="flex flex-wrap gap-2 pt-2">
              {capabilityLabel(provider.capabilities.automaticCheck, "Verifica automatica", "Verifica guidata")}
              {capabilityLabel(provider.capabilities.clickToCall, "Click-to-call", "Click-to-call non attivo")}
              {capabilityLabel(provider.capabilities.inboundEvents, "API/eventi disponibili", "Eventi da integrare")}
              {capabilityLabel(provider.capabilities.voiceAgent, "Voice Agent", "Voice Agent non collaudato")}
            </div>
          </CardHeader>
          <CardContent className="space-y-5">
            {activeProvider && activeProvider !== selected && <Alert><AlertTriangle className="h-4 w-4" /><AlertTitle>Stai preparando un cambio di centralino</AlertTitle><AlertDescription>Il centralino attuale resta attivo finche non premi il pulsante di salvataggio qui sotto.</AlertDescription></Alert>}

            {provider.fields.length > 0 ? (
              <div className="grid gap-4 sm:grid-cols-2">
                {provider.fields.map((field) => (
                  <div key={field.storage} className={field.storage === "base_url" ? "sm:col-span-2" : ""}>
                    <Label htmlFor={`field-${field.storage}`}>{field.label}{field.required ? " *" : ""}</Label>
                    <Input
                      id={`field-${field.storage}`}
                      className="mt-1"
                      type={field.secret ? "password" : "text"}
                      value={valueOf(field.storage)}
                      onChange={(event) => updateField(field.storage, event.target.value)}
                      placeholder={field.secret && selectedIntegration?.has_client_secret ? selectedIntegration.credentials_preview.client_secret || "Gia salvato: lascia vuoto per non cambiarlo" : field.placeholder}
                    />
                    <p className="mt-1 text-xs text-muted-foreground">{field.help}</p>
                  </div>
                ))}
              </div>
            ) : (
              <Alert><Settings2 className="h-4 w-4" /><AlertTitle>Configurazione guidata</AlertTitle><AlertDescription>Per {provider.name} non raccogliamo ancora credenziali: prima serve il collaudo OAuth/bridge con un tenant reale. Puoi comunque selezionare il centralino e seguire la guida senza creare una falsa connessione.</AlertDescription></Alert>
            )}

            {selectedIntegration?.last_check_status === "error" && selectedIntegration.last_check_error && <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertTitle>Ultima verifica non riuscita</AlertTitle><AlertDescription>{selectedIntegration.last_check_error}</AlertDescription></Alert>}
            {selectedIntegration?.last_check_status === "ok" && <Alert><CheckCircle2 className="h-4 w-4" /><AlertTitle>Connessione verificata</AlertTitle><AlertDescription>L'ultima verifica automatica del provider e riuscita.</AlertDescription></Alert>}

            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void save()} disabled={saving}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                {activeProvider === selected ? "Salva e verifica" : "Imposta come centralino attivo"}
              </Button>
              {selected === "3cx" && activeProvider === "3cx" && (
                <Button variant="outline" asChild><Link href="/admin/channels/phone/3cx"><Settings2 className="mr-2 h-4 w-4" />Configurazione avanzata 3CX</Link></Button>
              )}
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
