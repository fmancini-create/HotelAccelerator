"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Switch } from "@/components/ui/switch"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Plus,
  Edit,
  Trash2,
  Loader2,
  ArrowUp,
  ArrowDown,
  Hotel,
  CreditCard,
  Percent,
  Globe,
  FileText,
  Utensils,
  CheckCircle,
  Search,
  RefreshCw,
} from "lucide-react"
import { toast } from "sonner"

interface RmsCode {
  id: string
  entity_type: string
  code: string
  label: string
  description?: string
  sort_order: number
  is_active: boolean
  created_at: string
}

const ENTITY_TYPES = [
  { key: "room_type", label: "Tipologie Camera", icon: Hotel, color: "bg-blue-500" },
  { key: "rate_plan", label: "Piani Tariffari", icon: Percent, color: "bg-green-500" },
  { key: "channel", label: "Canali di Vendita", icon: Globe, color: "bg-purple-500" },
  { key: "payment_method", label: "Metodi Pagamento", icon: CreditCard, color: "bg-orange-500" },
  { key: "booking_status", label: "Stati Prenotazione", icon: CheckCircle, color: "bg-cyan-500" },
  { key: "document_type", label: "Tipi Documento", icon: FileText, color: "bg-red-500" },
  { key: "meal_plan", label: "Trattamenti Pasti", icon: Utensils, color: "bg-amber-500" },
]

export function RmsCodesManager() {
  const [codes, setCodes] = useState<RmsCode[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [activeTab, setActiveTab] = useState("room_type")
  const [searchTerm, setSearchTerm] = useState("")

  // Dialog states
  const [dialogOpen, setDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [editingCode, setEditingCode] = useState<RmsCode | null>(null)
  const [codeToDelete, setCodeToDelete] = useState<RmsCode | null>(null)

  // Form state
  const [formData, setFormData] = useState({
    code: "",
    label: "",
    description: "",
  })
  const [isSaving, setIsSaving] = useState(false)

  // Load codes
  const loadCodes = async () => {
    setIsLoading(true)
    try {
      const res = await fetch("/api/superadmin/rms-codes")
      if (!res.ok) throw new Error("Errore nel caricamento")
      const data = await res.json()
      setCodes(data.codes || [])
    } catch (error) {
      console.error("Error loading RMS codes:", error)
      toast.error("Errore nel caricamento dei codici")
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadCodes()
  }, [])

  // Get filtered codes for current tab
  const getFilteredCodes = () => {
    return codes
      .filter((c) => c.entity_type === activeTab)
      .filter(
        (c) =>
          searchTerm === "" ||
          c.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
          c.label.toLowerCase().includes(searchTerm.toLowerCase()),
      )
      .sort((a, b) => a.sort_order - b.sort_order)
  }

  // Open dialog for add/edit
  const openDialog = (code?: RmsCode) => {
    if (code) {
      setEditingCode(code)
      setFormData({
        code: code.code,
        label: code.label,
        description: code.description || "",
      })
    } else {
      setEditingCode(null)
      setFormData({ code: "", label: "", description: "" })
    }
    setDialogOpen(true)
  }

  // Save code
  const handleSave = async () => {
    if (!formData.code.trim() || !formData.label.trim()) {
      toast.error("Codice e label sono obbligatori")
      return
    }

    // Validate code format (uppercase, no spaces)
    const cleanCode = formData.code.toUpperCase().replace(/\s/g, "")
    if (cleanCode.length < 2 || cleanCode.length > 10) {
      toast.error("Il codice deve essere tra 2 e 10 caratteri")
      return
    }

    setIsSaving(true)
    try {
      const payload = {
        entity_type: activeTab,
        code: cleanCode,
        label: formData.label.trim(),
        description: formData.description.trim() || null,
      }

      const isEdit = !!editingCode
      const url = isEdit ? `/api/superadmin/rms-codes/${editingCode.id}` : "/api/superadmin/rms-codes"

      const res = await fetch(url, {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || "Errore nel salvataggio")
      }

      toast.success(isEdit ? "Codice aggiornato" : "Codice creato")
      setDialogOpen(false)
      loadCodes()
    } catch (error: any) {
      toast.error(error.message)
    } finally {
      setIsSaving(false)
    }
  }

  // Delete code
  const handleDelete = async () => {
    if (!codeToDelete) return

    setIsSaving(true)
    try {
      const res = await fetch(`/api/superadmin/rms-codes/${codeToDelete.id}`, {
        method: "DELETE",
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || "Errore nell'eliminazione")
      }

      toast.success("Codice eliminato")
      setDeleteDialogOpen(false)
      setCodeToDelete(null)
      loadCodes()
    } catch (error: any) {
      toast.error(error.message)
    } finally {
      setIsSaving(false)
    }
  }

  // Toggle active status
  const handleToggleActive = async (code: RmsCode) => {
    try {
      const res = await fetch(`/api/superadmin/rms-codes/${code.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !code.is_active }),
      })

      if (!res.ok) throw new Error("Errore nell'aggiornamento")

      setCodes((prev) => prev.map((c) => (c.id === code.id ? { ...c, is_active: !c.is_active } : c)))
      toast.success(`Codice ${code.is_active ? "disattivato" : "attivato"}`)
    } catch (error) {
      toast.error("Errore nell'aggiornamento")
    }
  }

  // Move code up/down
  const handleMove = async (code: RmsCode, direction: "up" | "down") => {
    const currentCodes = getFilteredCodes()
    const currentIndex = currentCodes.findIndex((c) => c.id === code.id)
    const swapIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1

    if (swapIndex < 0 || swapIndex >= currentCodes.length) return

    const swapCode = currentCodes[swapIndex]

    try {
      await Promise.all([
        fetch(`/api/superadmin/rms-codes/${code.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sort_order: swapCode.sort_order }),
        }),
        fetch(`/api/superadmin/rms-codes/${swapCode.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sort_order: code.sort_order }),
        }),
      ])

      loadCodes()
    } catch (error) {
      toast.error("Errore nel riordinamento")
    }
  }

  const currentEntityType = ENTITY_TYPES.find((e) => e.key === activeTab)
  const filteredCodes = getFilteredCodes()
  const activeCount = codes.filter((c) => c.entity_type === activeTab && c.is_active).length
  const totalCount = codes.filter((c) => c.entity_type === activeTab).length

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Codici RMS</h1>
          <p className="text-muted-foreground mt-1">Gestisci i codici standard del Revenue Management System</p>
        </div>
        <Button onClick={loadCodes} variant="outline" disabled={isLoading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
          Aggiorna
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        {ENTITY_TYPES.map((entity) => {
          const entityCodes = codes.filter((c) => c.entity_type === entity.key)
          const active = entityCodes.filter((c) => c.is_active).length
          const Icon = entity.icon
          return (
            <Card
              key={entity.key}
              className={`cursor-pointer transition-all hover:shadow-md ${
                activeTab === entity.key ? "ring-2 ring-primary" : ""
              }`}
              onClick={() => setActiveTab(entity.key)}
            >
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <div className={`p-1.5 rounded ${entity.color}`}>
                    <Icon className="h-3.5 w-3.5 text-white" />
                  </div>
                  <span className="text-xs font-medium truncate">{entity.label}</span>
                </div>
                <div className="text-2xl font-bold">{active}</div>
                <div className="text-xs text-muted-foreground">{entityCodes.length} totali</div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Main Content */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {currentEntityType && (
                <div className={`p-2 rounded-lg ${currentEntityType.color}`}>
                  <currentEntityType.icon className="h-5 w-5 text-white" />
                </div>
              )}
              <div>
                <CardTitle>{currentEntityType?.label}</CardTitle>
                <CardDescription>
                  {activeCount} attivi su {totalCount} totali
                </CardDescription>
              </div>
            </div>
            <Button onClick={() => openDialog()}>
              <Plus className="h-4 w-4 mr-2" />
              Aggiungi Codice
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Search */}
          <div className="flex items-center gap-4 mb-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Cerca codice o label..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          {/* Table */}
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredCodes.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              {searchTerm ? "Nessun codice trovato" : "Nessun codice configurato"}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">Ordine</TableHead>
                  <TableHead className="w-24">Codice</TableHead>
                  <TableHead>Label</TableHead>
                  <TableHead>Descrizione</TableHead>
                  <TableHead className="w-24">Stato</TableHead>
                  <TableHead className="w-32 text-right">Azioni</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCodes.map((code, index) => (
                  <TableRow key={code.id} className={!code.is_active ? "opacity-50" : ""}>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => handleMove(code, "up")}
                          disabled={index === 0}
                        >
                          <ArrowUp className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => handleMove(code, "down")}
                          disabled={index === filteredCodes.length - 1}
                        >
                          <ArrowDown className="h-3 w-3" />
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-mono">
                        {code.code}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">{code.label}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">{code.description || "-"}</TableCell>
                    <TableCell>
                      <Switch checked={code.is_active} onCheckedChange={() => handleToggleActive(code)} />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => openDialog(code)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => {
                            setCodeToDelete(code)
                            setDeleteDialogOpen(true)
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingCode ? "Modifica Codice" : "Nuovo Codice"}</DialogTitle>
            <DialogDescription>{currentEntityType?.label}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="code">Codice *</Label>
              <Input
                id="code"
                placeholder="es. DBL"
                value={formData.code}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    code: e.target.value.toUpperCase().replace(/\s/g, ""),
                  }))
                }
                maxLength={10}
                disabled={!!editingCode}
              />
              <p className="text-xs text-muted-foreground">2-10 caratteri, solo lettere maiuscole e numeri</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="label">Label *</Label>
              <Input
                id="label"
                placeholder="es. Double Room"
                value={formData.label}
                onChange={(e) => setFormData((prev) => ({ ...prev, label: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Descrizione (opzionale)</Label>
              <Input
                id="description"
                placeholder="Descrizione aggiuntiva..."
                value={formData.description}
                onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Annulla
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editingCode ? "Salva" : "Crea"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Elimina Codice</AlertDialogTitle>
            <AlertDialogDescription>
              Sei sicuro di voler eliminare il codice <strong>{codeToDelete?.code}</strong>?
              <br />
              Questa azione non può essere annullata.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Elimina"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
