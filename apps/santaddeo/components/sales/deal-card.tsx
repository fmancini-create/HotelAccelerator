"use client"

import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { cn } from "@/lib/utils"
import { Building2, Calendar, Euro, Mail, AlertCircle, MapPin, Sparkles } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import type { Deal } from "./pipeline-board"

interface DealCardProps {
  deal: Deal
  onClick: () => void
  isDragging?: boolean
}

export function DealCard({ deal, onClick, isDragging }: DealCardProps) {
  // Calcola giorni nello stage corrente
  const daysInStage = Math.floor(
    (Date.now() - new Date(deal.stage_changed_at).getTime()) / (1000 * 60 * 60 * 24)
  )

  // Check follow-up scaduto
  const isFollowUpOverdue = deal.next_follow_up_date && 
    new Date(deal.next_follow_up_date) < new Date()

  // Colore badge probabilità
  const probColor = deal.probability >= 60 
    ? "bg-emerald-100 text-emerald-700" 
    : deal.probability >= 40 
      ? "bg-amber-100 text-amber-700"
      : "bg-gray-100 text-gray-700"

  return (
    <div
      onClick={onClick}
      className={cn(
        "bg-white rounded-lg border p-3 cursor-pointer transition-all",
        "hover:shadow-md hover:border-primary/30",
        isDragging && "shadow-lg rotate-2 opacity-90",
        isFollowUpOverdue && "border-l-4 border-l-red-500"
      )}
    >
      {/* Header: nome + probabilità */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <h4 className="font-medium text-sm truncate">
              {deal.prospect_name}
            </h4>
            {deal.prospect_id && (
              <Badge
                variant="outline"
                className="h-4 px-1 gap-0.5 text-[10px] font-medium border-emerald-300 bg-emerald-50 text-emerald-700"
                title="Deal generato da un prospect"
              >
                <Sparkles className="h-2.5 w-2.5" />
                prospect
              </Badge>
            )}
          </div>
          {deal.prospect_hotel_name && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
              <Building2 className="h-3 w-3" />
              <span className="truncate">{deal.prospect_hotel_name}</span>
            </div>
          )}
          {deal.prospect_location && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
              <MapPin className="h-3 w-3" />
              <span className="truncate">{deal.prospect_location}</span>
            </div>
          )}
        </div>
        <Badge variant="secondary" className={cn("text-xs shrink-0", probColor)}>
          {deal.probability}%
        </Badge>
      </div>

      {/* Info */}
      <div className="space-y-1 text-xs text-muted-foreground">
        {/* Valore stimato */}
        {deal.estimated_value && deal.estimated_value > 0 && (
          <div className="flex items-center gap-1">
            <Euro className="h-3 w-3" />
            <span className="font-medium text-foreground">
              {deal.estimated_value.toLocaleString("it-IT")} MRR
            </span>
          </div>
        )}

        {/* Contatti */}
        {(deal.prospect_email || deal.prospect_phone) && (
          <div className="flex items-center gap-2">
            {deal.prospect_email && (
              <div className="flex items-center gap-1 truncate">
                <Mail className="h-3 w-3" />
                <span className="truncate">{deal.prospect_email}</span>
              </div>
            )}
          </div>
        )}

        {/* Follow-up */}
        {deal.next_follow_up_date && (
          <div className={cn(
            "flex items-center gap-1",
            isFollowUpOverdue && "text-red-600 font-medium"
          )}>
            {isFollowUpOverdue && <AlertCircle className="h-3 w-3" />}
            <Calendar className="h-3 w-3" />
            <span>
              Follow-up: {new Date(deal.next_follow_up_date).toLocaleDateString("it-IT")}
            </span>
          </div>
        )}
      </div>

      {/* Footer: giorni nello stage */}
      <div className="flex items-center justify-between mt-2 pt-2 border-t text-xs text-muted-foreground">
        <span>{daysInStage}g in questo stage</span>
        {deal.prospect_rooms && (
          <span>{deal.prospect_rooms} camere</span>
        )}
      </div>
    </div>
  )
}

// Versione sortable per drag & drop
export function SortableDealCard({ deal, onClick, isDragging }: DealCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isSorting,
  } = useSortable({ id: deal.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isSorting ? 0.5 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
    >
      <DealCard deal={deal} onClick={onClick} isDragging={isDragging || isSorting} />
    </div>
  )
}
