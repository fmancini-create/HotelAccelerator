"use client"

import { useCallback, useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AlertCircle, RefreshCw, Sparkles, ThumbsUp, ThumbsDown } from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { it } from "date-fns/locale"

interface InsightItem {
  title: string
  description: string
  mentions: number
}

interface Topic {
  topic: string
  count: number
  sentiment: "positive" | "neutral" | "negative" | "mixed"
}

interface Insights {
  strengths: InsightItem[]
  weaknesses: InsightItem[]
  recurring_topics: Topic[]
  summary: string
  generated_at: string
  reviews_count: number
  lookback_days: number
}

/**
 * AI-generated strengths/weaknesses/topics block. Cached 24h server-side;
 * the "Ricalcola" button triggers a fresh generation.
 */
export function ReviewsAiInsights({ hotelId }: { hotelId: string }) {
  const [insights, setInsights] = useState<Insights | null>(null)
  const [loading, setLoading] = useState(true)
  const [fresh, setFresh] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchInsights = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/reviews/insights?hotelId=${hotelId}`)
      if (res.ok) {
        const body = await res.json()
        setInsights(body.insights)
        setFresh(body.fresh)
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [hotelId])

  useEffect(() => {
    fetchInsights()
  }, [fetchInsights])

  const regenerate = useCallback(async () => {
    setRegenerating(true)
    setError(null)
    try {
      const res = await fetch("/api/reviews/insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hotelId }),
      })
      const body = await res.json()
      if (!res.ok) {
        setError(body?.error || "Errore di generazione")
      } else {
        await fetchInsights()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore sconosciuto")
    } finally {
      setRegenerating(false)
    }
  }, [hotelId, fetchInsights])

  const topicBadgeClass = (s: Topic["sentiment"]) =>
    s === "positive"
      ? "bg-green-100 text-green-700 hover:bg-green-100"
      : s === "negative"
        ? "bg-red-100 text-red-700 hover:bg-red-100"
        : s === "mixed"
          ? "bg-amber-100 text-amber-700 hover:bg-amber-100"
          : "bg-gray-100 text-gray-700 hover:bg-gray-100"

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Insights AI
          </CardTitle>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 gap-1.5 text-xs"
            onClick={regenerate}
            disabled={regenerating}
          >
            <RefreshCw className={`h-3 w-3 ${regenerating ? "animate-spin" : ""}`} />
            {regenerating ? "Genero..." : "Ricalcola"}
          </Button>
        </div>
        {insights?.generated_at && (
          <p className="text-[11px] text-muted-foreground">
            Aggiornato{" "}
            {formatDistanceToNow(new Date(insights.generated_at), {
              addSuffix: true,
              locale: it,
            })}
            {insights.reviews_count ? ` · ${insights.reviews_count} recensioni` : ""}
            {!fresh && " (cache scaduta)"}
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : !insights ? (
          <div className="text-sm text-muted-foreground space-y-3">
            <p>Nessun insight disponibile.</p>
            <Button size="sm" onClick={regenerate} disabled={regenerating} className="gap-1.5">
              <Sparkles className="h-3 w-3" />
              Genera insights
            </Button>
          </div>
        ) : (
          <>
            {error && (
              <Alert variant="destructive" className="py-2">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="text-xs">{error}</AlertDescription>
              </Alert>
            )}

            {insights.summary && (
              <p className="text-sm text-foreground leading-relaxed">{insights.summary}</p>
            )}

            {insights.strengths?.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-medium text-green-700">
                  <ThumbsUp className="h-3.5 w-3.5" />
                  Punti di forza
                </div>
                <ul className="space-y-1.5">
                  {insights.strengths.map((s, i) => (
                    <li key={i} className="text-xs">
                      <span className="font-medium text-foreground">{s.title}</span>
                      {s.mentions > 0 && (
                        <span className="text-muted-foreground"> &middot; {s.mentions} menzioni</span>
                      )}
                      <p className="text-muted-foreground leading-snug mt-0.5">
                        {s.description}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {insights.weaknesses?.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-medium text-red-700">
                  <ThumbsDown className="h-3.5 w-3.5" />
                  Aree di miglioramento
                </div>
                <ul className="space-y-1.5">
                  {insights.weaknesses.map((w, i) => (
                    <li key={i} className="text-xs">
                      <span className="font-medium text-foreground">{w.title}</span>
                      {w.mentions > 0 && (
                        <span className="text-muted-foreground"> &middot; {w.mentions} menzioni</span>
                      )}
                      <p className="text-muted-foreground leading-snug mt-0.5">
                        {w.description}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {insights.recurring_topics?.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-medium text-muted-foreground">Topic ricorrenti</div>
                <div className="flex flex-wrap gap-1.5">
                  {insights.recurring_topics.map((t, i) => (
                    <Badge
                      key={i}
                      variant="secondary"
                      className={`text-[10px] font-normal ${topicBadgeClass(t.sentiment)}`}
                    >
                      {t.topic}
                      {t.count > 0 && <span className="ml-1 opacity-70">{t.count}</span>}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
