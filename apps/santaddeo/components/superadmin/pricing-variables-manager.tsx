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
  Pencil,
  Trash2,
  Plus,
  Save,
  Eye,
  EyeOff,
  Variable,
  GripVertical,
  Search,
  Info,
} from "lucide-react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

interface PricingVariable {
  id: string
  variable_key: string
  label: string
  description: string | null
  category: string
  data_type: string
  unit: string | null
  min_value: number | null
  max_value: number | null
  default_value: string | null
  weight_min: number
  weight_max: number
  default_weight: number
  is_active: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

const CATEGORIES = [
  { value: "demand", label: "Domanda" },
  { value: "supply", label: "Offerta" },
  { value: "market", label: "Mercato" },
  { value: "temporal", label: "Temporale" },
  { value: "external", label: "Esterno" },
  { value: "general", label: "Generale" },
]

const DATA_TYPES = [
  { value: "numeric", label: "Numerico" },
  { value: "percentage", label: "Percentuale" },
  { value: "boolean", label: "Si/No" },
  { value: "text", label: "Testo" },
]

const CATEGORY_COLORS: Record<string, string> = {
  demand: "bg-blue-100 text-blue-800",
  supply: "bg-emerald-100 text-emerald-800",
  market: "bg-amber-100 text-amber-800",
  temporal: "bg-violet-100 text-violet-800",
  external: "bg-rose-100 text-rose-800",
  general: "bg-gray-100 text-gray-800",
}

const EMPTY_FORM: Omit<PricingVariable, "id" | "created_at" | "updated_at"> = {
  variable_key: "",
  label: "",
  description: "",
  category: "general",
  data_type: "numeric",
  unit: "",
  min_value: null,
  max_value: null,
  default_value: "",
  weight_min: 0,
  weight_max: 10,
  default_weight: 5,
  is_active: true,
  sort_order: 0,
}

export function PricingVariablesManager() {
  const [variables, setVariables] = useState<PricingVariable[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [editingItem, setEditingItem] = useState<PricingVariable | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [filterCategory, setFilterCategory] = useState<string>("all")
  const [filterStatus, setFilterStatus] = useState<string>("all")
  const [searchQuery, setSearchQuery] = useState("")
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

  const fetchVariables = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await fetch("/api/superadmin/pricing-variables")
      if (res.ok) {
        const data = await res.json()
        setVariables(data.variables || [])
      }
    } catch (error) {
      console.error("Error fetching pricing variables:", error)
    }
    setIsLoading(false)
  }, [])

  useEffect(() => {
    fetchVariables()
  }, [fetchVariables])

  const openCreateDialog = () => {
    setIsCreating(true)
    setEditingItem(null)
    setForm({ ...EMPTY_FORM })
    setIsDialogOpen(true)
  }

  const openEditDialog = (variable: PricingVariable) => {
    setIsCreating(false)
    setEditingItem(variable)
    setForm({
      variable_key: variable.variable_key,
      label: variable.label,
      description: variable.description || "",
      category: variable.category,
      data_type: variable.data_type,
      unit: variable.unit || "",
      min_value: variable.min_value,
      max_value: variable.max_value,
      default_value: variable.default_value || "",
      weight_min: variable.weight_min,
      weight_max: variable.weight_max,
      default_weight: variable.default_weight,
      is_active: variable.is_active,
      sort_order: variable.sort_order,
    })
    setIsDialogOpen(true)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      if (isCreating) {
        const res = await fetch("/api/superadmin/pricing-variables", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        })
        if (!res.ok) {
          const err = await res.json()
          alert(err.error || "Errore nella creazione")
          setSaving(false)
          return
        }
      } else if (editingItem) {
        const res = await fetch(`/api/superadmin/pricing-variables/${editingItem.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        })
        if (!res.ok) {
          const err = await res.json()
          alert(err.error || "Errore nel salvataggio")
          setSaving(false)
          return
        }
      }
      setIsDialogOpen(false)
      await fetchVariables()
    } catch (error) {
      console.error("Error saving:", error)
      alert("Errore di rete")
    }
    setSaving(false)
  }

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/superadmin/pricing-variables/${id}`, {
        method: "DELETE",
      })
      if (!res.ok) {
        const err = await res.json()
        alert(err.error || "Errore nell'eliminazione")
        return
      }
      setDeleteConfirmId(null)
      await fetchVariables()
    } catch (error) {
      console.error("Error deleting:", error)
    }
  }

  const handleToggleActive = async (variable: PricingVariable) => {
    try {
      await fetch(`/api/superadmin/pricing-variables/${variable.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !variable.is_active }),
      })
      await fetchVariables()
    } catch (error) {
      console.error("Error toggling:", error)
    }
  }

  const filtered = variables.filter((v) => {
    if (filterCategory !== "all" && v.category !== filterCategory) return false
    if (filterStatus === "active" && !v.is_active) return false
    if (filterStatus === "inactive" && v.is_active) return false
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      return (
        v.label.toLowerCase().includes(q) ||
        v.variable_key.toLowerCase().includes(q) ||
        (v.description || "").toLowerCase().includes(q)
      )
    }
    return true
  })

  const groupedByCategory = filtered.reduce<Record<string, PricingVariable[]>>((acc, v) => {
    if (!acc[v.category]) acc[v.category] = []
    acc[v.category].push(v)
    return acc
  }, {})

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Variable className="h-5 w-5" />
                Variabili di Pricing
              </CardTitle>
              <CardDescription>
                Gestisci le variabili che concorrono alla determinazione del prezzo.
                Gli admin di struttura potranno attivare quelle rilevanti per il loro hotel.
              </CardDescription>
            </div>
            <Button onClick={openCreateDialog}>
              <Plus className="h-4 w-4 mr-2" />
              Nuova Variabile
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3 mb-6">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Cerca variabile..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={filterCategory} onValueChange={setFilterCategory}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Categoria" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutte le categorie</SelectItem>
                {CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Stato" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti</SelectItem>
                <SelectItem value="active">Attive</SelectItem>
                <SelectItem value="inactive">Disattivate</SelectItem>
              </SelectContent>
            </Select>
            <Badge variant="secondary" className="text-xs">
              {filtered.length} / {variables.length} variabili
            </Badge>
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              Nessuna variabile trovata
            </div>
          ) : (
            <div className="space-y-8">
              {Object.entries(groupedByCategory)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([category, vars]) => {
                  const catLabel =
                    CATEGORIES.find((c) => c.value === category)?.label || category
                  const catColor = CATEGORY_COLORS[category] || CATEGORY_COLORS.general
                  return (
                    <div key={category}>
                      <div className="flex items-center gap-2 mb-3">
                        <Badge className={catColor}>{catLabel}</Badge>
                        <span className="text-xs text-muted-foreground">
                          {vars.length} variabil{vars.length === 1 ? "e" : "i"}
                        </span>
                      </div>
                      <div className="space-y-2">
                        {vars.map((variable) => (
                          <div
                            key={variable.id}
                            className={`flex items-start gap-4 p-4 rounded-lg border transition-colors ${
                              variable.is_active
                                ? "bg-card border-border"
                                : "bg-muted/50 border-muted opacity-60"
                            }`}
                          >
                            <GripVertical className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />

                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="font-medium text-sm">{variable.label}</span>
                                <Badge variant="outline" className="text-xs font-mono">
                                  {variable.variable_key}
                                </Badge>
                                <Badge variant="outline" className="text-xs">
                                  {DATA_TYPES.find((d) => d.value === variable.data_type)?.label ||
                                    variable.data_type}
                                </Badge>
                                {variable.unit && (
                                  <Badge variant="secondary" className="text-xs">
                                    {variable.unit}
                                  </Badge>
                                )}
                              </div>
                              {variable.description && (
                                <p className="text-xs text-muted-foreground line-clamp-2">
                                  {variable.description}
                                </p>
                              )}
                              <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                                <span>
                                  Peso: {variable.weight_min}-{variable.weight_max} (default:{" "}
                                  {variable.default_weight})
                                </span>
                                {variable.min_value !== null && (
                                  <span>Min: {variable.min_value}</span>
                                )}
                                {variable.max_value !== null && (
                                  <span>Max: {variable.max_value}</span>
                                )}
                                <span>Ordine: {variable.sort_order}</span>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => handleToggleActive(variable)}
                                title={variable.is_active ? "Disattiva" : "Attiva"}
                              >
                                {variable.is_active ? (
                                  <Eye className="h-4 w-4 text-emerald-600" />
                                ) : (
                                  <EyeOff className="h-4 w-4 text-muted-foreground" />
                                )}
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => openEditDialog(variable)}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              {deleteConfirmId === variable.id ? (
                                <div className="flex items-center gap-1">
                                  <Button
                                    variant="destructive"
                                    size="sm"
                                    className="h-8 text-xs"
                                    onClick={() => handleDelete(variable.id)}
                                  >
                                    Conferma
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 text-xs"
                                    onClick={() => setDeleteConfirmId(null)}
                                  >
                                    Annulla
                                  </Button>
                                </div>
                              ) : (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-destructive hover:text-destructive"
                                  onClick={() => setDeleteConfirmId(variable.id)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {isCreating ? "Nuova Variabile di Pricing" : "Modifica Variabile"}
            </DialogTitle>
            <DialogDescription>
              {isCreating
                ? "Aggiungi una nuova variabile che concorrera alla determinazione del prezzo."
                : `Modifica: ${editingItem?.label}`}
            </DialogDescription>
          </DialogHeader>

          {/* Spiegazione logica K */}
          <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 text-xs text-indigo-800 space-y-1.5">
            <p className="font-semibold">Come funziona il sistema Coefficiente K</p>
            <p>Ogni variabile rappresenta un <strong>fattore di pressione</strong> sulla domanda. Nella tabella prezzi il RM assegna un valore 0-10 per ogni giorno:</p>
            <ul className="list-disc list-inside space-y-0.5 ml-1">
              <li><strong>0-4</strong> = pressione bassa (smorza incrementi di prezzo fino a -30%)</li>
              <li><strong>5</strong> = neutro (nessun effetto, K=0)</li>
              <li><strong>6-10</strong> = pressione alta (amplifica incrementi fino a +30%)</li>
            </ul>
            <p>Il <strong>peso default</strong> serve sia come valore iniziale nella griglia sia come importanza relativa nel calcolo della media pesata K.</p>
          </div>

          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <Label htmlFor="variable_key">Chiave Variabile *</Label>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild><Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" /></TooltipTrigger>
                      <TooltipContent side="top" className="max-w-[280px] text-xs">
                        Identificativo tecnico univoco in formato snake_case. Viene usato internamente come chiave nel database dei parametri. Non visibile al RM.
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <Input
                  id="variable_key"
                  placeholder="es. occupancy_rate"
                  value={form.variable_key}
                  onChange={(e) => setForm({ ...form, variable_key: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  Identificativo univoco (snake_case)
                </p>
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <Label htmlFor="label">Etichetta *</Label>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild><Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" /></TooltipTrigger>
                      <TooltipContent side="top" className="max-w-[260px] text-xs">
                        Nome visibile nella tabella prezzi come riga editabile. Scegliere un nome breve e chiaro (es. &quot;Meteo&quot;, &quot;Fiera locale&quot;, &quot;Competitor&quot;).
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <Input
                  id="label"
                  placeholder="es. Tasso di Occupazione"
                  value={form.label}
                  onChange={(e) => setForm({ ...form, label: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <Label htmlFor="description">Descrizione</Label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild><Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" /></TooltipTrigger>
                    <TooltipContent side="top" className="max-w-[280px] text-xs">
                      Nota interna visibile come tooltip nella tabella prezzi. Spiega al RM come valutare questa variabile (es. &quot;Valutare previsioni meteo: sole=8, pioggia=3&quot;).
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <Textarea
                id="description"
                placeholder="Descrivi come questa variabile influenza il prezzo..."
                value={form.description || ""}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={3}
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="category">Categoria *</Label>
                <Select
                  value={form.category}
                  onValueChange={(v) => setForm({ ...form, category: v })}
                >
                  <SelectTrigger id="category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="data_type">Tipo Dato</Label>
                <Select
                  value={form.data_type}
                  onValueChange={(v) => setForm({ ...form, data_type: v })}
                >
                  <SelectTrigger id="data_type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DATA_TYPES.map((d) => (
                      <SelectItem key={d.value} value={d.value}>
                        {d.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="unit">Unita di misura</Label>
                <Input
                  id="unit"
                  placeholder="es. %, EUR, notti"
                  value={form.unit || ""}
                  onChange={(e) => setForm({ ...form, unit: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="min_value">Valore Minimo</Label>
                <Input
                  id="min_value"
                  type="number"
                  placeholder="opzionale"
                  value={form.min_value ?? ""}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      min_value: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="max_value">Valore Massimo</Label>
                <Input
                  id="max_value"
                  type="number"
                  placeholder="opzionale"
                  value={form.max_value ?? ""}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      max_value: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="default_value">Valore Default</Label>
                <Input
                  id="default_value"
                  placeholder="opzionale"
                  value={form.default_value || ""}
                  onChange={(e) => setForm({ ...form, default_value: e.target.value })}
                />
              </div>
            </div>

            <div className="border rounded-lg p-4 space-y-4 bg-muted/30">
              <div className="flex items-center gap-1.5">
                <h4 className="text-sm font-medium">Configurazione Pesi</h4>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild><Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" /></TooltipTrigger>
                    <TooltipContent side="top" className="max-w-[300px] text-xs">
                      <p className="font-semibold mb-1">Pesi nella formula K</p>
                      <p>Il RM nella tabella prezzi assegna un valore nella scala <strong>Peso Min - Peso Max</strong> (di default 0-10). Il <strong>Peso Default</strong> ha doppia funzione: valore iniziale nella cella e importanza relativa della variabile nel calcolo K. Un peso default di 8 vale il doppio di uno da 4.</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="weight_min">Peso Minimo</Label>
                  <Input
                    id="weight_min"
                    type="number"
                    min={0}
                    value={form.weight_min}
                    onChange={(e) =>
                      setForm({ ...form, weight_min: Number(e.target.value) })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="weight_max">Peso Massimo</Label>
                  <Input
                    id="weight_max"
                    type="number"
                    min={0}
                    value={form.weight_max}
                    onChange={(e) =>
                      setForm({ ...form, weight_max: Number(e.target.value) })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="default_weight">Peso Default</Label>
                  <Input
                    id="default_weight"
                    type="number"
                    min={0}
                    value={form.default_weight}
                    onChange={(e) =>
                      setForm({ ...form, default_weight: Number(e.target.value) })
                    }
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                L'admin di struttura potra impostare il peso tra min e max. Il default
                viene usato come valore iniziale.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="sort_order">Ordine</Label>
                <Input
                  id="sort_order"
                  type="number"
                  min={0}
                  value={form.sort_order}
                  onChange={(e) =>
                    setForm({ ...form, sort_order: Number(e.target.value) })
                  }
                />
              </div>
              <div className="flex items-center gap-3 pt-7">
                <Switch
                  checked={form.is_active}
                  onCheckedChange={(checked) => setForm({ ...form, is_active: checked })}
                />
                <Label>Attiva</Label>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Annulla
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving || !form.variable_key || !form.label || !form.category}
            >
              {saving ? (
                <span className="flex items-center gap-2">
                  <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                  Salvataggio...
                </span>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  {isCreating ? "Crea Variabile" : "Salva Modifiche"}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
