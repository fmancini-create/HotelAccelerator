"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Check,
  ChevronLeft,
  ChevronRight,
  MessageCircle,
  Reply,
  Search,
  Star,
} from "lucide-react"
import { format } from "date-fns"
import { it } from "date-fns/locale"
import { ReviewReplyDialog } from "@/components/reviews/review-reply-dialog"
import { ReviewBookingAssign } from "@/components/reviews/review-booking-assign"

interface Review {
  id: string
  platform: string
  review_id: string
  author_name: string | null
  rating: number | null
  title: string | null
  text: string | null
  language: string | null
  review_date: string | null
  stay_date: string | null
  response_text: string | null
  response_published_at: string | null
  sentiment: "positive" | "neutral" | "negative" | null
  topics: unknown
  draft_response: string | null
  draft_response_at: string | null
  draft_response_status: string | null
  booking_id: string | null
  room_type_id: string | null
  roomTypeName: string | null
  match_source: "auto" | "manual" | null
}

interface RoomType {
  id: string
  name: string
}

/**
 * Paginated list of reviews with filters (platform, sentiment, rating, text,
 * sort). Debounced search input.
 */
export function ReviewsList({
  hotelId,
  platforms,
}: {
  hotelId: string
  platforms: Array<{ platform: string; count: number }>
}) {
  const [reviews, setReviews] = useState<Review[]>([])
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const pageSize = 25

  const [platformF, setPlatformF] = useState("all")
  const [sentimentF, setSentimentF] = useState("all")
  const [ratingF, setRatingF] = useState("all")
  const [roomTypeF, setRoomTypeF] = useState("all")
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([])
  const [sort, setSort] = useState("newest")
  const [q, setQ] = useState("")
  const [qInput, setQInput] = useState("")

  // Debounce text search
  useEffect(() => {
    const t = setTimeout(() => setQ(qInput.trim()), 350)
    return () => clearTimeout(t)
  }, [qInput])

  // Reset to page 0 on filter change
  useEffect(() => {
    setPage(0)
  }, [platformF, sentimentF, ratingF, roomTypeF, sort, q])

  const fetchReviews = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({
        hotelId,
        page: String(page),
        pageSize: String(pageSize),
        sort,
      })
      if (platformF !== "all") params.set("platform", platformF)
      if (sentimentF !== "all") params.set("sentiment", sentimentF)
      if (ratingF !== "all") {
        // "5" means >=5; "lt3" means <3 etc. We support exact ranges:
        if (ratingF === "ge4") params.set("minRating", "4")
        else if (ratingF === "lt3") params.set("maxRating", "2.99")
        else if (ratingF === "3") {
          params.set("minRating", "3")
          params.set("maxRating", "3.99")
        }
      }
      if (q) params.set("q", q)
      if (roomTypeF !== "all") params.set("roomTypeId", roomTypeF)

      const res = await fetch(`/api/reviews/list?${params}`)
      if (res.ok) {
        const body = await res.json()
        setReviews(body.reviews || [])
        setTotal(body.total || 0)
        // L'elenco tipologie arriva solo a pagina 0: lo memorizziamo.
        if (Array.isArray(body.roomTypes) && body.roomTypes.length > 0) {
          setRoomTypes(body.roomTypes)
        }
      }
    } finally {
      setLoading(false)
    }
  }, [hotelId, page, platformF, sentimentF, ratingF, roomTypeF, sort, q])

  useEffect(() => {
    fetchReviews()
  }, [fetchReviews])

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  const sentimentColor = (s: Review["sentiment"]) =>
    s === "positive"
      ? "bg-green-100 text-green-700"
      : s === "negative"
        ? "bg-red-100 text-red-700"
        : "bg-gray-100 text-gray-700"

  const starColor = (rating: number | null) =>
    rating == null
      ? "text-muted-foreground"
      : rating >= 4
        ? "text-green-600"
        : rating >= 3
          ? "text-amber-600"
          : "text-red-600"

  return (
    <Card className="min-w-0 max-w-full overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between flex-wrap gap-2 min-w-0">
          <CardTitle className="text-base">
            Recensioni {total > 0 && <span className="text-muted-foreground font-normal">({total})</span>}
          </CardTitle>
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={qInput}
                onChange={(e) => setQInput(e.target.value)}
                placeholder="Cerca nel testo..."
                className="h-8 pl-8 w-full sm:w-56 text-xs"
              />
            </div>
            <Select value={platformF} onValueChange={setPlatformF}>
              <SelectTrigger className="h-8 w-[130px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti i canali</SelectItem>
                {platforms.map((p) => (
                  <SelectItem key={p.platform} value={p.platform}>
                    {p.platform} ({p.count})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={sentimentF} onValueChange={setSentimentF}>
              <SelectTrigger className="h-8 w-[130px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Ogni sentiment</SelectItem>
                <SelectItem value="positive">Positive</SelectItem>
                <SelectItem value="neutral">Neutre</SelectItem>
                <SelectItem value="negative">Negative</SelectItem>
              </SelectContent>
            </Select>
            <Select value={ratingF} onValueChange={setRatingF}>
              <SelectTrigger className="h-8 w-[120px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Ogni rating</SelectItem>
                <SelectItem value="ge4">4★ e oltre</SelectItem>
                <SelectItem value="3">3★</SelectItem>
                <SelectItem value="lt3">Sotto 3★</SelectItem>
              </SelectContent>
            </Select>
            {roomTypes.length > 0 && (
              <Select value={roomTypeF} onValueChange={setRoomTypeF}>
                <SelectTrigger className="h-8 w-[150px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Ogni tipologia</SelectItem>
                  {roomTypes.map((rt) => (
                    <SelectItem key={rt.id} value={rt.id}>
                      {rt.name}
                    </SelectItem>
                  ))}
                  <SelectItem value="none">Senza tipologia</SelectItem>
                </SelectContent>
              </Select>
            )}
            <Select value={sort} onValueChange={setSort}>
              <SelectTrigger className="h-8 w-[120px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="newest">Più recenti</SelectItem>
                <SelectItem value="oldest">Più vecchie</SelectItem>
                <SelectItem value="highest">Rating alto</SelectItem>
                <SelectItem value="lowest">Rating basso</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {loading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
        ) : reviews.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            Nessuna recensione con i filtri correnti.
          </div>
        ) : (
          <div className="space-y-3">
            {reviews.map((r) => (
              <ReviewRow key={r.id} review={r} hotelId={hotelId} sentimentColor={sentimentColor} starColor={starColor} />
            ))}
          </div>
        )}

        {total > pageSize && (
          <div className="flex items-center justify-between pt-4 mt-2 border-t">
            <span className="text-xs text-muted-foreground">
              Pagina {page + 1} di {totalPages}
            </span>
            <div className="flex gap-1">
              <Button
                size="sm"
                variant="outline"
                className="h-7"
                disabled={page === 0 || loading}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7"
                disabled={page + 1 >= totalPages || loading}
                onClick={() => setPage((p) => p + 1)}
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function ReviewRow({
  review: r,
  hotelId,
  sentimentColor,
  starColor,
}: {
  review: Review
  hotelId: string
  sentimentColor: (s: Review["sentiment"]) => string
  starColor: (rating: number | null) => string
}) {
  const [draft, setDraft] = useState<string | null>(r.draft_response)
  // Risposta + flag "pubblicata dal sistema", aggiornabili dopo la pubblicazione.
  const [response, setResponse] = useState<string | null>(r.response_text)
  const [publishedAt, setPublishedAt] = useState<string | null>(r.response_published_at)

  const topics = useMemo(() => {
    if (!r.topics) return []
    if (Array.isArray(r.topics)) return r.topics.filter((t): t is string => typeof t === "string")
    return []
  }, [r.topics])

  return (
    <div className="border border-border rounded-lg p-4 hover:bg-muted/30 transition-colors min-w-0 max-w-full overflow-hidden">
      <div className="flex items-start justify-between gap-3 mb-2 min-w-0">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <Badge variant="outline" className="text-[10px] font-normal">
              {r.platform}
            </Badge>
            {r.rating != null && (
              <span className={`flex items-center gap-0.5 text-sm font-semibold ${starColor(r.rating)}`}>
                <Star className="h-3.5 w-3.5 fill-current" />
                {Number(r.rating).toFixed(1)}
              </span>
            )}
            {r.sentiment && (
              <Badge variant="secondary" className={`text-[10px] ${sentimentColor(r.sentiment)}`}>
                {r.sentiment === "positive" ? "Positiva" : r.sentiment === "negative" ? "Negativa" : "Neutra"}
              </Badge>
            )}
            {r.author_name && (
              <span className="text-xs text-muted-foreground">{r.author_name}</span>
            )}
          </div>
          {r.title && (
            <h4 className="text-sm font-medium text-foreground mt-1.5">{r.title}</h4>
          )}
        </div>
        <span className="text-[11px] text-muted-foreground whitespace-nowrap">
          {r.review_date ? format(new Date(r.review_date), "d MMM yyyy", { locale: it }) : ""}
        </span>
      </div>

      {r.text && (
        <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-wrap break-words">
          {r.text}
        </p>
      )}

      {response && (
        <div className="mt-3 pl-3 border-l-2 border-primary/40 bg-muted/40 rounded-r p-2.5">
          <div className="flex items-center gap-1.5 text-xs font-medium text-primary mb-1">
            <MessageCircle className="h-3 w-3" />
            Risposta dell&apos;hotel
            {publishedAt && (
              <Badge variant="outline" className="text-[10px] font-normal gap-1 border-primary/40 text-primary">
                <Check className="h-2.5 w-2.5" />
                Pubblicata dal sistema
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap break-words">
            {response}
          </p>
        </div>
      )}

      {topics.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2.5">
          {topics.slice(0, 6).map((t, i) => (
            <Badge key={i} variant="outline" className="text-[10px] font-normal">
              {t}
            </Badge>
          ))}
        </div>
      )}

      {/* Bozza di risposta salvata nella piattaforma (non ancora pubblicata sull'OTA) */}
      {draft && (
        <div className="mt-3 pl-3 border-l-2 border-amber-400 bg-amber-50/60 rounded-r p-2.5">
          <div className="flex items-center gap-1.5 text-xs font-medium text-amber-700 mb-1">
            <Reply className="h-3 w-3" />
            Bozza di risposta (da pubblicare)
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap break-words">
            {draft}
          </p>
        </div>
      )}

      <div className="flex items-center justify-between gap-2 mt-3 flex-wrap">
        <ReviewBookingAssign
          reviewId={r.id}
          initialRoomTypeName={r.roomTypeName}
          initialMatchSource={r.match_source}
          initialBookingId={r.booking_id}
        />
        <ReviewReplyDialog
          reviewId={r.id}
          hotelId={hotelId}
          platform={r.platform}
          hasPublishedResponse={!!response}
          initialDraft={draft}
          onSaved={setDraft}
          onPublished={(text) => {
            setResponse(text)
            setPublishedAt(new Date().toISOString())
            setDraft(text)
          }}
        />
      </div>
    </div>
  )
}
