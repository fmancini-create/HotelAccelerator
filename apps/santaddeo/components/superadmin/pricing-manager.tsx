"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Loader2, Plus, Edit, Trash2, DollarSign, Percent } from "lucide-react"
import { toast } from "sonner"

interface PricingConfig {
  id: string
  model_type: "fee" | "commission"
  name: string
  fee_base_value: number
  fee_coefficient_camere: number
  fee_coefficient_appartamenti: number
  fee_coefficient_piazzole: number
  commission_startup_years: number
  commission_yearly_rates: number[]
  commission_post_startup_rate: number
  is_default: boolean
  is_active: boolean
  created_at: string
  updated_at: string
}

const emptyConfig: Partial<PricingConfig> = {
  model_type: "fee",
  name: "",
  fee_base_value: 5.00,
  fee_coefficient_camere: 1.00,
  fee_coefficient_appartamenti: 1.00,
  fee_coefficient_piazzole: 0.50,
  commission_startup_years: 3,
  commission_yearly_rates: [8, 10, 12],
  commission_post_startup_rate: 1.00,
}

export function PricingManager() {
  const [configs, setConfigs] = useState<PricingConfig[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingConfig, setEditingConfig] = useState<Partial<PricingConfig> | null>(null)
  const [yearlyRatesStr, setYearlyRatesStr] = useState("8, 10, 12")

  const fetchConfigs = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await fetch("/api/superadmin/pricing")
      if (res.ok) {
        const json = await res.json()
        setConfigs(json.configs || [])
      }
    } catch {
      toast.error("Errore nel caricamento piani pricing")
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { fetchConfigs() }, [fetchConfigs])

  const openCreate = () => {
    setEditingConfig({ ...emptyConfig })
    setYearlyRatesStr("8, 10, 12")
    setDialogOpen(true)
  }

  const openEdit = (config: PricingConfig) => {
    setEditingConfig({ ...config })
    setYearlyRatesStr((config.commission_yearly_rates || []).join(", "))
    setDialogOpen(true)
  }

  const handleSave = async () => {
    if (!editingConfig?.name?.trim()) {
      toast.error("Il nome del piano e obbligatorio")
      return
    }
    setIsSaving(true)
    try {
      const rates = yearlyRatesStr.split(",").map((s) => Number(s.trim())).filter((n) => !isNaN(n))
      const payload = {
        ...editingConfig,
        commission_yearly_rates: rates,
      }
      const isEditing = !!editingConfig.id
      const res = await fetch("/api/superadmin/pricing", {
        method: isEditing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error)
      }
      toast.success(isEditing ? "Piano aggiornato" : "Piano creato")
      setDialogOpen(false)
      setEditingConfig(null)
      fetchConfigs()
    } catch (err: any) {
      toast.error(err.message || "Errore nel salvataggio")
    } finally {
      setIsSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm("Eliminare questo piano pricing?")) return
    try {
      const res = await fetch(`/api/superadmin/pricing?id=${id}`, { method: "DELETE" })
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error)
      }
      toast.success("Piano eliminato")
      fetchConfigs()
    } catch (err: any) {
      toast.error(err.message || "Errore nell'eliminazione")
    }
  }

  const handleToggleActive = async (config: PricingConfig) => {
    try {
      const res = await fetch("/api/superadmin/pricing", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: config.id, is_active: !config.is_active }),
      })
      if (!res.ok) throw new Error()
      fetchConfigs()
    } catch {
      toast.error("Errore nel cambio stato")
    }
  }

  const feeConfigs = configs.filter((c) => c.model_type === "fee")
  const commissionConfigs = configs.filter((c) => c.model_type === "commission")

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Piani Pricing</h2>
          <p className="text-sm text-muted-foreground">Gestisci i modelli di pricing per Hotel Accelerator</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-2" />
          Nuovo Piano
        </Button>
      </div>

      {/* Fee Models */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <DollarSign className="h-5 w-5 text-blue-600" />
            Modelli Fee Mensile
          </CardTitle>
          <CardDescription>
            Fee calcolata come: base x coefficiente x numero unita
          </CardDescription>
        </CardHeader>
        <CardContent>
          {feeConfigs.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nessun piano fee configurato</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead className="text-right">Base</TableHead>
                  <TableHead className="text-right">Coeff. Camere</TableHead>
                  <TableHead className="text-right">Coeff. Appart.</TableHead>
                  <TableHead className="text-right">Coeff. Piazzole</TableHead>
                  <TableHead className="text-center">Stato</TableHead>
                  <TableHead className="text-right">Azioni</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {feeConfigs.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">
                      {c.name}
                      {c.is_default && <Badge variant="secondary" className="ml-2 text-xs">Default</Badge>}
                    </TableCell>
                    <TableCell className="text-right">{Number(c.fee_base_value).toFixed(2)}</TableCell>
                    <TableCell className="text-right">{Number(c.fee_coefficient_camere).toFixed(2)}</TableCell>
                    <TableCell className="text-right">{Number(c.fee_coefficient_appartamenti).toFixed(2)}</TableCell>
                    <TableCell className="text-right">{Number(c.fee_coefficient_piazzole).toFixed(2)}</TableCell>
                    <TableCell className="text-center">
                      <Switch checked={c.is_active} onCheckedChange={() => handleToggleActive(c)} />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(c)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        {!c.is_default && (
                          <Button variant="ghost" size="sm" onClick={() => handleDelete(c.id)} className="text-red-600 hover:text-red-700">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Commission Models */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Percent className="h-5 w-5 text-emerald-600" />
            Modelli Commissione su Incremento
          </CardTitle>
          <CardDescription>
            Commissione calcolata sull'incremento di fatturato rispetto all'anno precedente
          </CardDescription>
        </CardHeader>
        <CardContent>
          {commissionConfigs.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nessun piano commissione configurato</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead className="text-right">Anni Startup</TableHead>
                  <TableHead className="text-right">% Annuali</TableHead>
                  <TableHead className="text-right">% Post-Startup</TableHead>
                  <TableHead className="text-center">Stato</TableHead>
                  <TableHead className="text-right">Azioni</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {commissionConfigs.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">
                      {c.name}
                      {c.is_default && <Badge variant="secondary" className="ml-2 text-xs">Default</Badge>}
                    </TableCell>
                    <TableCell className="text-right">{c.commission_startup_years}</TableCell>
                    <TableCell className="text-right">
                      {(c.commission_yearly_rates || []).map((r: number) => `${r}%`).join(" / ")}
                    </TableCell>
                    <TableCell className="text-right">{Number(c.commission_post_startup_rate).toFixed(2)}%</TableCell>
                    <TableCell className="text-center">
                      <Switch checked={c.is_active} onCheckedChange={() => handleToggleActive(c)} />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(c)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        {!c.is_default && (
                          <Button variant="ghost" size="sm" onClick={() => handleDelete(c.id)} className="text-red-600 hover:text-red-700">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingConfig?.id ? "Modifica Piano" : "Nuovo Piano Pricing"}</DialogTitle>
            <DialogDescription>
              Configura i parametri del modello di pricing.
            </DialogDescription>
          </DialogHeader>
          {editingConfig && (
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Tipo Modello</Label>
                  <Select
                    value={editingConfig.model_type}
                    onValueChange={(v) => setEditingConfig({ ...editingConfig, model_type: v as "fee" | "commission" })}
                    disabled={!!editingConfig.id}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fee">Fee Mensile</SelectItem>
                      <SelectItem value="commission">Commissione su Incremento</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Nome Piano</Label>
                  <Input
                    value={editingConfig.name || ""}
                    onChange={(e) => setEditingConfig({ ...editingConfig, name: e.target.value })}
                    placeholder="Es. Fee Premium"
                  />
                </div>
              </div>

              {editingConfig.model_type === "fee" && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Valore Base (EUR)</Label>
                      <Input
                        type="number"
                        step="0.50"
                        value={editingConfig.fee_base_value ?? 5}
                        onChange={(e) => setEditingConfig({ ...editingConfig, fee_base_value: Number(e.target.value) })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Coeff. Camere</Label>
                      <Input
                        type="number"
                        step="0.10"
                        value={editingConfig.fee_coefficient_camere ?? 1}
                        onChange={(e) => setEditingConfig({ ...editingConfig, fee_coefficient_camere: Number(e.target.value) })}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Coeff. Appartamenti</Label>
                      <Input
                        type="number"
                        step="0.10"
                        value={editingConfig.fee_coefficient_appartamenti ?? 1}
                        onChange={(e) => setEditingConfig({ ...editingConfig, fee_coefficient_appartamenti: Number(e.target.value) })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Coeff. Piazzole</Label>
                      <Input
                        type="number"
                        step="0.10"
                        value={editingConfig.fee_coefficient_piazzole ?? 0.5}
                        onChange={(e) => setEditingConfig({ ...editingConfig, fee_coefficient_piazzole: Number(e.target.value) })}
                      />
                    </div>
                  </div>
                </>
              )}

              {editingConfig.model_type === "commission" && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Anni Startup</Label>
                      <Input
                        type="number"
                        min="1"
                        max="10"
                        value={editingConfig.commission_startup_years ?? 3}
                        onChange={(e) => setEditingConfig({ ...editingConfig, commission_startup_years: Number(e.target.value) })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>% Post-Startup</Label>
                      <Input
                        type="number"
                        step="0.50"
                        value={editingConfig.commission_post_startup_rate ?? 1}
                        onChange={(e) => setEditingConfig({ ...editingConfig, commission_post_startup_rate: Number(e.target.value) })}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>% Annuali Startup (separate da virgola)</Label>
                    <Input
                      value={yearlyRatesStr}
                      onChange={(e) => setYearlyRatesStr(e.target.value)}
                      placeholder="8, 10, 12"
                    />
                    <p className="text-xs text-muted-foreground">
                      Esempio: "8, 10, 12" per 8% anno 1, 10% anno 2, 12% anno 3
                    </p>
                  </div>
                </>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" className="bg-transparent" onClick={() => setDialogOpen(false)}>
              Annulla
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingConfig?.id ? "Salva Modifiche" : "Crea Piano"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
