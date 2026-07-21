"use client"

import { useState, useMemo } from "react"
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { DealCard, SortableDealCard } from "./deal-card"
import { PipelineColumn } from "./pipeline-column"
import { cn } from "@/lib/utils"

export interface Deal {
  id: string
  agent_id: string
  hotel_id: string | null
  lead_id: string | null
  prospect_id: string | null
  prospect_name: string
  prospect_email: string | null
  prospect_phone: string | null
  prospect_hotel_name: string | null
  prospect_rooms: number | null
  prospect_stars: number | null
  prospect_location: string | null
  stage: string
  stage_changed_at: string
  estimated_value: number | null
  probability: number
  expected_close_date: string | null
  next_follow_up_date: string | null
  last_activity_at: string
  lost_reason: string | null
  notes: string | null
  created_at: string
  agent?: { id: string; display_name: string; email: string }
  hotel?: { id: string; name: string } | null
  lead?: { id: string; name: string; email: string } | null
  prospect?: { id: string; name: string; city: string | null; region: string | null; status: string | null } | null
}

export interface Stage {
  id: string
  label: string
  color: string
  bgColor: string
  defaultProbability: number
}

export const STAGES: Stage[] = [
  { id: "lead", label: "Lead", color: "text-gray-700", bgColor: "bg-gray-100", defaultProbability: 10 },
  { id: "contacted", label: "Contattato", color: "text-blue-700", bgColor: "bg-blue-50", defaultProbability: 20 },
  { id: "demo_scheduled", label: "Demo pianificata", color: "text-cyan-700", bgColor: "bg-cyan-50", defaultProbability: 40 },
  { id: "demo_done", label: "Demo fatta", color: "text-indigo-700", bgColor: "bg-indigo-50", defaultProbability: 50 },
  { id: "proposal", label: "Proposta", color: "text-purple-700", bgColor: "bg-purple-50", defaultProbability: 60 },
  { id: "negotiation", label: "Negoziazione", color: "text-amber-700", bgColor: "bg-amber-50", defaultProbability: 75 },
  { id: "won", label: "Vinto", color: "text-emerald-700", bgColor: "bg-emerald-50", defaultProbability: 100 },
  { id: "lost", label: "Perso", color: "text-red-700", bgColor: "bg-red-50", defaultProbability: 0 },
]

interface PipelineBoardProps {
  deals: Deal[]
  onStageChange: (dealId: string, newStage: string) => Promise<void>
  onDealClick: (deal: Deal) => void
  isLoading?: boolean
}

export function PipelineBoard({ deals, onStageChange, onDealClick, isLoading }: PipelineBoardProps) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor)
  )

  // Raggruppa deals per stage
  const dealsByStage = useMemo(() => {
    const grouped: Record<string, Deal[]> = {}
    for (const stage of STAGES) {
      grouped[stage.id] = []
    }
    for (const deal of deals) {
      if (grouped[deal.stage]) {
        grouped[deal.stage].push(deal)
      }
    }
    // Ordina per last_activity_at desc in ogni colonna
    for (const stage of STAGES) {
      grouped[stage.id].sort((a, b) => 
        new Date(b.last_activity_at).getTime() - new Date(a.last_activity_at).getTime()
      )
    }
    return grouped
  }, [deals])

  const activeDeal = activeId ? deals.find(d => d.id === activeId) : null

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as string)
    setIsDragging(true)
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    setActiveId(null)
    setIsDragging(false)

    if (!over) return

    const dealId = active.id as string
    const deal = deals.find(d => d.id === dealId)
    if (!deal) return

    // Determina lo stage di destinazione
    let newStage: string | null = null

    // Se droppiamo su un'altra card, prendiamo lo stage di quella card
    const overDeal = deals.find(d => d.id === over.id)
    if (overDeal) {
      newStage = overDeal.stage
    } else {
      // Altrimenti over.id è lo stage stesso (la colonna)
      newStage = over.id as string
    }

    if (newStage && newStage !== deal.stage && STAGES.some(s => s.id === newStage)) {
      await onStageChange(dealId, newStage)
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className={cn(
        "flex gap-3 overflow-x-auto pb-4 min-h-[600px] snap-x snap-mandatory md:snap-none -mx-4 px-4 sm:mx-0 sm:px-0",
        isLoading && "opacity-50 pointer-events-none"
      )}>
        {STAGES.map(stage => {
          const stageDeals = dealsByStage[stage.id] || []
          const stageValue = stageDeals.reduce((sum, d) => sum + (d.estimated_value || 0), 0)

          return (
            <PipelineColumn
              key={stage.id}
              stage={stage}
              dealCount={stageDeals.length}
              totalValue={stageValue}
            >
              <SortableContext
                items={stageDeals.map(d => d.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-2 min-h-[100px]">
                  {stageDeals.map(deal => (
                    <SortableDealCard
                      key={deal.id}
                      deal={deal}
                      onClick={() => onDealClick(deal)}
                      isDragging={isDragging && activeId === deal.id}
                    />
                  ))}
                </div>
              </SortableContext>
            </PipelineColumn>
          )
        })}
      </div>

      <DragOverlay>
        {activeDeal ? (
          <DealCard deal={activeDeal} onClick={() => {}} isDragging />
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}
