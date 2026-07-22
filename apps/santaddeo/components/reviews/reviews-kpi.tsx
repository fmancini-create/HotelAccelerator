"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Star, TrendingUp, TrendingDown, Minus, Sparkles, Users } from "lucide-react"

export interface StatsPayload {
  total: number
  avg_rating: number | null
  reputation: {
    score: number | null
    base_norm: number | null
    trend_bonus: number | null
    volume_penalty: number | null
    reviews_180d: number | null
    rating_30d: number | null
    rating_60_90d: number | null
  } | null
  platforms: Array<{ platform: string; count: number; avg: number | null }>
  sentiment: { positive: number; neutral: number; negative: number }
  monthly: Array<{ month: string; count: number; avg: number | null }>
  last_sync_at?: string | null
  last_sync_per_platform?: Array<{ platform: string; at: string }>
}

/**
 * KPI row for the Reviews page. Four cards:
 *  1. Reputation score 0..10 (K-driven variable)
 *  2. Avg rating 1..5 with star
 *  3. Trend 30gg vs 60-90gg (arrow + delta)
 *  4. Sentiment split
 */
export function ReviewsKpi({
  stats,
  loading,
}: {
  stats: StatsPayload | null
  loading: boolean
}) {
  if (loading || !stats) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[0, 1, 2, 3].map((i) => (
          <Card key={i}>
            <CardContent className="p-5 space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-20" />
              <Skeleton className="h-3 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  const rep = stats.reputation
  const trend30 = rep?.rating_30d ?? null
  const trend6090 = rep?.rating_60_90d ?? null
  const trendDelta =
    trend30 != null && trend6090 != null ? trend30 - trend6090 : null
  const TrendIcon =
    trendDelta == null ? Minus : trendDelta > 0.05 ? TrendingUp : trendDelta < -0.05 ? TrendingDown : Minus
  const trendColor =
    trendDelta == null
      ? "text-muted-foreground"
      : trendDelta > 0.05
        ? "text-green-600"
        : trendDelta < -0.05
          ? "text-red-600"
          : "text-muted-foreground"

  const totalSentiment =
    stats.sentiment.positive + stats.sentiment.neutral + stats.sentiment.negative
  const posPct =
    totalSentiment > 0
      ? Math.round((stats.sentiment.positive / totalSentiment) * 100)
      : null

  const scoreColor =
    rep?.score == null
      ? "text-muted-foreground"
      : rep.score >= 7.5
        ? "text-green-600"
        : rep.score >= 5
          ? "text-amber-600"
          : "text-red-600"

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* Reputation Score */}
      <Card>
        <CardContent className="p-5 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Reputation Score
            </span>
            <Sparkles className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className={`text-3xl font-bold ${scoreColor}`}>
            {rep?.score != null ? rep.score.toFixed(1) : "--"}
            <span className="text-base font-normal text-muted-foreground">/10</span>
          </div>
          <p className="text-xs text-muted-foreground leading-snug">
            Variabile K-driven. Decadimento 90gg, trend, volume.
          </p>
          {rep?.base_norm != null && (
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground pt-1">
              <span>Base {rep.base_norm.toFixed(1)}</span>
              <span>&middot;</span>
              <span>
                Trend {rep.trend_bonus != null ? (rep.trend_bonus > 0 ? "+" : "") + rep.trend_bonus.toFixed(1) : "--"}
              </span>
              {(rep.volume_penalty ?? 0) < 0 && (
                <>
                  <span>&middot;</span>
                  <span className="text-amber-600">
                    Volume {rep.volume_penalty!.toFixed(1)}
                  </span>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Avg Rating */}
      <Card>
        <CardContent className="p-5 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Rating medio
            </span>
            <Star className="h-4 w-4 text-amber-500" />
          </div>
          <div className="text-3xl font-bold text-foreground">
            {stats.avg_rating != null ? stats.avg_rating.toFixed(2) : "--"}
            <span className="text-base font-normal text-muted-foreground">/5</span>
            {stats.avg_rating != null && (
              <span className="text-base font-normal text-muted-foreground ml-2">
                ({(stats.avg_rating * 2).toFixed(1)}/10)
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground leading-snug">
            Su {stats.total} recensioni totali
          </p>
        </CardContent>
      </Card>

      {/* Trend */}
      <Card>
        <CardContent className="p-5 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Trend 30gg
            </span>
            <TrendIcon className={`h-4 w-4 ${trendColor}`} />
          </div>
          <div className={`text-3xl font-bold ${trendColor}`}>
            {trendDelta != null
              ? `${trendDelta > 0 ? "+" : ""}${trendDelta.toFixed(2)}`
              : "--"}
          </div>
          <p className="text-xs text-muted-foreground leading-snug">
            {trend30 != null && trend6090 != null
              ? `${trend30.toFixed(2)} (30gg) vs ${trend6090.toFixed(2)} (60-90gg)`
              : "Dati insufficienti per il confronto"}
          </p>
        </CardContent>
      </Card>

      {/* Sentiment */}
      <Card>
        <CardContent className="p-5 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Sentiment
            </span>
            <Users className="h-4 w-4 text-muted-foreground" />
          </div>
          <div className="text-3xl font-bold text-green-600">
            {posPct != null ? `${posPct}%` : "--"}
            <span className="text-base font-normal text-muted-foreground"> positivo</span>
          </div>
          <div className="flex gap-1 pt-1">
            <Badge variant="secondary" className="bg-green-100 text-green-700 hover:bg-green-100 text-[10px]">
              +{stats.sentiment.positive}
            </Badge>
            <Badge variant="secondary" className="bg-gray-100 text-gray-700 hover:bg-gray-100 text-[10px]">
              ={stats.sentiment.neutral}
            </Badge>
            <Badge variant="secondary" className="bg-red-100 text-red-700 hover:bg-red-100 text-[10px]">
              -{stats.sentiment.negative}
            </Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
