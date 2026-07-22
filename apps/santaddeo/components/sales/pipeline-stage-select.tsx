"use client"

import { useState } from "react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Loader2 } from "lucide-react"

/** Stadi pipeline (allineati al CHECK su sales_leads.pipeline_stage). */
export const PIPELINE_STAGES = [
  { value: "new", label: "Nuovo" },
  { value: "contacted", label: "Contattato" },
  { value: "demo", label: "Demo" },
  { value: "negotiation", label: "Negoziazione" },
  { value: "won", label: "Vinto" },
  { value: "lost", label: "Perso" },
] as const

export type PipelineStage = (typeof PIPELINE_STAGES)[number]["value"]

export function stageLabel(value?: string | null): string {
  return PIPELINE_STAGES.find((s) => s.value === value)?.label ?? "Nuovo"
}

/**
 * Selettore di stadio pipeline che persiste il cambio via API.
 * Usato sia nel dialog conversazione sia nella vista kanban.
 */
export function PipelineStageSelect({
  leadId,
  value,
  onChanged,
  compact,
}: {
  leadId: string
  value: string
  onChanged?: (next: string) => void
  compact?: boolean
}) {
  const [current, setCurrent] = useState(value)
  const [saving, setSaving] = useState(false)

  async function change(next: string) {
    if (next === current || saving) return
    const prev = current
    setCurrent(next) // optimistic
    setSaving(true)
    try {
      const res = await fetch(`/api/sales/leads/${leadId}/stage`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pipeline_stage: next }),
      })
      if (!res.ok) {
        setCurrent(prev) // rollback
      } else {
        onChanged?.(next)
      }
    } catch {
      setCurrent(prev)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" /> : null}
      <Select value={current} onValueChange={(v) => void change(v)}>
        <SelectTrigger className={compact ? "h-8 w-[150px] text-xs" : "w-[180px]"}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PIPELINE_STAGES.map((s) => (
            <SelectItem key={s.value} value={s.value}>
              {s.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
