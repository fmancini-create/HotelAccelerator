"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { toast } from "sonner"
import { formattaImporto } from "@/lib/modules/pricing"
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
  Bot,
  Lock,
  Loader2,
  Percent,
  type LucideIcon,
} from "lucide-react"

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
  bot: Bot,
}

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
  monthlyPriceCents: number | null
  crossSellEligible?: boolean
  crossSellDiscountPercent?: number
  discountedMonthlyPriceCents?: number | null
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
  const hasDiscount = module.crossSellEligible && (module.crossSellDiscountPercent ?? 0) > 0

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
              <div className="mt-1 flex flex-wrap items-center gap-2">
                {module.isCore ? (
                  <Badge variant="secondary" className="text-xs">Core</Badge>
                ) : (
                  <Badge variant="outline" className="text-xs">
                    {module.category === "product" ? "Prodotto" : "Add-on"}
                  </Badge>
                )}
                {module.active && <Badge className="text-xs">Attivo</Badge>}
                {hasDiscount && !module.active && (
                  <Badge variant="secondary" className="gap-1 text-xs">
                    <Percent className="h-3 w-3" />
                    Cliente 4BID -{module.crossSellDiscountPercent}%
                  </Badge>
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
        {isPaid && (
          <div className="mt-3 text-sm font-medium">
            {module.monthlyPriceCents === null ? (
              <span className="text-muted-foreground">Prezzo da definire</span>
            ) : hasDiscount && module.discountedMonthlyPriceCents !== null && module.discountedMonthlyPriceCents !== undefined ? (
              <div className="flex flex-wrap items-baseline gap-2">
                <span className="text-muted-foreground line-through">{formattaImporto(module.monthlyPriceCents)}</span>
                <span>{formattaImporto(module.discountedMonthlyPriceCents)}</span>
                <span className="font-normal text-muted-foreground">al mese, per struttura</span>
              </div>
            ) : (
              <>
                {formattaImporto(module.monthlyPriceCents)}
                <span className="font-normal text-muted-foreground"> al mese, per struttura</span>
              </>
            )}
          </div>
        )}
        {hasDiscount && !module.active && module.monthlyPriceCents === null && (
          <p className="mt-1 text-xs text-ha-success-soft-foreground">
            Sconto cliente 4BID del {module.crossSellDiscountPercent}% applicato quando il prezzo viene definito.
          </p>
        )}
        {isPaid && !module.active && (
          <p className="mt-1 text-xs text-muted-foreground">
            Modulo a pagamento. L&apos;attivazione self-service sara&apos; disponibile a breve.
          </p>
        )}
      </CardContent>
    </Card>
  )
}
