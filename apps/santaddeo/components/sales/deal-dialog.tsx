"use client"

import { useState, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Loader2 } from "lucide-react"
import { STAGES, type Deal } from "./pipeline-board"

type Agent = {
  id: string
  display_name: string
  email: string
}

type DealFormData = Partial<Deal> & { agent_id?: string; prospect_id?: string | null }

interface DealDialogProps {
  deal: Deal | null
  isOpen: boolean
  onClose: () => void
  onSave: (data: DealFormData) => Promise<void>
  onDelete?: (dealId: string) => Promise<void>
  mode: "create" | "edit"
  agents?: Agent[] // Lista agenti per superadmin
  isSuperAdmin?: boolean
  /**
   * Dati di prefill in create mode (es. da un prospect).
   * Quando valorizzato, la dialog mostra anche un banner "Da prospect: <name>".
   */
  prefilledData?: DealFormData & { _prospectLabel?: string }
}

export function DealDialog({ deal, isOpen, onClose, onSave, onDelete, mode, agents, isSuperAdmin, prefilledData }: DealDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formData, setFormData] = useState<DealFormData>({})

  useEffect(() => {
    if (deal && mode === "edit") {
      setFormData({
        prospect_name: deal.prospect_name,
        prospect_email: deal.prospect_email || "",
        prospect_phone: deal.prospect_phone || "",
        prospect_hotel_name: deal.prospect_hotel_name || "",
        prospect_rooms: deal.prospect_rooms || undefined,
        prospect_stars: deal.prospect_stars || undefined,
        prospect_location: deal.prospect_location || "",
        stage: deal.stage,
        estimated_value: deal.estimated_value || undefined,
        probability: deal.probability,
        expected_close_date: deal.expected_close_date || "",
        next_follow_up_date: deal.next_follow_up_date || "",
        lost_reason: deal.lost_reason || "",
        notes: deal.notes || "",
      })
    } else {
      // Create mode: parti da default, poi sovrascrivi con prefilledData se presenti
      const defaults: DealFormData = {
        prospect_name: "",
        prospect_email: "",
        prospect_phone: "",
        prospect_hotel_name: "",
        prospect_rooms: undefined,
        prospect_stars: undefined,
        prospect_location: "",
        stage: "lead",
        estimated_value: undefined,
        probability: 10,
        expected_close_date: "",
        next_follow_up_date: "",
        notes: "",
      }
      if (prefilledData) {
        // Copia tutti i campi tranne quelli interni (prefisso _)
        const { _prospectLabel: _ignore, ...rest } = prefilledData
        Object.assign(defaults, rest)
      }
      setFormData(defaults)
    }
  }, [deal, mode, isOpen, prefilledData])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    try {
      await onSave(formData)
      onClose()
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDelete = async () => {
    if (!deal || !onDelete) return
    if (!confirm("Sei sicuro di voler eliminare questo deal?")) return
    setIsSubmitting(true)
    try {
      await onDelete(deal.id)
      onClose()
    } finally {
      setIsSubmitting(false)
    }
  }

  const updateField = (field: keyof Deal, value: unknown) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  return (
    <Dialog open={isOpen} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "Nuovo Deal" : "Modifica Deal"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Banner prospect collegato (create mode con prefilledData) */}
          {mode === "create" && prefilledData?._prospectLabel && (
            <div className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-sm">
              <span className="font-medium">Crea deal da prospect:</span>{" "}
              <span className="text-muted-foreground">{prefilledData._prospectLabel}</span>
            </div>
          )}

          {/* Banner prospect collegato (edit mode) */}
          {mode === "edit" && deal?.prospect_id && (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm">
              <span className="font-medium text-emerald-900">Deal collegato a un prospect</span>
            </div>
          )}

          {/* Assegnazione agente (solo superadmin in create mode) */}
          {isSuperAdmin && mode === "create" && agents && agents.length > 0 && (
            <div className="space-y-2 pb-4 border-b">
              <Label htmlFor="agent_id">Assegna a venditore *</Label>
              <Select
                value={formData.agent_id || ""}
                onValueChange={(v) => updateField("agent_id", v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleziona venditore" />
                </SelectTrigger>
                <SelectContent>
                  {agents.map((agent) => (
                    <SelectItem key={agent.id} value={agent.id}>
                      {agent.display_name || agent.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Info Prospect */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="prospect_name">Nome contatto *</Label>
              <Input
                id="prospect_name"
                value={formData.prospect_name || ""}
                onChange={(e) => updateField("prospect_name", e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="prospect_hotel_name">Nome hotel</Label>
              <Input
                id="prospect_hotel_name"
                value={formData.prospect_hotel_name || ""}
                onChange={(e) => updateField("prospect_hotel_name", e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="prospect_email">Email</Label>
              <Input
                id="prospect_email"
                type="email"
                value={formData.prospect_email || ""}
                onChange={(e) => updateField("prospect_email", e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="prospect_phone">Telefono</Label>
              <Input
                id="prospect_phone"
                value={formData.prospect_phone || ""}
                onChange={(e) => updateField("prospect_phone", e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="prospect_rooms">Camere</Label>
              <Input
                id="prospect_rooms"
                type="number"
                min={1}
                value={formData.prospect_rooms || ""}
                onChange={(e) => updateField("prospect_rooms", e.target.value ? parseInt(e.target.value) : undefined)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="prospect_stars">Stelle</Label>
              <Select
                value={formData.prospect_stars?.toString() || ""}
                onValueChange={(v) => updateField("prospect_stars", v ? parseInt(v) : undefined)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleziona" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 stella</SelectItem>
                  <SelectItem value="2">2 stelle</SelectItem>
                  <SelectItem value="3">3 stelle</SelectItem>
                  <SelectItem value="4">4 stelle</SelectItem>
                  <SelectItem value="5">5 stelle</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="prospect_location">Location</Label>
              <Input
                id="prospect_location"
                value={formData.prospect_location || ""}
                onChange={(e) => updateField("prospect_location", e.target.value)}
                placeholder="es. Firenze, Toscana"
              />
            </div>
          </div>

          {/* Pipeline */}
          <div className="border-t pt-4 mt-4">
            <h4 className="font-medium mb-3">Pipeline</h4>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="stage">Stage</Label>
                <Select
                  value={formData.stage || "lead"}
                  onValueChange={(v) => {
                    updateField("stage", v)
                    // Aggiorna probabilità default
                    const stage = STAGES.find(s => s.id === v)
                    if (stage) {
                      updateField("probability", stage.defaultProbability)
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STAGES.map(s => (
                      <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="probability">Probabilita %</Label>
                <Input
                  id="probability"
                  type="number"
                  min={0}
                  max={100}
                  value={formData.probability ?? ""}
                  onChange={(e) => updateField("probability", parseInt(e.target.value) || 0)}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="estimated_value">MRR stimato</Label>
                <Input
                  id="estimated_value"
                  type="number"
                  min={0}
                  step={0.01}
                  value={formData.estimated_value ?? ""}
                  onChange={(e) => updateField("estimated_value", e.target.value ? parseFloat(e.target.value) : undefined)}
                  placeholder="es. 150"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="expected_close_date">Chiusura prevista</Label>
                <Input
                  id="expected_close_date"
                  type="date"
                  value={formData.expected_close_date || ""}
                  onChange={(e) => updateField("expected_close_date", e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Follow-up e note */}
          <div className="border-t pt-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="next_follow_up_date">Prossimo follow-up</Label>
              <Input
                id="next_follow_up_date"
                type="date"
                value={formData.next_follow_up_date || ""}
                onChange={(e) => updateField("next_follow_up_date", e.target.value)}
              />
            </div>

            {formData.stage === "lost" && (
              <div className="space-y-2 mt-4">
                <Label htmlFor="lost_reason">Motivo perdita</Label>
                <Input
                  id="lost_reason"
                  value={formData.lost_reason || ""}
                  onChange={(e) => updateField("lost_reason", e.target.value)}
                  placeholder="es. Prezzo troppo alto, Ha scelto competitor..."
                />
              </div>
            )}

            <div className="space-y-2 mt-4">
              <Label htmlFor="notes">Note</Label>
              <Textarea
                id="notes"
                value={formData.notes || ""}
                onChange={(e) => updateField("notes", e.target.value)}
                rows={3}
              />
            </div>
          </div>

          <DialogFooter className="flex items-center justify-between pt-4 border-t">
            <div>
              {mode === "edit" && onDelete && (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={handleDelete}
                  disabled={isSubmitting}
                >
                  Elimina
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={onClose}>
                Annulla
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {mode === "create" ? "Crea Deal" : "Salva"}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
