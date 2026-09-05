"use client"

import { useEffect, useMemo, useState } from "react"
import { Bot, ChevronDown, Loader2, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "@/components/ui/use-toast"

export type PolicyAction = "skip" | "draft" | "autopilot"

type Settings = {
  automated_action: PolicyAction
  bulk_action: PolicyAction
  transactional_action: PolicyAction
  internal_action: PolicyAction
  unclassified_action: PolicyAction
  trusted_senders: string[]
  blocked_senders: string[]
  blocked_domains: string[]
  internal_domains: string[]
  blocked_subject_keywords: string[]
}

const DEFAULTS: Settings = {
  automated_action: "skip",
  bulk_action: "skip",
  transactional_action: "draft",
  internal_action: "skip",
  unclassified_action: "autopilot",
  trusted_senders: [],
  blocked_senders: [],
  blocked_domains: [],
  internal_domains: [],
  blocked_subject_keywords: [],
}

const ACTION_LABELS: Record<PolicyAction, string> = {
  skip: "Non rispondere",
  draft: "Solo bozza",
  autopilot: "Segui Autopilota",
}

const rows: Array<{ key: keyof Pick<Settings, "automated_action" | "bulk_action" | "transactional_action" | "internal_action" | "unclassified_action">; title: string; description: string }> = [
  { key: "automated_action", title: "Email automatiche", description: "Notifiche, no-reply e mittenti macchina." },
  { key: "bulk_action", title: "Newsletter e comunicazioni massive", description: "Mailing list e messaggi bulk." },
  { key: "transactional_action", title: "Email transazionali / gestionali", description: "Prenotazioni, ricevute, fatture, ordini e tracking." },
  { key: "internal_action", title: "Email interne del personale", description: "Domini aziendali indicati nelle impostazioni avanzate." },
  { key: "unclassified_action", title: "Clienti e messaggi normali", description: "Messaggi che non ricadono nelle categorie precedenti." },
]

function splitList(value: string): string[] {
  return value
    .split(/[\n,;]/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
}

function listText(values: string[]): string {
  return values.join(", ")
}

export function EmailAiResponsePolicyCard() {
  const [form, setForm] = useState<Settings>(DEFAULTS)
  const [saved, setSaved] = useState<Settings>(DEFAULTS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let active = true
    fetch("/api/admin/ai/email-response-policy", { credentials: "include" })
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json()).error || "Impossibile leggere le regole")
        return res.json()
      })
      .then((data) => {
        if (!active) return
        const next = { ...DEFAULTS, ...(data.settings || {}) } as Settings
        setForm(next)
        setSaved(next)
      })
      .catch((error) => {
        if (active) toast({ title: "Regole email non disponibili", description: error.message, variant: "destructive" })
      })
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [])

  const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(saved), [form, saved])

  const save = async () => {
    setSaving(true)
    try {
      const res = await fetch("/api/admin/ai/email-response-policy", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(form),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "Salvataggio non riuscito")
      const next = { ...DEFAULTS, ...(data.settings || form) } as Settings
      setForm(next)
      setSaved(next)
      toast({ title: "Regole salvate", description: "Le nuove regole si applicano alle prossime email ricevute." })
    } catch (error) {
      toast({ title: "Errore", description: error instanceof Error ? error.message : "Impossibile salvare", variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  const setAction = (key: (typeof rows)[number]["key"], value: PolicyAction) =>
    setForm((current) => ({ ...current, [key]: value }))

  const setList = (key: keyof Pick<Settings, "trusted_senders" | "blocked_senders" | "blocked_domains" | "internal_domains" | "blocked_subject_keywords">, value: string) =>
    setForm((current) => ({ ...current, [key]: splitList(value) }))

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-ha-brand-soft text-ha-brand-soft-foreground">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <CardTitle>Regole di risposta email</CardTitle>
            <CardDescription className="mt-1">
              Decidi a quali email l&apos;IA può rispondere. Bounce e autoresponder pericolosi vengono sempre bloccati per evitare loop.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {loading ? (
          <div className="flex items-center gap-2 py-5 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Caricamento regole…</div>
        ) : (
          <>
            <div className="divide-y rounded-lg border">
              {rows.map((row) => (
                <div key={row.key} className="grid gap-3 px-4 py-4 sm:grid-cols-[1fr_190px] sm:items-center">
                  <div>
                    <div className="font-medium text-foreground">{row.title}</div>
                    <div className="mt-0.5 text-sm text-muted-foreground">{row.description}</div>
                  </div>
                  <select
                    aria-label={`Regola ${row.title}`}
                    value={form[row.key]}
                    onChange={(event) => setAction(row.key, event.target.value as PolicyAction)}
                    className="h-10 rounded-md border border-input bg-background px-3 text-sm"
                  >
                    {Object.entries(ACTION_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </div>
              ))}
            </div>

            <details className="group rounded-lg border bg-muted/30">
              <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 font-medium">
                Impostazioni avanzate
                <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
              </summary>
              <div className="grid gap-4 border-t p-4 sm:grid-cols-2">
                <ListField label="Mittenti sempre consentiti" value={listText(form.trusted_senders)} placeholder="booking@partner.com" onChange={(v) => setList("trusted_senders", v)} />
                <ListField label="Mittenti sempre bloccati" value={listText(form.blocked_senders)} placeholder="robot@example.com" onChange={(v) => setList("blocked_senders", v)} />
                <ListField label="Domini bloccati" value={listText(form.blocked_domains)} placeholder="newsletter.example.com" onChange={(v) => setList("blocked_domains", v)} />
                <ListField label="Domini interni" value={listText(form.internal_domains)} placeholder="hotelbelvedere.it" onChange={(v) => setList("internal_domains", v)} />
                <div className="sm:col-span-2">
                  <ListField label="Parole nell'oggetto da non rispondere" value={listText(form.blocked_subject_keywords)} placeholder="report giornaliero, notifica sistema" onChange={(v) => setList("blocked_subject_keywords", v)} />
                </div>
                <p className="sm:col-span-2 text-xs text-muted-foreground">
                  Separa più valori con virgola, punto e virgola o a capo. Le regole di sicurezza contro bounce e autoresponder restano sempre attive.
                </p>
              </div>
            </details>

            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Bot className="h-4 w-4" />
                {dirty ? "Modifiche non ancora applicate" : "Configurazione salvata"}
              </div>
              <Button onClick={save} disabled={!dirty || saving}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Salva regole
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

function ListField({ label, value, placeholder, onChange }: { label: string; value: string; placeholder: string; onChange: (value: string) => void }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
    </div>
  )
}
