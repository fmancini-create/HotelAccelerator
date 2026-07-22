"use client"

import { useEffect, useState } from "react"
import { Lock, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

interface PublicModule {
  monthlyPriceCents: number
  annualPriceCents: number
  annualFullPriceCents: number
  annualDiscountPct: number
  allowMonthly: boolean
  allowAnnual: boolean
  currency: string
}

const fmtEur = (cents: number) => (cents / 100).toLocaleString("it-IT")

export function AddonLocked({
  title,
  description,
  features,
  priceLabel,
  addonType,
}: {
  title: string
  description: string
  features: string[]
  /** Etichetta prezzo di fallback finché il catalogo non è caricato. */
  priceLabel?: string
  /** Addon id (es. "booking_pace"); usato per il link di attivazione e per i prezzi reali. */
  addonType?: string
}) {
  const upgradeHref = addonType ? `/upgrade/${addonType.replace(/_/g, "-")}` : "/upgrade"
  const [mod, setMod] = useState<PublicModule | null>(null)

  // Carica i prezzi reali dal catalogo gestito dal superadmin.
  useEffect(() => {
    if (!addonType) return
    let cancelled = false
    fetch(`/api/catalog/${addonType}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data?.module) setMod(data.module as PublicModule)
      })
      .catch((err) => console.error("[v0] AddonLocked price load error:", err))
    return () => {
      cancelled = true
    }
  }, [addonType])

  const annualSaving = mod ? mod.annualFullPriceCents - mod.annualPriceCents : 0

  return (
    <div className="flex items-center justify-center py-12">
      <Card className="max-w-lg w-full">
        <CardContent className="flex flex-col items-center gap-5 p-8 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <Lock className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
          </div>
          <div className="space-y-1">
            <h2 className="text-xl font-semibold text-balance">{title}</h2>
            <p className="text-sm text-muted-foreground text-pretty">{description}</p>
          </div>
          <ul className="w-full space-y-2 text-left">
            {features.map((f) => (
              <li key={f} className="flex items-start gap-2 text-sm">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                <span>{f}</span>
              </li>
            ))}
          </ul>

          {/* Prezzi reali dal catalogo: mensile e/o annuale con sconto. */}
          {mod ? (
            <div className="flex w-full flex-col items-center gap-2 rounded-lg border bg-muted/40 p-4">
              <div className="flex flex-wrap items-end justify-center gap-x-4 gap-y-1">
                {mod.allowMonthly && (
                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-bold">{fmtEur(mod.monthlyPriceCents)} €</span>
                    <span className="text-sm text-muted-foreground">/mese</span>
                  </div>
                )}
                {mod.allowMonthly && mod.allowAnnual && (
                  <span className="text-sm text-muted-foreground">oppure</span>
                )}
                {mod.allowAnnual && (
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-2xl font-bold">{fmtEur(mod.annualPriceCents)} €</span>
                    <span className="text-sm text-muted-foreground">/anno</span>
                    {mod.annualDiscountPct > 0 && (
                      <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary">
                        -{mod.annualDiscountPct}%
                      </span>
                    )}
                  </div>
                )}
              </div>
              {mod.allowAnnual && annualSaving > 0 && (
                <p className="text-xs text-muted-foreground">
                  Con l&apos;annuale risparmi {fmtEur(annualSaving)} € all&apos;anno
                </p>
              )}
            </div>
          ) : (
            priceLabel && <p className="text-lg font-semibold">{priceLabel}</p>
          )}

          <div className="flex w-full flex-col gap-2">
            <Button asChild className="w-full">
              <a href={upgradeHref}>Attiva il modulo</a>
            </Button>
            <p className="text-xs text-muted-foreground">
              Scegli il piano mensile o annuale e attiva subito dal tuo account.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
