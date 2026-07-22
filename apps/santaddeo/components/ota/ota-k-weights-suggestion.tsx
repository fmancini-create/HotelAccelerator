"use client"

import { useState } from "react"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ArrowRight, Info, Sparkles, TrendingUp } from "lucide-react"

interface SuggestedWeight {
  variable_key: string
  variable_label: string
  current_weight: number | null
  suggested_weight: number
  rationale: string
}

interface Props {
  weights: {
    bookingShare: number
    suggestions: SuggestedWeight[]
  }
  snapshotsCount: number
  hotelId: string
}

/**
 * Surface the suggested weight for the Booking-related K-variables.
 * The logic lives server-side (see /api/ota/stats); here we just render.
 *
 * The user still has to accept the suggestion manually in the K-variables
 * page — the whole point is to give context, not to auto-change pricing.
 */
export function OtaKWeightsSuggestion({ weights, snapshotsCount, hotelId }: Props) {
  const [expanded, setExpanded] = useState(true)

  if (!weights || !weights.suggestions || weights.suggestions.length === 0) {
    return null
  }

  const bookingPct = (weights.bookingShare * 100).toFixed(1)

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardHeader>
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <CardTitle>Pesi K suggeriti</CardTitle>
              <Badge variant="secondary" className="ml-1">
                Beta
              </Badge>
            </div>
            <CardDescription className="mt-1 max-w-2xl">
              In base alla quota reale di Booking.com sul tuo fatturato ({bookingPct}%)
              e ai KPI che hai registrato, ti suggeriamo questi pesi per le variabili del
              K-driven. La tua ultima parola resta sempre tu.
            </CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setExpanded((v) => !v)}>
            {expanded ? "Nascondi" : "Mostra"}
          </Button>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="space-y-4">
          {snapshotsCount < 3 && (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription className="text-xs">
                Con soli {snapshotsCount} snapshot il suggerimento è prudenziale.
                Dopo 3&ndash;4 inserimenti diventa più affidabile.
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-3">
            {weights.suggestions.map((s) => (
              <div
                key={s.variable_key}
                className="flex items-start justify-between gap-3 p-3 rounded-md bg-background border"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">{s.variable_label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{s.rationale}</p>
                </div>
                <div className="flex items-center gap-2 text-sm flex-shrink-0">
                  <span className="text-muted-foreground tabular-nums">
                    {s.current_weight ?? "—"}
                  </span>
                  <ArrowRight className="h-3 w-3 text-muted-foreground" />
                  <Badge className="font-mono">
                    <TrendingUp className="h-3 w-3 mr-1" />
                    {s.suggested_weight}
                  </Badge>
                </div>
              </div>
            ))}
          </div>

          <Button asChild size="sm" variant="outline">
            <Link href={`/pricing/k-driven?hotel=${hotelId}`}>
              Vai alla configurazione K-driven
              <ArrowRight className="h-3 w-3 ml-1" />
            </Link>
          </Button>
        </CardContent>
      )}
    </Card>
  )
}
