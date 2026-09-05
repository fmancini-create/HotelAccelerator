"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, Copy, Loader2, Plus, RefreshCw, Save, Sparkles, Trash2, Users } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import {
  SEGMENT_FIELD_DEFINITIONS,
  SEGMENT_OPERATOR_LABELS,
  SYSTEM_SEGMENT_PRESETS,
  describeSegmentConditions,
  normalizeSegmentConditions,
  validateSegmentConditions,
  type SegmentConditions,
  type SegmentField,
  type SegmentRule,
} from "@/lib/crm/segment-engine"

interface SegmentDto {
  id: string
  name: string
  description?: string | null
  segment_type?: string | null
  conditions: unknown
  contact_count?: number | null
  last_computed_at?: string | null
}

function newRule(field: SegmentField = "total_bookings"): SegmentRule {
  const definition = SEGMENT_FIELD_DEFINITIONS.find((item) => item.value === field) ?? SEGMENT_FIELD_DEFINITIONS[0]
  const operator = definition.operators[0]
  return {
    id: `rule-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    field: definition.value,
    operator,
    ...(operator === "is_true" || operator === "is_false" || operator === "is_empty" || operator === "not_empty" || operator === "birthday_this_month"
      ? {}
      : { value: definition.kind === "number" || definition.kind === "currency" ? 1 : "" }),
  }
}

function withClientIds(conditions: SegmentConditions): SegmentConditions {
  return {
    ...conditions,
    rules: conditions.rules.map((rule) => ({ ...rule, id: rule.id || newRule(rule.field).id })),
  }
}

function needsValue(operator: SegmentRule["operator"]): boolean {
  return !["is_true", "is_false", "is_empty", "not_empty", "birthday_this_month"].includes(operator)
}

function defaultValueForRule(rule: SegmentRule) {
  const definition = SEGMENT_FIELD_DEFINITIONS.find((item) => item.value === rule.field)
  if (!definition) return ""
  if (definition.kind === "number" || definition.kind === "currency") return 1
  if (rule.operator === "within_days" || rule.operator === "older_than_days" || rule.operator === "birthday_next_days") return 30
  return ""
}

export function SegmentEditor({ segmentId }: { segmentId?: string }) {
  const router = useRouter()
  const isEditing = Boolean(segmentId)
  const [loading, setLoading] = useState(isEditing)
  const [saving, setSaving] = useState(false)
  const [previewing, setPreviewing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [duplicating, setDuplicating] = useState(false)
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [conditions, setConditions] = useState<SegmentConditions>({
    combinator: "and",
    rules: [newRule("total_bookings")],
  })
  const [previewCount, setPreviewCount] = useState<number | null>(null)
  const [existingCount, setExistingCount] = useState<number | null>(null)
  const [lastComputedAt, setLastComputedAt] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const isSystem = Boolean(conditions.preset)
  const validationErrors = useMemo(() => validateSegmentConditions(conditions), [conditions])

  useEffect(() => {
    if (!segmentId) return
    let cancelled = false

    async function loadSegment() {
      setLoading(true)
      setLoadError(null)
      try {
        const response = await fetch(`/api/admin/crm/segments/${segmentId}`)
        const payload = await response.json().catch(() => null)
        if (!response.ok) throw new Error(payload?.error || "Impossibile caricare il segmento.")
        if (cancelled) return
        const segment = payload as SegmentDto
        setName(segment.name)
        setDescription(segment.description || "")
        setConditions(withClientIds(normalizeSegmentConditions(segment.conditions)))
        setExistingCount(segment.contact_count ?? 0)
        setLastComputedAt(segment.last_computed_at ?? null)
      } catch (error) {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : "Impossibile caricare il segmento.")
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadSegment()
    return () => {
      cancelled = true
    }
  }, [segmentId])

  const updateRule = (ruleId: string | undefined, patch: Partial<SegmentRule>) => {
    setPreviewCount(null)
    setConditions((current) => ({
      ...current,
      rules: current.rules.map((rule) => (rule.id === ruleId ? { ...rule, ...patch } : rule)),
    }))
  }

  const changeRuleField = (rule: SegmentRule, field: SegmentField) => {
    const definition = SEGMENT_FIELD_DEFINITIONS.find((item) => item.value === field) ?? SEGMENT_FIELD_DEFINITIONS[0]
    const operator = definition.operators[0]
    updateRule(rule.id, {
      field,
      operator,
      value: needsValue(operator)
        ? definition.kind === "number" || definition.kind === "currency"
          ? 1
          : ""
        : undefined,
    })
  }

  const changeRuleOperator = (rule: SegmentRule, operator: SegmentRule["operator"]) => {
    updateRule(rule.id, {
      operator,
      value: needsValue(operator) ? rule.value ?? defaultValueForRule({ ...rule, operator }) : undefined,
    })
  }

  const addRule = () => {
    setPreviewCount(null)
    setConditions((current) => ({ ...current, rules: [...current.rules, newRule()] }))
  }

  const removeRule = (ruleId: string | undefined) => {
    setPreviewCount(null)
    setConditions((current) => ({ ...current, rules: current.rules.filter((rule) => rule.id !== ruleId) }))
  }

  const applyPreset = (presetIndex: number) => {
    const preset = SYSTEM_SEGMENT_PRESETS[presetIndex]
    const normalized = withClientIds(normalizeSegmentConditions(preset.conditions))
    if (!isSystem) delete normalized.preset
    setName(isEditing ? name : preset.name)
    setDescription(preset.description)
    setConditions(normalized)
    setPreviewCount(null)
  }

  const handlePreview = async () => {
    if (validationErrors.length > 0) {
      toast.error(validationErrors[0])
      return
    }
    setPreviewing(true)
    try {
      const response = await fetch("/api/admin/crm/segments/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conditions }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.error || "Impossibile calcolare l'anteprima.")
      setPreviewCount(payload.count ?? 0)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Impossibile calcolare l'anteprima.")
    } finally {
      setPreviewing(false)
    }
  }

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Inserisci un nome per il segmento.")
      return
    }
    if (validationErrors.length > 0) {
      toast.error(validationErrors[0])
      return
    }

    setSaving(true)
    try {
      const response = await fetch(segmentId ? `/api/admin/crm/segments/${segmentId}` : "/api/admin/crm/segments", {
        method: segmentId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
          segment_type: "dynamic",
          conditions,
        }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.error || "Impossibile salvare il segmento.")
      toast.success(segmentId ? "Segmento aggiornato." : "Segmento creato.")
      router.push("/admin/crm?tab=segments")
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Impossibile salvare il segmento.")
    } finally {
      setSaving(false)
    }
  }

  const handleDuplicate = async () => {
    if (!segmentId) return
    setDuplicating(true)
    try {
      const duplicatedConditions = { ...conditions }
      delete duplicatedConditions.preset
      const response = await fetch("/api/admin/crm/segments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `Copia di ${name}`.slice(0, 120),
          description,
          segment_type: "dynamic",
          conditions: duplicatedConditions,
        }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.error || "Impossibile duplicare il segmento.")
      toast.success("Segmento duplicato.")
      router.push(`/admin/crm/segments/${payload.id}/edit`)
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Impossibile duplicare il segmento.")
    } finally {
      setDuplicating(false)
    }
  }

  const handleDelete = async () => {
    if (!segmentId || isSystem) return
    setDeleting(true)
    try {
      const response = await fetch(`/api/admin/crm/segments/${segmentId}`, { method: "DELETE" })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.error || "Impossibile eliminare il segmento.")
      toast.success("Segmento eliminato.")
      router.push("/admin/crm?tab=segments")
      router.refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Impossibile eliminare il segmento.")
    } finally {
      setDeleting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[360px] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (loadError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Impossibile aprire il segmento</CardTitle>
          <CardDescription>{loadError}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <Link href="/admin/crm?tab=segments">Torna ai segmenti</Link>
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <Button variant="ghost" size="sm" asChild className="-ml-2">
            <Link href="/admin/crm?tab=segments">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Segmenti CRM
            </Link>
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold">{isEditing ? "Modifica segmento" : "Nuovo segmento"}</h1>
            {isSystem && <Badge variant="secondary">Segmento di sistema</Badge>}
          </div>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Crea gruppi dinamici che si aggiornano dai dati reali del CRM. Usa E quando tutte le condizioni devono essere vere,
            oppure O quando ne basta una.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isEditing && (
            <Button variant="outline" onClick={handleDuplicate} disabled={duplicating}>
              {duplicating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Copy className="mr-2 h-4 w-4" />}
              Duplica
            </Button>
          )}
          {isEditing && !isSystem && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" className="text-destructive hover:text-destructive">
                  <Trash2 className="mr-2 h-4 w-4" />
                  Elimina
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Eliminare questo segmento?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Verrà eliminata la segmentazione, non i contatti presenti nel CRM. L'operazione non è reversibile.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Annulla</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete} disabled={deleting}>
                    {deleting ? "Eliminazione..." : "Elimina segmento"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          <Button onClick={handleSave} disabled={saving || validationErrors.length > 0 || !name.trim()}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Salva segmento
          </Button>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Identità del segmento</CardTitle>
              <CardDescription>Il nome sarà quello mostrato nelle card, nei filtri e nelle campagne.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="segment-name">Nome</Label>
                <Input
                  id="segment-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Es. Ospiti spa alto valore"
                  maxLength={120}
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="segment-description">Descrizione</Label>
                <Textarea
                  id="segment-description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Spiega in una riga a cosa serve questo segmento"
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle>Regole</CardTitle>
                  <CardDescription>Combina fino a 25 condizioni usando dati già presenti nel CRM.</CardDescription>
                </div>
                <Select
                  value={conditions.combinator}
                  onValueChange={(value) => {
                    setPreviewCount(null)
                    setConditions((current) => ({ ...current, combinator: value === "or" ? "or" : "and" }))
                  }}
                >
                  <SelectTrigger className="w-[210px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="and">Tutte vere (E)</SelectItem>
                    <SelectItem value="or">Almeno una vera (O)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {conditions.rules.map((rule, index) => {
                const definition = SEGMENT_FIELD_DEFINITIONS.find((item) => item.value === rule.field) ?? SEGMENT_FIELD_DEFINITIONS[0]
                const showValue = needsValue(rule.operator)
                return (
                  <div key={rule.id || `${rule.field}-${index}`} className="rounded-xl border bg-card p-4">
                    <div className="mb-3 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <Badge variant="outline">{index + 1}</Badge>
                        {index > 0 && <span className="text-muted-foreground">{conditions.combinator === "and" ? "E" : "O"}</span>}
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeRule(rule.id)}
                        disabled={conditions.rules.length === 1}
                        aria-label="Rimuovi regola"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="grid gap-3 lg:grid-cols-[1.2fr_1fr_1.2fr]">
                      <div className="space-y-1.5">
                        <Label>Campo</Label>
                        <Select value={rule.field} onValueChange={(value) => changeRuleField(rule, value as SegmentField)}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="max-h-[360px]">
                            {SEGMENT_FIELD_DEFINITIONS.map((item) => (
                              <SelectItem key={item.value} value={item.value}>
                                {item.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">{definition.description}</p>
                      </div>
                      <div className="space-y-1.5">
                        <Label>Condizione</Label>
                        <Select
                          value={rule.operator}
                          onValueChange={(value) => changeRuleOperator(rule, value as SegmentRule["operator"])}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {definition.operators.map((operator) => (
                              <SelectItem key={operator} value={operator}>
                                {SEGMENT_OPERATOR_LABELS[operator]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label>Valore</Label>
                        {!showValue ? (
                          <div className="flex h-10 items-center rounded-md border bg-muted/40 px-3 text-sm text-muted-foreground">
                            Nessun valore richiesto
                          </div>
                        ) : definition.kind === "select" && rule.operator !== "in" ? (
                          <Select
                            value={String(rule.value ?? "")}
                            onValueChange={(value) => updateRule(rule.id, { value })}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Seleziona" />
                            </SelectTrigger>
                            <SelectContent>
                              {(definition.options ?? []).map((option) => (
                                <SelectItem key={option.value} value={option.value}>
                                  {option.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Input
                            type={
                              definition.kind === "number" ||
                              definition.kind === "currency" ||
                              rule.operator === "within_days" ||
                              rule.operator === "older_than_days" ||
                              rule.operator === "birthday_next_days"
                                ? "number"
                                : "text"
                            }
                            min={0}
                            step={definition.kind === "currency" ? "0.01" : "1"}
                            value={typeof rule.value === "number" || typeof rule.value === "string" ? rule.value : ""}
                            onChange={(event) => {
                              const numeric = event.currentTarget.type === "number"
                              updateRule(rule.id, {
                                value: numeric && event.currentTarget.value !== "" ? Number(event.currentTarget.value) : event.currentTarget.value,
                              })
                            }}
                            placeholder={rule.operator === "in" ? "Valori separati da virgola" : "Inserisci valore"}
                          />
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}

              <Button type="button" variant="outline" onClick={addRule} disabled={conditions.rules.length >= 25}>
                <Plus className="mr-2 h-4 w-4" />
                Aggiungi regola
              </Button>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles className="h-4 w-4" />
                Modelli rapidi
              </CardTitle>
              <CardDescription>Parti dai segmenti più usati e poi personalizzali.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {SYSTEM_SEGMENT_PRESETS.map((preset, index) => (
                <Button key={preset.conditions.preset} variant="outline" className="h-auto w-full justify-start py-3 text-left" onClick={() => applyPreset(index)}>
                  <span>
                    <span className="block font-medium">{preset.name}</span>
                    <span className="block text-xs font-normal text-muted-foreground">{preset.description}</span>
                  </span>
                </Button>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="h-4 w-4" />
                Anteprima
              </CardTitle>
              <CardDescription>Conta i contatti reali che rispettano le regole prima di salvare.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border bg-muted/30 p-4">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Contatti trovati</p>
                <p className="mt-1 text-3xl font-bold">{previewCount ?? existingCount ?? "—"}</p>
                {lastComputedAt && previewCount === null && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Ultimo calcolo {new Date(lastComputedAt).toLocaleString("it-IT")}
                  </p>
                )}
              </div>
              <Button variant="outline" className="w-full" onClick={handlePreview} disabled={previewing || validationErrors.length > 0}>
                {previewing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                Calcola anteprima
              </Button>
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Logica attuale</p>
                <p className="text-sm leading-relaxed">{describeSegmentConditions(conditions)}</p>
              </div>
              {validationErrors.length > 0 && (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                  {validationErrors[0]}
                </div>
              )}
            </CardContent>
          </Card>

          {isSystem && (
            <Card className="border-dashed">
              <CardHeader>
                <CardTitle className="text-base">Card di sistema</CardTitle>
                <CardDescription>
                  Puoi cambiare nome, descrizione e regole. Non può essere eliminata, così il CRM conserva sempre i segmenti base.
                </CardDescription>
              </CardHeader>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
