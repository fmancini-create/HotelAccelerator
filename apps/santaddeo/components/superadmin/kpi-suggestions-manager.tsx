"use client"

import { useEffect, useState, useCallback } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertTriangle,
  CircleAlert,
  CheckCircle2,
  Pencil,
  Trash2,
  Plus,
  Lightbulb,
  Save,
  Eye,
  EyeOff,
} from "lucide-react"

interface KpiSuggestion {
  id: string
  metric_key: string
  severity: string
  label: string
  description: string
  suggestion: string
  is_active: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

const METRIC_KEYS = [
  { value: "revpar", label: "RevPAR" },
  { value: "revpor", label: "RevPOR" },
  { value: "adr", label: "ADR (Tariffa Media)" },
  { value: "occupancy_rate", label: "Tasso Occupazione" },
  { value: "occupancy", label: "Occupazione (alias)" },
  { value: "cancellation_rate", label: "Tasso Cancellazione" },
  { value: "intermediated_revenue_pct", label: "Revenue Intermediato %" },
  { value: "pickup_booking_days", label: "Pick Up Prenotazioni (gg)" },
  { value: "pickup_cancellation_days", label: "Pick Up Cancellazioni (gg)" },
]

const EMPTY_FORM: Omit<KpiSuggestion, "id" | "created_at" | "updated_at"> = {
  metric_key: "",
  severity: "orange",
  label: "",
  description: "",
  suggestion: "",
  is_active: true,
  sort_order: 0,
}

export function KpiSuggestionsManager() {
  const [suggestions, setSuggestions] = useState<KpiSuggestion[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [editingItem, setEditingItem] = useState<KpiSuggestion | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [filterMetric, setFilterMetric] = useState<string>("all")
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const fetchSuggestions = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await fetch("/api/kpi-suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "list_all" }),
      })
      if (res.ok) {
        const data = await res.json()
        setSuggestions(data.suggestions || [])
      }
    } catch (error) {
      console.error("Error fetching suggestions:", error)
    }
    setIsLoading(false)
  }, [])

  useEffect(() => {
    fetchSuggestions()
  }, [fetchSuggestions])

  const openCreate = () => {
    setForm(EMPTY_FORM)
    setEditingItem(null)
    setIsCreating(true)
    setIsDialogOpen(true)
  }

  const openEdit = (item: KpiSuggestion) => {
    setForm({
      metric_key: item.metric_key,
      severity: item.severity,
      label: item.label,
      description: item.description,
      suggestion: item.suggestion,
      is_active: item.is_active,
      sort_order: item.sort_order,
    })
    setEditingItem(item)
    setIsCreating(false)
    setIsDialogOpen(true)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const body: any = { ...form }
      if (editingItem) {
        body.id = editingItem.id
      }

      const res = await fetch("/api/kpi-suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      if (res.ok) {
        setIsDialogOpen(false)
        fetchSuggestions()
      }
    } catch (error) {
      console.error("Error saving suggestion:", error)
    }
    setSaving(false)
  }

  const handleDelete = async (id: string) => {
    if (!confirm("Sei sicuro di voler eliminare questo suggerimento?")) return

    try {
      const res = await fetch(`/api/kpi-suggestions?id=${id}`, { method: "DELETE" })
      if (res.ok) {
        fetchSuggestions()
      }
    } catch (error) {
      console.error("Error deleting suggestion:", error)
    }
  }

  const handleToggleActive = async (item: KpiSuggestion) => {
    try {
      await fetch("/api/kpi-suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: item.id,
          metric_key: item.metric_key,
          severity: item.severity,
          label: item.label,
          description: item.description,
          suggestion: item.suggestion,
          is_active: !item.is_active,
          sort_order: item.sort_order,
        }),
      })
      fetchSuggestions()
    } catch (error) {
      console.error("Error toggling suggestion:", error)
    }
  }

  const getMetricLabel = (key: string) =>
    METRIC_KEYS.find((m) => m.value === key)?.label || key

  const filteredSuggestions =
    filterMetric === "all"
      ? suggestions
      : suggestions.filter((s) => s.metric_key === filterMetric)

  // Group by metric_key
  const grouped: Record<string, KpiSuggestion[]> = {}
  for (const s of filteredSuggestions) {
    if (!grouped[s.metric_key]) grouped[s.metric_key] = []
    grouped[s.metric_key].push(s)
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Lightbulb className="h-5 w-5" />
                Gestione Suggerimenti KPI
              </CardTitle>
              <CardDescription>
                Configura i messaggi e suggerimenti che i tenant vedono quando un semaforo KPI e arancione o rosso.
                Ogni modifica sara visibile in tempo reale nelle dashboard dei tenant.
              </CardDescription>
            </div>
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4 mr-2" />
              Nuovo Suggerimento
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Filtro per KPI */}
          <div className="flex items-center gap-4 mb-6">
            <Label className="text-sm font-medium">Filtra per KPI:</Label>
            <Select value={filterMetric} onValueChange={setFilterMetric}>
              <SelectTrigger className="w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti i KPI</SelectItem>
                {METRIC_KEYS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="ml-auto text-sm text-muted-foreground">
              {filteredSuggestions.length} suggerimenti
            </div>
          </div>

          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-20 bg-muted animate-pulse rounded-lg" />
              ))}
            </div>
          ) : Object.keys(grouped).length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              Nessun suggerimento trovato. Crea il primo.
            </div>
          ) : (
            <div className="space-y-6">
              {Object.entries(grouped)
                .sort(([, a], [, b]) => (a[0]?.sort_order || 0) - (b[0]?.sort_order || 0))
                .map(([metricKey, items]) => (
                  <div key={metricKey} className="space-y-2">
                    <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground border-b pb-2">
                      {getMetricLabel(metricKey)}
                    </h3>
                    {items
                      .sort((a, b) => (a.severity === "orange" ? -1 : 1))
                      .map((item) => (
                        <div
                          key={item.id}
                          className={`rounded-lg border p-4 transition-colors ${
                            !item.is_active
                              ? "opacity-50 bg-muted/30 border-dashed"
                              : item.severity === "red"
                                ? "border-red-200 bg-red-50/50"
                                : "border-orange-200 bg-orange-50/50"
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <div className="flex-shrink-0 mt-0.5">
                              {item.severity === "red" ? (
                                <CircleAlert className="h-5 w-5 text-red-600" />
                              ) : (
                                <AlertTriangle className="h-5 w-5 text-orange-600" />
                              )}
                            </div>

                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="font-semibold text-sm">{item.label}</span>
                                <Badge
                                  variant="outline"
                                  className={
                                    item.severity === "red"
                                      ? "border-red-300 text-red-700"
                                      : "border-orange-300 text-orange-700"
                                  }
                                >
                                  {item.severity === "red" ? "Critico" : "Attenzione"}
                                </Badge>
                                {!item.is_active && (
                                  <Badge variant="secondary">
                                    <EyeOff className="h-3 w-3 mr-1" />
                                    Nascosto
                                  </Badge>
                                )}
                              </div>

                              {item.description && (
                                <p className="text-xs text-muted-foreground mb-2">
                                  {item.description}
                                </p>
                              )}

                              <div
                                className={`text-sm cursor-pointer ${
                                  expandedId === item.id ? "" : "line-clamp-2"
                                }`}
                                onClick={() =>
                                  setExpandedId(expandedId === item.id ? null : item.id)
                                }
                              >
                                <span className="font-medium text-muted-foreground">
                                  Suggerimento:{" "}
                                </span>
                                {item.suggestion}
                              </div>
                              {expandedId !== item.id && item.suggestion.length > 150 && (
                                <button
                                  type="button"
                                  className="text-xs text-blue-600 mt-1"
                                  onClick={() => setExpandedId(item.id)}
                                >
                                  Mostra tutto...
                                </button>
                              )}
                            </div>

                            <div className="flex items-center gap-1 flex-shrink-0">
                              <Switch
                                checked={item.is_active}
                                onCheckedChange={() => handleToggleActive(item)}
                                aria-label={
                                  item.is_active ? "Disattiva suggerimento" : "Attiva suggerimento"
                                }
                              />
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => openEdit(item)}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-red-600 hover:text-red-700"
                                onClick={() => handleDelete(item.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>
                ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog per creare/modificare */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {isCreating ? "Nuovo Suggerimento KPI" : "Modifica Suggerimento KPI"}
            </DialogTitle>
            <DialogDescription>
              {isCreating
                ? "Crea un nuovo suggerimento che apparira nella dashboard dei tenant quando il semaforo KPI non e verde."
                : "Modifica il suggerimento. Le modifiche saranno visibili immediatamente nelle dashboard dei tenant."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="metric_key">KPI / Metrica</Label>
                <Select
                  value={form.metric_key}
                  onValueChange={(v) => setForm({ ...form, metric_key: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Seleziona KPI..." />
                  </SelectTrigger>
                  <SelectContent>
                    {METRIC_KEYS.map((m) => (
                      <SelectItem key={m.value} value={m.value}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="severity">Severita</Label>
                <Select
                  value={form.severity}
                  onValueChange={(v) => setForm({ ...form, severity: v })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="orange">
                      <span className="flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-orange-600" />
                        Attenzione (arancione)
                      </span>
                    </SelectItem>
                    <SelectItem value="red">
                      <span className="flex items-center gap-2">
                        <CircleAlert className="h-4 w-4 text-red-600" />
                        Critico (rosso)
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="label">Titolo Allarme</Label>
              <Input
                id="label"
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
                placeholder="Es: RevPAR sotto target"
              />
              <p className="text-xs text-muted-foreground">
                Titolo breve che appare nella riga dell'allarme nella dashboard.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Descrizione KPI</Label>
              <Textarea
                id="description"
                rows={3}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Es: Il Revenue per Camera Disponibile misura quanto ogni camera genera in media..."
              />
              <p className="text-xs text-muted-foreground">
                Spiegazione del KPI per il tenant. Appare come contesto sopra il suggerimento.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="suggestion">Suggerimento Operativo</Label>
              <Textarea
                id="suggestion"
                rows={6}
                value={form.suggestion}
                onChange={(e) => setForm({ ...form, suggestion: e.target.value })}
                placeholder="Es: Il RevPAR e sotto il target configurato. Ecco alcune azioni suggerite: (1) Analizza il mix di tariffe..."
              />
              <p className="text-xs text-muted-foreground">
                Suggerimento dettagliato con azioni concrete che il tenant puo intraprendere. Questo testo appare nel tooltip della dashboard.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="sort_order">Ordine</Label>
                <Input
                  id="sort_order"
                  type="number"
                  value={form.sort_order}
                  onChange={(e) =>
                    setForm({ ...form, sort_order: Number.parseInt(e.target.value) || 0 })
                  }
                />
              </div>
              <div className="flex items-center gap-3 pt-6">
                <Switch
                  checked={form.is_active}
                  onCheckedChange={(v) => setForm({ ...form, is_active: v })}
                />
                <Label>
                  {form.is_active ? (
                    <span className="flex items-center gap-1">
                      <Eye className="h-4 w-4" /> Visibile ai tenant
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-muted-foreground">
                      <EyeOff className="h-4 w-4" /> Nascosto ai tenant
                    </span>
                  )}
                </Label>
              </div>
            </div>

            {/* Preview */}
            {form.label && form.suggestion && (
              <div className="space-y-2 pt-4 border-t">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                  Anteprima nella dashboard tenant
                </Label>
                <div
                  className={`flex items-center gap-3 rounded-lg border p-3 ${
                    form.severity === "red"
                      ? "border-red-200 bg-red-50"
                      : "border-orange-200 bg-orange-50"
                  }`}
                >
                  <div className="flex-shrink-0">
                    {form.severity === "red" ? (
                      <CircleAlert className="h-4 w-4 text-red-600" />
                    ) : (
                      <AlertTriangle className="h-4 w-4 text-orange-600" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-sm font-medium ${
                        form.severity === "red" ? "text-red-900" : "text-orange-900"
                      }`}
                    >
                      {form.label}
                    </p>
                    <p
                      className={`text-xs ${
                        form.severity === "red" ? "text-red-700" : "text-orange-700"
                      }`}
                    >
                      Valore attuale: 45.2 EUR (esempio)
                    </p>
                  </div>
                  <div className="flex gap-0.5 flex-shrink-0">
                    <div
                      className={`w-2.5 h-2.5 rounded-full ${
                        form.severity === "red" ? "bg-red-500" : "bg-gray-200"
                      }`}
                    />
                    <div
                      className={`w-2.5 h-2.5 rounded-full ${
                        form.severity === "orange" ? "bg-orange-500" : "bg-gray-200"
                      }`}
                    />
                    <div className="w-2.5 h-2.5 rounded-full bg-gray-200" />
                  </div>
                </div>
                <div className="rounded-lg bg-slate-800 text-white p-3 text-sm">
                  <div className="flex items-start gap-2">
                    <Lightbulb className="h-4 w-4 text-amber-400 mt-0.5 flex-shrink-0" />
                    <p>{form.suggestion}</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Annulla
            </Button>
            <Button onClick={handleSave} disabled={saving || !form.metric_key || !form.label || !form.suggestion}>
              <Save className="h-4 w-4 mr-2" />
              {saving ? "Salvataggio..." : isCreating ? "Crea Suggerimento" : "Salva Modifiche"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
