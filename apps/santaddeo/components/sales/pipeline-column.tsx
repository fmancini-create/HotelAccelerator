"use client"

import { useDroppable } from "@dnd-kit/core"
import { cn } from "@/lib/utils"
import type { Stage } from "./pipeline-board"

interface PipelineColumnProps {
  stage: Stage
  dealCount: number
  totalValue: number
  children: React.ReactNode
}

export function PipelineColumn({ stage, dealCount, totalValue, children }: PipelineColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: stage.id,
  })

  const formatValue = (value: number) => {
    if (value >= 1000) {
      return `${(value / 1000).toFixed(1)}k`
    }
    return value.toFixed(0)
  }

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex-shrink-0 w-[78vw] sm:w-[280px] snap-center rounded-lg border transition-colors",
        stage.bgColor,
        isOver && "ring-2 ring-primary ring-offset-2"
      )}
    >
      {/* Header colonna */}
      <div className={cn("p-3 border-b", stage.bgColor)}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className={cn("font-semibold text-sm", stage.color)}>
              {stage.label}
            </h3>
            <span className={cn(
              "px-2 py-0.5 rounded-full text-xs font-medium",
              stage.color,
              "bg-white/60"
            )}>
              {dealCount}
            </span>
          </div>
          {totalValue > 0 && (
            <span className="text-xs text-muted-foreground">
              {formatValue(totalValue)}
            </span>
          )}
        </div>
      </div>

      {/* Lista deal */}
      <div className="p-2 max-h-[calc(100vh-280px)] overflow-y-auto">
        {children}
      </div>
    </div>
  )
}
