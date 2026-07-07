"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { toast } from "sonner"
import {
  LayoutTemplate,
  Inbox,
  Users,
  Sparkles,
  Activity,
  Globe,
  TrendingUp,
  Wrench,
  BarChart3,
  Lock,
  Loader2,
  type LucideIcon,
} from "lucide-react"

/** Mappa nome-icona (dal DB) -> componente lucide. */
const ICONS: Record<string, LucideIcon> = {
  "layout-template": LayoutTemplate,
  inbox: Inbox,
  users: Users,
  sparkles: Sparkles,
  activity: Activity,
  globe: Globe,
  "trending-up": TrendingUp,
  wrench: Wrench,
  "bar-chart-3": BarChart3,
}

/**
 * Accento cromatico per modulo (Step 2 - design token --ha-module-*).
 * Mapping ESPLICITO e statico: le classi sono stringhe letterali cosi'
 * Tailwind v4 le rileva (niente costruzione dinamica di classi).
 * `borderL` = bordo-sinistro d'accento della card; `bg`/`fg` = icona attiva.
 * Chiavi = valori reali della tabella `modules.key`.
 */
interface ModuleAccent {
  borderL: string
  bg: string
  fg: string
}
const MODULE_ACCENT: Record<string, ModuleAccent> = {
  santaddeo: { borderL: "border-l-ha-module-revenue", bg: "bg-ha-module-revenue", fg: "text-ha-module-revenue-foreground" },
  manubot: { borderL: "border-l-ha-module-maintenance", bg: "bg-ha-module-maintenance", fg: "text-ha-module-maintenance-foreground" },
  hotelprofitai: { borderL: "border-l-ha-module-profit", bg: "bg-ha-module-profit", fg: "text-ha-module-profit-foreground" },
  crm: { borderL: "border-l-ha-module-crm", bg: "bg-ha-module-crm", fg: "text-ha-module-crm-foreground" },
  inbox: { borderL: "border-l-ha-module-crm", bg: "bg-ha-module-crm", fg: "text-ha-module-crm-foreground" },
  frontend: { borderL: "border-l-ha-module-marketing", bg: "bg-ha-module-marketing", fg: "text-ha-module-marketing-foreground" },
  cms: { borderL: "border-l-ha-module-marketing", bg: "bg-ha-module-marketing", fg: "text-ha-module-marketing-foreground" },
  ai: { borderL: "border-l-ha-module-automation", bg: "bg-ha-module-automation", fg: "text-ha-module-automation-foreground" },
  tracking: { borderL: "border-l-ha-module-automation", bg: "bg-ha-module-automation", fg: "text-ha-module-automation-foreground" },
}
/** Fallback neutro: nessun accento di modulo, comportamento invariato. */
const FALLBACK_ACCENT: ModuleAccent = {
  borderL: "border-l-border",
  bg: "bg-primary",
  fg: "text-primary-foreground",
}

export interface ModuleView {
  key: string
  name: string
  description: string | null
  icon: string | null
  category: "core" | "product" | "addon"
  isCore: boolean
  status: "active" | "inactive" | "trial"
  active: boolean
  expiresAt: string | null
}

export function ModuleCard({
  module,
  onChanged,
}: {
  module: ModuleView
  onChanged: () => void
}) {
  const [pending, setPending] = useState(false)
  const Icon = (module.icon && ICONS[module.icon]) || Activity
  const isPaid = module.category === "product" || module.category === "addon"
  const accent = MODULE_ACCENT[module.key] ?? FALLBACK_ACCENT

  async function toggle(next: boolean) {
    setPending(true)
    try {
      const res = await fetch(`/api/admin/modules/${module.key}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: next ? "active" : "inactive" }),
      })
      const result = await res.json().catch(() => ({}))
      if (res.ok) {
        toast.success(next ? `${module.name} attivato` : `${module.name} disattivato`)
        onChanged()
      } else if (result?.requiresUpgrade) {
        toast.error("Questo modulo richiede un abbonamento. Contatta l'amministratore.")
      } else {
        toast.error(result?.error || "Operazione non riuscita")
      }
    } catch {
      toast.error("Errore di rete")
    } finally {
      setPending(false)
    }
  }

  return (
    <Card className={`border-l-4 ${accent.borderL} ${module.active ? "ring-1 ring-primary" : ""}`}>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className={`flex h-10 w-10 items-center justify-center rounded-md ${
                module.active ? `${accent.bg} ${accent.fg}` : "bg-muted text-muted-foreground"
              }`}
            >
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-base leading-tight">{module.name}</CardTitle>
              <div className="mt-1 flex items-center gap-2">
                {module.isCore ? (
                  <Badge variant="secondary" className="text-xs">
                    Core
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-xs">
                    {module.category === "product" ? "Prodotto" : "Add-on"}
                  </Badge>
                )}
                {module.active && (
                  <Badge className="text-xs">Attivo</Badge>
                )}
              </div>
            </div>
          </div>

          {pending ? (
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Aggiornamento" />
          ) : isPaid && !module.active ? (
            <Lock className="h-4 w-4 text-muted-foreground" aria-label="Richiede abbonamento" />
          ) : (
            <Switch
              checked={module.active}
              onCheckedChange={toggle}
              aria-label={`Attiva o disattiva ${module.name}`}
            />
          )}
        </div>
      </CardHeader>
      <CardContent>
        <CardDescription className="text-pretty">
          {module.description || "Nessuna descrizione disponibile."}
        </CardDescription>
        {isPaid && !module.active && (
          <p className="mt-3 text-xs text-muted-foreground">
            Modulo a pagamento. L&apos;attivazione self-service sara&apos; disponibile a breve.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
