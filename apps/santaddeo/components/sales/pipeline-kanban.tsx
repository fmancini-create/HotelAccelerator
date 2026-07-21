"use client"

import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { MessageSquare } from "lucide-react"
import { PIPELINE_STAGES, PipelineStageSelect } from "@/components/sales/pipeline-stage-select"

type KanbanLead = {
  id: string
  first_name: string
  last_name: string
  hotel_name: string
  email: string
  pipeline_stage?: string | null
  unread_replies?: number
}

/**
 * Vista pipeline a colonne (kanban). Lo spostamento tra stadi avviene tramite
 * il selettore in ogni card (no drag nativo: piu' affidabile su mobile e
 * accessibile da tastiera). Ogni cambio persiste via /api/sales/leads/[id]/stage.
 */
export function PipelineKanban({
  leads,
  onOpenConversation,
  onStageChanged,
}: {
  leads: KanbanLead[]
  onOpenConversation: (id: string) => void
  onStageChanged?: () => void
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {PIPELINE_STAGES.map((stage) => {
        const items = leads.filter((l) => (l.pipeline_stage ?? "new") === stage.value)
        return (
          <div key={stage.value} className="flex flex-col rounded-lg border bg-muted/30">
            <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
              <span className="text-sm font-semibold text-foreground/80">{stage.label}</span>
              <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                {items.length}
              </Badge>
            </div>
            <div className="flex flex-col gap-2 p-2 min-h-[80px]">
              {items.length === 0 ? (
                <p className="px-1 py-3 text-center text-xs text-muted-foreground">—</p>
              ) : (
                items.map((l) => (
                  <Card key={l.id} className="p-2.5">
                    <p className="text-sm font-medium leading-tight">
                      {l.first_name} {l.last_name}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{l.hotel_name}</p>
                    <div className="mt-2 flex items-center justify-between gap-1">
                      <PipelineStageSelect
                        leadId={l.id}
                        value={l.pipeline_stage ?? "new"}
                        compact
                        onChanged={() => onStageChanged?.()}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="relative h-8 w-8 shrink-0"
                        onClick={() => onOpenConversation(l.id)}
                        title="Conversazione"
                      >
                        <MessageSquare className="h-4 w-4" />
                        {l.unread_replies && l.unread_replies > 0 ? (
                          <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
                            {l.unread_replies}
                          </span>
                        ) : null}
                      </Button>
                    </div>
                  </Card>
                ))
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
