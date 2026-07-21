"use client"

import { useState } from "react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { BarChart3, SlidersHorizontal, Lock, Zap, Info } from "lucide-react"
import Link from "next/link"

export type KpiMode = "system" | "custom"

interface KpiModeSelectorProps {
  mode: KpiMode
  onModeChange: (mode: KpiMode) => void
  subscription: {
    id: string
    plan_type: string
    is_active: boolean
  } | null
  hasCustomThresholds?: boolean
}

export function KpiModeSelector({
  mode,
  onModeChange,
  subscription,
  hasCustomThresholds = false,
}: KpiModeSelectorProps) {
  const [tooltipOpen, setTooltipOpen] = useState(false)

  const isAccelerator = subscription?.is_active === true

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <BarChart3 className="h-4 w-4" />
          <span className="hidden sm:inline font-medium">Metrica KPI:</span>
        </div>

        <div className="inline-flex rounded-lg border bg-muted p-0.5">
          {/* KPI di Sistema - always clickable */}
          <button
            onClick={() => onModeChange("system")}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-all ${
              mode === "system"
                ? "bg-white text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <BarChart3 className="h-3.5 w-3.5" />
            <span className="hidden xs:inline">KPI di Sistema</span>
            <span className="xs:hidden">Sistema</span>
          </button>

          {/* KPI Personalizzati - locked for free users */}
          {isAccelerator ? (
            <button
              onClick={() => onModeChange("custom")}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-all ${
                mode === "custom"
                  ? "bg-white text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              <span className="hidden xs:inline">KPI Personalizzati</span>
              <span className="xs:hidden">Custom</span>
              {!hasCustomThresholds && (
                // FIX 06/05/2026: il tooltip diceva "Vai su Imposta i tuoi
                // KPI" ma non c'era nessun link cliccabile; l'utente non
                // sapeva dove andare. Ora il bottone Info diventa un Link
                // diretto a /settings/kpi e il testo del tooltip lo
                // anticipa esplicitamente.
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Link
                      href="/settings/kpi"
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center"
                      aria-label="Vai a Imposta i tuoi KPI"
                    >
                      <Info className="h-3 w-3 text-amber-500" />
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-xs">
                    <p className="text-sm">
                      Non hai ancora personalizzato i tuoi KPI.{" "}
                      <span className="font-semibold underline">
                        Clicca qui per configurare le soglie personalizzate.
                      </span>
                    </p>
                  </TooltipContent>
                </Tooltip>
              )}
            </button>
          ) : (
            <Tooltip open={tooltipOpen} onOpenChange={setTooltipOpen}>
              <TooltipTrigger asChild>
                <button
                  className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground/60 cursor-not-allowed"
                  onClick={(e) => {
                    e.preventDefault()
                    setTooltipOpen(true)
                  }}
                >
                  <Lock className="h-3.5 w-3.5" />
                  <span className="hidden xs:inline">KPI Personalizzati</span>
                  <span className="xs:hidden">Custom</span>
                </button>
              </TooltipTrigger>
              <TooltipContent
                side="bottom"
                align="end"
                className="max-w-sm p-4"
                onPointerDownOutside={() => setTooltipOpen(false)}
              >
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <p className="text-sm font-semibold text-foreground">
                      KPI Personalizzati
                    </p>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      I <strong>KPI di Sistema</strong> sono metriche standard calcolate
                      sulla base di strutture ricettive simili alla tua per tipologia e
                      posizione. Rappresentano un benchmark di mercato affidabile.
                    </p>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      Con il piano <strong>Accelerator</strong> puoi impostare{" "}
                      <strong>soglie e obiettivi personalizzati</strong> per ogni KPI,
                      ricevendo avvisi su misura per la tua struttura.
                    </p>
                  </div>
                  <Button asChild size="sm" className="w-full gap-1.5">
                    <Link href="/accelerator/activate">
                      <Zap className="h-3.5 w-3.5" />
                      Attiva Accelerator
                    </Link>
                  </Button>
                </div>
              </TooltipContent>
            </Tooltip>
          )}
        </div>

        {/* Current mode badge — FIX 06/05/2026: ora e' un link cliccabile
            verso /settings/kpi (prima era solo un badge decorativo). */}
        {mode === "custom" && isAccelerator && (
          <Link href="/settings/kpi" className="hidden sm:inline-flex">
            <Badge
              variant="outline"
              className="text-xs gap-1 cursor-pointer hover:bg-accent transition-colors"
            >
              <SlidersHorizontal className="h-3 w-3" />
              Soglie personalizzate
            </Badge>
          </Link>
        )}
      </div>
    </TooltipProvider>
  )
}
