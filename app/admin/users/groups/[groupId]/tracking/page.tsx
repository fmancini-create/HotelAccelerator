"use client"

import { useState, useEffect, use } from "react"
import Link from "next/link"
import { ArrowLeft, Brain, Mail, MessageSquare, Phone, Plus, Trash2, AlertTriangle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { AdminHeader } from "@/components/admin/admin-header"
import { Switch } from "@/components/ui/switch"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { TrackingField, TrackingPreset, FieldType } from "@/lib/demand/fields"

interface Mailbox {
  id: string
  email_address: string
  display_name: string | null
}

const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  text: "Testo",
  date: "Data",
  number: "Numero",
  enum: "Scelta fra opzioni",
  boolean: "Sì / No",
}

const KIND_LABELS: Record<string, string> = {
  whatsapp: "WhatsApp",
  telegram: "Telegram",
  chat: "Chat sul sito",
}

export default function GroupTrackingPage({ params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = use(params)

  const [groupName, setGroupName] = useState("")
  const [presets, setPresets] = useState<TrackingPreset[]>([])
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([])
  const [messagingKinds, setMessagingKinds] = useState<string[]>([])
  const [extractionCount, setExtractionCount] = useState(0)

  const [enabled, setEnabled] = useState(false)
  const [preset, setPreset] = useState("libero")
  const [fields, setFields] = useState<TrackingField[]>([])
  const [emailIds, setEmailIds] = useState<string[]>([])
  const [kinds, setKinds] = useState<string[]>([])
  const [includePhone, setIncludePhone] = useState(false)
  const [savedFields, setSavedFields] = useState<string>("[]")

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null)

  useEffect(() => {
    load()
  }, [groupId])

  async function load() {
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/groups/${groupId}/tracking`)
      if (!res.ok) throw new Error((await res.json()).error ?? "Lettura non riuscita")
      const data = await res.json()
      setGroupName(data.group?.name ?? "")
      setPresets(data.presets ?? [])
      setMailboxes(data.mailboxes ?? [])
      setMessagingKinds(data.messagingKinds ?? [])
      setExtractionCount(data.extractionCount ?? 0)
      if (data.config) {
        setEnabled(Boolean(data.config.is_enabled))
        setPreset(data.config.preset ?? "libero")
        setFields(data.config.fields ?? [])
        setSavedFields(JSON.stringify(data.config.fields ?? []))
        setEmailIds(data.config.sources?.email_channel_ids ?? [])
        setKinds(data.config.sources?.messaging_kinds ?? [])
        setIncludePhone(Boolean(data.config.sources?.include_phone))
      }
    } catch (e) {
      setMessage({ kind: "error", text: e instanceof Error ? e.message : "Errore" })
    } finally {
      setLoading(false)
    }
  }

  function applyPreset(key: string) {
    setPreset(key)
    const found = presets.find((p) => p.key === key)
    if (found) setFields(found.fields)
  }

  function updateField(index: number, patch: Partial<TrackingField>) {
    setFields((prev) => prev.map((f, i) => (i === index ? { ...f, ...patch } : f)))
  }

  async function save() {
    setSaving(true)
    setMessage(null)
    try {
      const res = await fetch(`/api/admin/groups/${groupId}/tracking`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          is_enabled: enabled,
          preset,
          fields,
          sources: { email_channel_ids: emailIds, messaging_kinds: kinds, include_phone: includePhone },
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Salvataggio non riuscito")
      setSavedFields(JSON.stringify(data.config?.fields ?? []))
      setMessage({
        kind: "ok",
        text: data.fieldsChanged
          ? "Salvato. I campi sono cambiati: le conversazioni verranno riesaminate con le domande nuove."
          : "Salvato.",
      })
    } catch (e) {
      setMessage({ kind: "error", text: e instanceof Error ? e.message : "Errore" })
    } finally {
      setSaving(false)
    }
  }

  const fieldsChanged = JSON.stringify(fields) !== savedFields
  const referenceField = presets.find((p) => p.key === preset)?.referenceField ?? null

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <AdminHeader />
        <main className="mx-auto max-w-4xl px-4 py-8">
          <p className="text-sm text-muted-foreground">Caricamento…</p>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <AdminHeader />
      <main className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-8">
        <div className="flex flex-col gap-3">
          <Link
            href="/admin/users"
            className="flex w-fit items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Gruppi di lavoro
          </Link>
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <Brain className="h-5 w-5 text-primary" aria-hidden="true" />
            </span>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-balance">Cervello di {groupName}</h1>
              <p className="text-sm text-muted-foreground text-pretty">
                Cosa leggere dalle conversazioni di questo reparto, e cosa ricavarne.
              </p>
            </div>
          </div>
        </div>

        {message ? (
          <div
            role="status"
            className={
              message.kind === "ok"
                ? "rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm text-foreground"
                : "rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive"
            }
          >
            {message.text}
          </div>
        ) : null}

        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div className="flex flex-col gap-1">
              <CardTitle className="text-base">Cervello attivo</CardTitle>
              <CardDescription className="text-pretty">
                Da spento non legge e non spende nulla. Le estrazioni già fatte restano.
              </CardDescription>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} aria-label="Attiva il cervello per questo gruppo" />
          </CardHeader>
          {extractionCount > 0 ? (
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Finora ha ricavato dati da <span className="font-medium text-foreground">{extractionCount}</span>{" "}
                conversazioni.
              </p>
            </CardContent>
          ) : null}
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Cosa fa questo reparto</CardTitle>
            <CardDescription className="text-pretty">
              Sceglierne uno imposta i campi da estrarre. Restano modificabili uno per uno.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid gap-3 sm:grid-cols-2">
              {presets.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => applyPreset(p.key)}
                  aria-pressed={preset === p.key}
                  className={
                    preset === p.key
                      ? "flex flex-col gap-1 rounded-lg border-2 border-primary bg-primary/5 p-4 text-left"
                      : "flex flex-col gap-1 rounded-lg border border-border p-4 text-left hover:border-primary/40"
                  }
                >
                  <span className="text-sm font-medium">{p.label}</span>
                  <span className="text-xs text-muted-foreground text-pretty">{p.description}</span>
                </button>
              ))}
            </div>
            {referenceField ? (
              <p className="text-xs text-muted-foreground text-pretty">
                Il campo <span className="font-mono">{referenceField}</span> colloca la richiesta nel calendario: è la
                data dell&apos;evento chiesto, non quella del messaggio.
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Da dove leggere</CardTitle>
            <CardDescription className="text-pretty">
              Solo le sorgenti scelte. Senza almeno una, il cervello non si accende.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <fieldset className="flex flex-col gap-3">
              <legend className="flex items-center gap-2 text-sm font-medium">
                <Mail className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                Caselle email
              </legend>
              {mailboxes.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nessuna casella collegata a questa struttura.</p>
              ) : (
                mailboxes.map((m) => (
                  <label key={m.id} className="flex items-center gap-3 text-sm">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-border"
                      checked={emailIds.includes(m.id)}
                      onChange={(e) =>
                        setEmailIds((prev) => (e.target.checked ? [...prev, m.id] : prev.filter((x) => x !== m.id)))
                      }
                    />
                    <span>{m.email_address}</span>
                  </label>
                ))
              )}
            </fieldset>

            <fieldset className="flex flex-col gap-3">
              <legend className="flex items-center gap-2 text-sm font-medium">
                <MessageSquare className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                Messaggistica
              </legend>
              {messagingKinds.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nessun canale di messaggistica collegato.</p>
              ) : (
                messagingKinds.map((k) => (
                  <label key={k} className="flex items-center gap-3 text-sm">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-border"
                      checked={kinds.includes(k)}
                      onChange={(e) =>
                        setKinds((prev) => (e.target.checked ? [...prev, k] : prev.filter((x) => x !== k)))
                      }
                    />
                    <span>{KIND_LABELS[k] ?? k}</span>
                  </label>
                ))
              )}
            </fieldset>

            <label className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-border"
                checked={includePhone}
                onChange={(e) => setIncludePhone(e.target.checked)}
              />
              <Phone className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              <span>Chiamate del centralino</span>
            </label>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Cosa ricavare</CardTitle>
            <CardDescription className="text-pretty">
              Ogni campo diventa una domanda posta a ogni conversazione. Il suggerimento è l&apos;istruzione vera:
              scriverlo bene conta più di aggiungere campi.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {fields.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nessun campo. Scegli cosa fa il reparto qui sopra, oppure aggiungine uno.
              </p>
            ) : (
              fields.map((f, i) => (
                <div key={i} className="flex flex-col gap-3 rounded-lg border border-border p-4">
                  <div className="flex flex-wrap items-end gap-3">
                    <div className="flex min-w-40 flex-1 flex-col gap-1.5">
                      <Label htmlFor={`label-${i}`} className="text-xs">
                        Nome
                      </Label>
                      <Input
                        id={`label-${i}`}
                        value={f.label}
                        onChange={(e) => updateField(i, { label: e.target.value })}
                      />
                    </div>
                    <div className="flex min-w-32 flex-col gap-1.5">
                      <Label htmlFor={`key-${i}`} className="text-xs">
                        Chiave
                      </Label>
                      <Input
                        id={`key-${i}`}
                        value={f.key}
                        onChange={(e) => updateField(i, { key: e.target.value })}
                        className="font-mono text-xs"
                      />
                    </div>
                    <div className="flex min-w-40 flex-col gap-1.5">
                      <Label className="text-xs">Tipo</Label>
                      <Select value={f.type} onValueChange={(v) => updateField(i, { type: v as FieldType })}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {(Object.keys(FIELD_TYPE_LABELS) as FieldType[]).map((t) => (
                            <SelectItem key={t} value={t}>
                              {FIELD_TYPE_LABELS[t]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setFields((prev) => prev.filter((_, x) => x !== i))}
                      aria-label={`Togli il campo ${f.label || f.key}`}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor={`hint-${i}`} className="text-xs">
                      Come riconoscerlo
                    </Label>
                    <Input
                      id={`hint-${i}`}
                      value={f.hint ?? ""}
                      placeholder="Es. confermata solo se c'è una conferma esplicita"
                      onChange={(e) => updateField(i, { hint: e.target.value })}
                    />
                  </div>
                  {f.type === "enum" ? (
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor={`opt-${i}`} className="text-xs">
                        Opzioni ammesse, separate da virgola
                      </Label>
                      <Input
                        id={`opt-${i}`}
                        value={(f.options ?? []).join(", ")}
                        onChange={(e) =>
                          updateField(i, {
                            options: e.target.value
                              .split(",")
                              .map((s) => s.trim())
                              .filter(Boolean),
                          })
                        }
                      />
                    </div>
                  ) : null}
                </div>
              ))
            )}

            <Button
              type="button"
              variant="outline"
              className="w-fit bg-transparent"
              onClick={() => setFields((prev) => [...prev, { key: "", label: "", type: "text" }])}
            >
              <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
              Aggiungi un campo
            </Button>
          </CardContent>
        </Card>

        {fieldsChanged && extractionCount > 0 ? (
          <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/40 px-4 py-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm text-muted-foreground text-pretty">
              Hai cambiato i campi: salvando, le {extractionCount} conversazioni già lette verranno riesaminate con le
              domande nuove. Le risposte vecchie restano, ma non vengono più usate.
            </p>
          </div>
        ) : null}

        <div className="flex items-center gap-3">
          <Button onClick={save} disabled={saving}>
            {saving ? "Salvataggio…" : "Salva"}
          </Button>
          {enabled ? <Badge variant="secondary">Attivo</Badge> : <Badge variant="outline">Spento</Badge>}
        </div>
      </main>
    </div>
  )
}
