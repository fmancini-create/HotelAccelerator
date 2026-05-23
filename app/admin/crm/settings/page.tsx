"use client"

import { useState, useEffect } from "react"
import useSWR from "swr"
import Link from "next/link"
import { ArrowLeft, Info, Loader2, Save, Tag, Shield, MailQuestion } from "lucide-react"
import { toast } from "sonner"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"

interface AutoCaptureSettings {
  property_id: string
  enabled: boolean
  capture_inbound: boolean
  capture_outbound: boolean
  blacklist_domains: string[]
  blacklist_keywords: string[]
  default_tag: string
}

const fetcher = async (url: string) => {
  const res = await fetch(url, { credentials: "include" })
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`)
  return res.json() as Promise<{ settings: AutoCaptureSettings }>
}

function linesToList(value: string): string[] {
  return value
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
}

export default function CrmAutoCaptureSettingsPage() {
  const { data, error, isLoading, mutate } = useSWR("/api/admin/crm/auto-capture-settings", fetcher, {
    revalidateOnFocus: false,
  })

  const initial = data?.settings
  const [form, setForm] = useState<AutoCaptureSettings | null>(null)
  const [saving, setSaving] = useState(false)

  // Sync local form state with fetched data on first load. This is a pure
  // SWR-cache -> controlled-input sync, not a data fetch, so useEffect is the
  // correct primitive here.
  useEffect(() => {
    if (initial && !form) setForm(initial)
  }, [initial, form])

  if (isLoading || !form) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle>Impossibile caricare le impostazioni</CardTitle>
            <CardDescription>{String(error.message || error)}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  const update = <K extends keyof AutoCaptureSettings>(key: K, value: AutoCaptureSettings[K]) =>
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev))

  const handleSave = async () => {
    if (!form) return
    setSaving(true)
    try {
      const res = await fetch("/api/admin/crm/auto-capture-settings", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: form.enabled,
          capture_inbound: form.capture_inbound,
          capture_outbound: form.capture_outbound,
          blacklist_domains: form.blacklist_domains,
          blacklist_keywords: form.blacklist_keywords,
          default_tag: form.default_tag,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `HTTP ${res.status}`)
      }
      const body = (await res.json()) as { settings: AutoCaptureSettings }
      await mutate({ settings: body.settings }, { revalidate: false })
      setForm(body.settings)
      toast.success("Impostazioni salvate")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Errore durante il salvataggio")
    } finally {
      setSaving(false)
    }
  }

  const masterOff = !form.enabled

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-8">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link href="/admin/crm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            CRM
          </Link>
        </Button>
      </div>

      <header className="space-y-2">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Auto-salvataggio contatti CRM</h1>
          <Badge variant="secondary">Email</Badge>
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Regole per creare automaticamente un contatto CRM quando arriva una email o quando ne invii una. I contatti
          gia esistenti non vengono mai modificati: l&apos;auto-salvataggio e solo additivo.
        </p>
      </header>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Shield className="h-5 w-5 text-primary" />
                Stato funzionalita
              </CardTitle>
              <CardDescription className="mt-1">
                Disattiva globalmente per fermare tutta l&apos;auto-cattura email senza perdere la configurazione.
              </CardDescription>
            </div>
            <Switch
              checked={form.enabled}
              onCheckedChange={(v) => update("enabled", v)}
              aria-label="Abilita auto-salvataggio"
            />
          </div>
        </CardHeader>
      </Card>

      <Card className={masterOff ? "opacity-60" : undefined}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <MailQuestion className="h-5 w-5 text-primary" />
            Sorgenti da catturare
          </CardTitle>
          <CardDescription>
            Per le email in arrivo salviamo il <strong>mittente</strong>. Per le email in uscita salviamo i destinatari
            in <strong>TO</strong>. CC e BCC sono sempre esclusi per evitare rumore.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <ToggleRow
            label="Email in arrivo (mittenti)"
            description="Chi ti scrive viene creato come contatto con tag e source email_inbound."
            checked={form.capture_inbound}
            onChange={(v) => update("capture_inbound", v)}
            disabled={masterOff}
          />
          <Separator />
          <ToggleRow
            label="Email in uscita (destinatari TO)"
            description="Le persone a cui scrivi vengono create come contatti con tag e source email_outbound."
            checked={form.capture_outbound}
            onChange={(v) => update("capture_outbound", v)}
            disabled={masterOff}
          />
        </CardContent>
      </Card>

      <Card className={masterOff ? "opacity-60" : undefined}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Tag className="h-5 w-5 text-primary" />
            Tag applicato ai nuovi contatti
          </CardTitle>
          <CardDescription>
            Utile per filtrare nel CRM i contatti captured automaticamente vs quelli inseriti a mano.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label htmlFor="default_tag">Tag</Label>
            <Input
              id="default_tag"
              value={form.default_tag}
              onChange={(e) => update("default_tag", e.target.value)}
              placeholder="email_auto"
              maxLength={64}
              disabled={masterOff}
            />
          </div>
        </CardContent>
      </Card>

      <Card className={masterOff ? "opacity-60" : undefined}>
        <CardHeader>
          <CardTitle className="text-lg">Blacklist</CardTitle>
          <CardDescription>
            Indirizzi che corrispondono alle regole qui sotto non verranno salvati come contatti CRM (in outbound), o
            salvati come &quot;system&quot; senza tag (in inbound, per non perdere il link alla conversazione).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="blacklist_domains">Domini (uno per riga)</Label>
            <Textarea
              id="blacklist_domains"
              rows={4}
              placeholder={"noreply.com\nsendgrid.net\nmailchimp.com"}
              value={form.blacklist_domains.join("\n")}
              onChange={(e) => update("blacklist_domains", linesToList(e.target.value))}
              disabled={masterOff}
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Match esatto o suffisso. <code className="rounded bg-muted px-1">example.com</code> blocca anche{" "}
              <code className="rounded bg-muted px-1">news.example.com</code>.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="blacklist_keywords">Parole chiave (uno per riga)</Label>
            <Textarea
              id="blacklist_keywords"
              rows={4}
              placeholder={"no-reply\nnoreply\nbounce\nmailer-daemon"}
              value={form.blacklist_keywords.join("\n")}
              onChange={(e) => update("blacklist_keywords", linesToList(e.target.value))}
              disabled={masterOff}
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Match case-insensitive nella parte locale o nell&apos;indirizzo completo.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-start gap-3 rounded-lg border bg-muted/40 p-4 text-sm">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <p className="leading-relaxed text-muted-foreground">
          I contatti <strong>gia presenti</strong> nel CRM restano immutati: nome, tag e note inseriti manualmente non
          vengono mai sovrascritti da questa funzionalita.
        </p>
      </div>

      <div className="sticky bottom-0 flex justify-end gap-2 border-t bg-background/95 py-4 backdrop-blur">
        <Button variant="outline" onClick={() => (initial ? setForm(initial) : undefined)} disabled={saving}>
          Annulla
        </Button>
        <Button onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Salva impostazioni
        </Button>
      </div>
    </div>
  )
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
  disabled,
}: {
  label: string
  description: string
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="space-y-1">
        <p className="text-sm font-medium leading-none">{label}</p>
        <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} aria-label={label} />
    </div>
  )
}
