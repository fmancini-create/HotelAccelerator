"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Star } from "lucide-react"
import type { StatsPayload } from "./reviews-kpi"

const PLATFORM_LABELS: Record<string, string> = {
  google: "Google",
  booking: "Booking.com",
  tripadvisor: "TripAdvisor",
  expedia: "Expedia",
  vrbo: "VRBO",
  airbnb: "Airbnb",
}

/**
 * Breakdown del rating medio PER CANALE.
 *
 * Le medie per piattaforma sono gia' calcolate da /api/reviews/stats
 * (`stats.platforms` = { platform, count, avg }). I voti sono normalizzati a
 * scala /5 per tutti i canali in fase di ingest (Booking incluso, anche se
 * sull'OTA e' /10), quindi confrontarli tra loro e' corretto.
 *
 * Il colore evidenzia i canali sotto media (rosso < 3.5, ambra < 4, verde >= 4)
 * cosi' si individua subito dove la reputazione e' piu' debole.
 */
function ratingColor(avg: number | null): string {
  if (avg == null) return "text-muted-foreground"
  if (avg >= 4) return "text-green-600"
  if (avg >= 3.5) return "text-amber-600"
  return "text-red-600"
}

export function ReviewsChannelBreakdown({
  stats,
  loading,
}: {
  stats: StatsPayload | null
  loading: boolean
}) {
  if (loading || !stats) {
    return (
      <Card>
        <CardContent className="p-5 space-y-3">
          <Skeleton className="h-4 w-40" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  const platforms = stats.platforms ?? []
  if (platforms.length === 0) return null

  return (
    <Card>
      <CardContent className="p-5 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Rating medio per canale
          </span>
          <span className="text-[11px] text-muted-foreground">Scala /5 normalizzata</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {platforms.map((p) => (
            <div
              key={p.platform}
              className="rounded-lg border border-border bg-muted/30 p-3 flex flex-col gap-1"
            >
              <span className="text-sm font-medium text-foreground">
                {PLATFORM_LABELS[p.platform] ?? p.platform}
              </span>
              <div className="flex items-baseline gap-1">
                <Star className={`h-4 w-4 self-center ${ratingColor(p.avg)} fill-current`} />
                <span className={`text-xl font-bold ${ratingColor(p.avg)}`}>
                  {p.avg != null ? p.avg.toFixed(2) : "--"}
                </span>
                <span className="text-xs text-muted-foreground">/5</span>
                {p.avg != null && (
                  <span className="text-xs text-muted-foreground">({(p.avg * 2).toFixed(1)}/10)</span>
                )}
              </div>
              <span className="text-[11px] text-muted-foreground">
                {p.count} {p.count === 1 ? "recensione" : "recensioni"}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
