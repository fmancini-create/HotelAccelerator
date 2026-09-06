"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  Languages,
  Loader2,
  MessageCircle,
  RefreshCw,
  Reply,
  Send,
  Settings,
  Sparkles,
  Star,
  ThumbsDown,
  ThumbsUp,
  Wrench,
} from "lucide-react"
import { toast } from "sonner"
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"

type Sentiment = "positive" | "neutral" | "negative"
type Review = {
  id: string
  platform: string
  author_name: string | null
  rating: number | null
  title: string | null
  text: string | null
  review_date: string | null
  stay_date?: string | null
  response_text?: string | null
  response_published_at?: string | null
  sentiment: Sentiment | null
  draft_response?: string | null
  draft_response_status?: string | null
  room_type_id?: string | null
  roomTypeName?: string | null
}
type RoomType = { id: string; name: string }
type Stats = {
  total: number
  avg_rating: number | null
  reputation: { score: number | null; reviews_180d: number; rating_30d: number | null } | null
  platforms: Array<{ platform: string; count: number; avg: number | null }>
  sentiment: { positive: number; neutral: number; negative: number }
  monthly: Array<{ month: string; count: number; avg: number | null }>
  filtered?: boolean
}
type InsightItem = { title: string; description: string; mentions: number }
type InsightTopic = { topic: string; count: number; sentiment: Sentiment | "mixed" }
type Insights = {
  strengths?: InsightItem[]
  weaknesses?: InsightItem[]
  recurring_topics?: InsightTopic[]
  summary?: string
}
type PriorityOption = {
  id: string
  name: string
  label?: string | null
  description?: string | null
  response_time_hours?: number | null
  sort_order?: number | null
}
type ManuBotContext = {
  status?: "active" | "inactive" | "configuration_required"
  active?: boolean
  reason?: string | null
  activation_url?: string
  task_data?: {
    operators?: Array<{ id: string; full_name: string | null }>
    operatorGroups?: Array<{ id: string; name: string; member_count?: number | null }>
    priorities?: PriorityOption[]
  } | null
}
type TicketIntelligence = {
  language?: string | null
  translation: { title_it: string | null; text_it: string | null }
  detected: {
    maintenance_relevant: boolean
    room_number: string | null
    room_type: string | null
    area_name: string | null
    issue_type: string | null
    symptoms: string[]
    operational_details: string[]
    safety_risks: string[]
    guest_impact: string | null
    confidence: number
  }
  ticket: {
    title: string
    description: string
    priority: "low" | "normal" | "high" | "urgent"
    asset_ids: string[]
    asset_category_id: string | null
    property_id: string | null
    tags: string[]
  }
  matched: {
    assets: Array<{ id: string; name: string; location: string | null }>
    asset_category: { id: string; name: string } | null
    property: { id: string; name: string } | null
  }
}

const PLATFORM_OPTIONS = [
  ["google", "Google"],
  ["booking", "Booking.com"],
  ["tripadvisor", "TripAdvisor"],
  ["expedia", "Expedia"],
  ["vrbo", "VRBO"],
  ["airbnb", "Airbnb"],
] as const

function platformLabel(value: string) {
  return PLATFORM_OPTIONS.find(([key]) => key === value.toLowerCase())?.[1] || value
}
function monthLabel(month: string) {
  const [year, value] = month.split("-").map(Number)
  if (!year || !value) return month
  return new Date(year, value - 1, 1).toLocaleDateString("it-IT", { month: "short", year: "2-digit" })
}
function defaultTitle(review: Review) {
  const score = review.rating != null ? ` ${Number(review.rating).toFixed(1)}/5` : ""
  return review.title?.trim()
    ? `Recensione ${platformLabel(review.platform)}${score}: ${review.title.trim()}`.slice(0, 240)
    : `Recensione ${platformLabel(review.platform)}${score} da gestire`
}
function defaultDescription(review: Review) {
  return [
    review.author_name ? `Ospite: ${review.author_name}` : null,
    review.rating != null ? `Valutazione: ${Number(review.rating).toFixed(1)}/5` : null,
    review.review_date ? `Data recensione: ${review.review_date}` : null,
    review.title ? `Titolo: ${review.title}` : null,
    review.text ? `Recensione:\n${review.text}` : null,
  ].filter(Boolean).join("\n")
}
function applyRatingFilter(params: URLSearchParams, rating: string) {
  if (rating === "all") return
  const value = Number(rating)
  if (!Number.isFinite(value)) return
  params.set("minRating", String(value))
  params.set("maxRating", String(value === 5 ? 5 : value + 0.99))
}
function percentage(value: number, total: number) {
  return total > 0 ? Math.round((value / total) * 100) : 0
}

export function ReviewsOperationsV2() {
  const pageSize = 25
  const [reviews, setReviews] = useState<Review[]>([])
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [searchInput, setSearchInput] = useState("")
  const [q, setQ] = useState("")
  const [platform, setPlatform] = useState("all")
  const [sentiment, setSentiment] = useState("all")
  const [rating, setRating] = useState("all")
  const [roomTypeId, setRoomTypeId] = useState("all")
  const [sort, setSort] = useState("newest")

  const [insights, setInsights] = useState<Insights | null>(null)
  const [insightsLoading, setInsightsLoading] = useState(true)
  const [insightsRegenerating, setInsightsRegenerating] = useState(false)
  const [manubot, setManubot] = useState<ManuBotContext | null>(null)
  const [manubotLoading, setManubotLoading] = useState(true)

  const [selected, setSelected] = useState<Review | null>(null)
  const [replyDraft, setReplyDraft] = useState("")
  const [replyInstructions, setReplyInstructions] = useState("")
  const [generatingReply, setGeneratingReply] = useState(false)
  const [savingReply, setSavingReply] = useState(false)
  const [publishingReply, setPublishingReply] = useState(false)
  const [copied, setCopied] = useState(false)

  const [intelligence, setIntelligence] = useState<TicketIntelligence | null>(null)
  const [intelligenceLoading, setIntelligenceLoading] = useState(false)
  const [showTranslation, setShowTranslation] = useState(false)
  const [showMaintenance, setShowMaintenance] = useState(false)
  const [responsible, setResponsible] = useState("")
  const [minutes, setMinutes] = useState("60")
  const [taskTitle, setTaskTitle] = useState("")
  const [taskDescription, setTaskDescription] = useState("")
  const [priority, setPriority] = useState("")
  const [savingTask, setSavingTask] = useState(false)

  useEffect(() => {
    const timer = window.setTimeout(() => setQ(searchInput.trim()), 350)
    return () => window.clearTimeout(timer)
  }, [searchInput])
  useEffect(() => setPage(0), [q, platform, sentiment, rating, roomTypeId, sort])

  const makeFilterParams = useCallback((includeList: boolean) => {
    const params = new URLSearchParams()
    if (includeList) {
      params.set("page", String(page))
      params.set("pageSize", String(pageSize))
      params.set("sort", sort)
    }
    if (q) params.set("q", q)
    if (platform !== "all") params.set("platform", platform)
    if (sentiment !== "all") params.set("sentiment", sentiment)
    if (roomTypeId !== "all") params.set("roomTypeId", roomTypeId)
    applyRatingFilter(params, rating)
    return params
  }, [page, q, platform, sentiment, rating, roomTypeId, sort])

  const loadDashboard = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [listRes, statsRes] = await Promise.all([
        fetch(`/api/admin/reviews/list?${makeFilterParams(true)}`, { cache: "no-store" }),
        fetch(`/api/admin/reviews/stats?${makeFilterParams(false)}`, { cache: "no-store" }),
      ])
      const listBody = await listRes.json().catch(() => ({}))
      const statsBody = await statsRes.json().catch(() => ({}))
      if (!listRes.ok) throw new Error(listBody.error || "Impossibile caricare le recensioni")
      setReviews(Array.isArray(listBody.reviews) ? listBody.reviews : [])
      setTotal(Number(listBody.total || 0))
      if (Array.isArray(listBody.roomTypes)) setRoomTypes(listBody.roomTypes)
      setStats(statsRes.ok ? statsBody as Stats : null)
    } catch (err) {
      setReviews([])
      setTotal(0)
      setStats(null)
      setError(err instanceof Error ? err.message : "Impossibile caricare le recensioni")
    } finally {
      setLoading(false)
    }
  }, [makeFilterParams])
  useEffect(() => { void loadDashboard() }, [loadDashboard])

  const loadInsights = useCallback(async () => {
    setInsightsLoading(true)
    try {
      const res = await fetch("/api/admin/reviews/insights", { cache: "no-store" })
      const body = await res.json().catch(() => ({}))
      setInsights(res.ok ? body.insights || null : null)
    } finally {
      setInsightsLoading(false)
    }
  }, [])
  useEffect(() => { void loadInsights() }, [loadInsights])

  useEffect(() => {
    let cancelled = false
    fetch("/api/admin/reviews/manubot", { cache: "no-store" })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(body.error || "Collegamento ManuBot non disponibile")
        if (!cancelled) setManubot(body)
      })
      .catch((err) => {
        if (!cancelled) setManubot({ status: "configuration_required", active: false, reason: err instanceof Error ? err.message : "manubot_unavailable" })
      })
      .finally(() => { if (!cancelled) setManubotLoading(false) })
    return () => { cancelled = true }
  }, [])

  const regenerateInsights = async () => {
    setInsightsRegenerating(true)
    try {
      const res = await fetch("/api/admin/reviews/insights", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || "Impossibile rigenerare gli insights")
      setInsights(body.insights || null)
      toast.success("Insights AI aggiornati")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Impossibile rigenerare gli insights")
    } finally {
      setInsightsRegenerating(false)
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const sentimentTotal = stats ? stats.sentiment.positive + stats.sentiment.neutral + stats.sentiment.negative : 0
  const trendData = (stats?.monthly || []).map((item) => ({ ...item, label: monthLabel(item.month) }))
  const operators = manubot?.task_data?.operators || []
  const groups = manubot?.task_data?.operatorGroups || []
  const priorities = [...(manubot?.task_data?.priorities || [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))

  const manubotMessage = useMemo(() => {
    if (manubotLoading) return "Verifico ManuBot…"
    if (manubot?.status === "inactive") return "ManuBot non è attivo per questa struttura."
    if (manubot?.status === "configuration_required") return "ManuBot è attivo ma il collegamento tecnico alla struttura va completato."
    return null
  }, [manubotLoading, manubot])

  const openReview = (review: Review) => {
    setSelected(review)
    setReplyDraft(review.draft_response || "")
    setReplyInstructions("")
    setCopied(false)
    setIntelligence(null)
    setShowTranslation(false)
    setShowMaintenance(false)
    setResponsible("")
    setMinutes("60")
    setPriority("")
    setTaskTitle(defaultTitle(review))
    setTaskDescription(defaultDescription(review))
  }

  const loadIntelligence = async (purpose: "translate" | "maintenance") => {
    if (!selected) return null
    if (intelligence) {
      if (purpose === "translate") setShowTranslation(true)
      if (purpose === "maintenance") {
        setTaskTitle(intelligence.ticket.title)
        setTaskDescription(intelligence.ticket.description)
      }
      return intelligence
    }
    if (intelligenceLoading) return null
    setIntelligenceLoading(true)
    try {
      const res = await fetch("/api/admin/reviews/ticket-intelligence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewId: selected.id }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok || !body?.intelligence) throw new Error(body.error || "Analisi recensione non disponibile")
      const next = body.intelligence as TicketIntelligence
      setIntelligence(next)
      if (purpose === "translate") setShowTranslation(true)
      if (purpose === "maintenance") {
        setTaskTitle(next.ticket.title)
        setTaskDescription(next.ticket.description)
      }
      return next
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Analisi recensione non disponibile")
      return null
    } finally {
      setIntelligenceLoading(false)
    }
  }

  const patchReview = (id: string, patch: Partial<Review>) => {
    setReviews((current) => current.map((review) => review.id === id ? { ...review, ...patch } : review))
    setSelected((current) => current?.id === id ? { ...current, ...patch } : current)
  }

  const generateReply = async () => {
    if (!selected) return
    setGeneratingReply(true)
    try {
      const res = await fetch("/api/admin/reviews/reply-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewId: selected.id, instructions: replyInstructions.trim() || undefined }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || "Errore nella generazione")
      setReplyDraft(body.draft || "")
      toast.success("Bozza generata")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore nella generazione")
    } finally {
      setGeneratingReply(false)
    }
  }

  const saveReply = async (status: "draft" | "copied") => {
    if (!selected) return false
    setSavingReply(true)
    try {
      const res = await fetch("/api/admin/reviews/reply-draft", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewId: selected.id, draft: replyDraft, status }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || "Errore nel salvataggio")
      patchReview(selected.id, { draft_response: replyDraft, draft_response_status: status })
      if (status === "draft") toast.success("Bozza salvata")
      return true
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore nel salvataggio")
      return false
    } finally {
      setSavingReply(false)
    }
  }

  const copyReply = async () => {
    if (!replyDraft.trim()) return
    try {
      await navigator.clipboard.writeText(replyDraft)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
      void saveReply("copied")
      toast.success("Risposta copiata negli appunti")
    } catch {
      toast.error("Impossibile copiare")
    }
  }

  const publishReply = async () => {
    if (!selected || !replyDraft.trim()) return
    setPublishingReply(true)
    try {
      const res = await fetch("/api/admin/reviews/publish-reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewId: selected.id, text: replyDraft.trim() }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || "Errore nella pubblicazione")
      patchReview(selected.id, {
        response_text: replyDraft.trim(),
        response_published_at: body.publishedAt || new Date().toISOString(),
        draft_response: replyDraft.trim(),
        draft_response_status: "published",
      })
      toast.success("Risposta pubblicata su Google")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Errore nella pubblicazione")
    } finally {
      setPublishingReply(false)
    }
  }

  const createMaintenanceTask = async () => {
    if (!selected) return
    const expectedResolutionMinutes = Number(minutes)
    if (!responsible) return toast.error("Scegli un responsabile")
    if (!priority) return toast.error("Scegli una priorità configurata in ManuBot")
    if (!Number.isInteger(expectedResolutionMinutes) || expectedResolutionMinutes < 5 || expectedResolutionMinutes > 1440) {
      return toast.error("Il tempo stimato deve essere tra 5 e 1440 minuti")
    }
    if (!taskTitle.trim()) return toast.error("Inserisci un titolo")

    setSavingTask(true)
    try {
      const res = await fetch("/api/admin/reviews/manubot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reviewId: selected.id,
          title: taskTitle.trim(),
          description: taskDescription.trim(),
          priority,
          responsible,
          expectedResolutionMinutes,
          review: {
            platform: selected.platform,
            rating: selected.rating,
            author_name: selected.author_name,
            review_date: selected.review_date,
            sentiment: selected.sentiment,
            title: selected.title,
            text: selected.text,
            stay_date: selected.stay_date,
            room_type_id: selected.room_type_id,
            roomTypeName: selected.roomTypeName,
          },
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        if (body.error === "invalid_priority") throw new Error("La priorità scelta non è più attiva in ManuBot")
        throw new Error(body.error || "Creazione task non riuscita")
      }
      toast.success("Task manutenzione creato con tutte le informazioni recuperate")
      setShowMaintenance(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Creazione task non riuscita")
    } finally {
      setSavingTask(false)
    }
  }

  const detectedLabels = [
    intelligence?.detected.room_number ? `Camera ${intelligence.detected.room_number}` : null,
    intelligence?.detected.room_type || null,
    intelligence?.detected.area_name || null,
    intelligence?.detected.issue_type || null,
    ...(intelligence?.matched.assets.map((asset) => `Asset: ${asset.name}`) || []),
    intelligence?.matched.property ? `Sede: ${intelligence.matched.property.name}` : null,
  ].filter((value): value is string => Boolean(value))

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[220px] flex-1 space-y-1.5"><Label>Cerca</Label><Input placeholder="Testo, titolo o autore" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} /></div>
        <div className="w-[150px] space-y-1.5"><Label>Canale</Label><Select value={platform} onValueChange={setPlatform}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Tutti</SelectItem>{PLATFORM_OPTIONS.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
        <div className="w-[145px] space-y-1.5"><Label>Sentiment</Label><Select value={sentiment} onValueChange={setSentiment}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Tutti</SelectItem><SelectItem value="negative">Negative</SelectItem><SelectItem value="neutral">Neutre</SelectItem><SelectItem value="positive">Positive</SelectItem></SelectContent></Select></div>
        <div className="w-[120px] space-y-1.5"><Label>Voto</Label><Select value={rating} onValueChange={setRating}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Tutti</SelectItem>{[5, 4, 3, 2, 1].map((value) => <SelectItem key={value} value={String(value)}>{value} stelle</SelectItem>)}</SelectContent></Select></div>
        <div className="w-[170px] space-y-1.5"><Label>Camera</Label><Select value={roomTypeId} onValueChange={setRoomTypeId}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Tutte</SelectItem><SelectItem value="none">Non abbinata</SelectItem>{roomTypes.map((roomType) => <SelectItem key={roomType.id} value={roomType.id}>{roomType.name}</SelectItem>)}</SelectContent></Select></div>
        <div className="w-[150px] space-y-1.5"><Label>Ordina</Label><Select value={sort} onValueChange={setSort}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="newest">Più recenti</SelectItem><SelectItem value="oldest">Più vecchie</SelectItem><SelectItem value="lowest">Voto più basso</SelectItem><SelectItem value="highest">Voto più alto</SelectItem></SelectContent></Select></div>
        <Button variant="outline" size="icon" onClick={() => void loadDashboard()}><RefreshCw className="h-4 w-4" /></Button>
        <Button asChild variant="outline" className="gap-2"><Link href="/admin/settings/reviews"><Settings className="h-4 w-4" /> Impostazioni</Link></Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Reputation score</CardTitle></CardHeader><CardContent><div className="text-3xl font-semibold">{loading ? "—" : stats?.reputation?.score != null ? stats.reputation.score.toFixed(1) : "n/d"}</div><p className="mt-1 text-xs text-muted-foreground">{stats?.reputation?.reviews_180d ?? 0} recensioni negli ultimi 180 giorni</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Valutazione media</CardTitle></CardHeader><CardContent><div className="flex items-center gap-2 text-3xl font-semibold"><Star className="h-6 w-6 fill-current" />{loading ? "—" : stats?.avg_rating != null ? stats.avg_rating.toFixed(2) : "n/d"}</div><p className="mt-1 text-xs text-muted-foreground">Ultimi 30 gg: {stats?.reputation?.rating_30d != null ? stats.reputation.rating_30d.toFixed(2) : "n/d"}</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Recensioni</CardTitle></CardHeader><CardContent><div className="text-3xl font-semibold">{loading ? "—" : stats?.total ?? total}</div><p className="mt-1 text-xs text-muted-foreground">{stats?.filtered ? "Risultato dei filtri correnti" : "Archivio condiviso Santaddeo"}</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">Sentiment positivo</CardTitle></CardHeader><CardContent><div className="text-3xl font-semibold">{loading ? "—" : `${percentage(stats?.sentiment.positive || 0, sentimentTotal)}%`}</div><p className="mt-1 text-xs text-muted-foreground">{stats?.sentiment.positive || 0} positive · {stats?.sentiment.negative || 0} negative</p></CardContent></Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2"><CardHeader><CardTitle className="text-base">Andamento recensioni · ultimi 12 mesi</CardTitle></CardHeader><CardContent className="h-[320px]">{loading ? <Skeleton className="h-full w-full" /> : <ResponsiveContainer width="100%" height="100%"><ComposedChart data={trendData}><CartesianGrid strokeDasharray="3 3" vertical={false} /><XAxis dataKey="label" tick={{ fontSize: 11 }} /><YAxis yAxisId="left" allowDecimals={false} tick={{ fontSize: 11 }} /><YAxis yAxisId="right" orientation="right" domain={[0, 5]} tick={{ fontSize: 11 }} /><Tooltip /><Legend /><Bar yAxisId="left" dataKey="count" name="Recensioni" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} /><Line yAxisId="right" type="monotone" dataKey="avg" name="Voto medio" stroke="#f59e0b" strokeWidth={2.5} connectNulls /></ComposedChart></ResponsiveContainer>}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-base">Sentiment</CardTitle></CardHeader><CardContent className="space-y-3">{loading ? <Skeleton className="h-28 w-full" /> : <><div className="flex h-4 overflow-hidden rounded-full bg-muted"><div className="bg-emerald-500" style={{ width: `${percentage(stats?.sentiment.positive || 0, sentimentTotal)}%` }} /><div className="bg-slate-400" style={{ width: `${percentage(stats?.sentiment.neutral || 0, sentimentTotal)}%` }} /><div className="bg-rose-500" style={{ width: `${percentage(stats?.sentiment.negative || 0, sentimentTotal)}%` }} /></div><div className="space-y-2 text-sm"><div className="flex justify-between"><span>Positive</span><strong>{stats?.sentiment.positive || 0}</strong></div><div className="flex justify-between"><span>Neutre</span><strong>{stats?.sentiment.neutral || 0}</strong></div><div className="flex justify-between"><span>Negative</span><strong>{stats?.sentiment.negative || 0}</strong></div></div></>}</CardContent></Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2"><CardHeader><CardTitle className="text-base">Canali</CardTitle></CardHeader><CardContent><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{(stats?.platforms || []).map((item) => <div key={item.platform} className="rounded-lg border p-3"><div className="flex justify-between"><span className="font-medium">{platformLabel(item.platform)}</span><Badge variant="outline">{item.count}</Badge></div><div className="mt-2 flex items-center gap-1 text-sm text-muted-foreground"><Star className="h-3.5 w-3.5 fill-current" />{item.avg != null ? item.avg.toFixed(2) : "n/d"}</div></div>)}</div></CardContent></Card>
        <Card><CardHeader className="pb-3"><div className="flex items-center justify-between"><CardTitle className="flex items-center gap-2 text-base"><Sparkles className="h-4 w-4" /> Insights AI</CardTitle><Button size="sm" variant="ghost" onClick={() => void regenerateInsights()} disabled={insightsRegenerating}><RefreshCw className={`h-3.5 w-3.5 ${insightsRegenerating ? "animate-spin" : ""}`} /></Button></div></CardHeader><CardContent className="space-y-4">{insightsLoading ? <Skeleton className="h-32 w-full" /> : !insights ? <p className="text-sm text-muted-foreground">Nessun insight disponibile.</p> : <>{insights.summary ? <p className="text-sm">{insights.summary}</p> : null}{insights.strengths?.length ? <div><div className="mb-1 flex items-center gap-1 text-xs font-semibold text-emerald-700"><ThumbsUp className="h-3.5 w-3.5" /> Punti di forza</div>{insights.strengths.slice(0, 3).map((item) => <p key={item.title} className="text-xs"><strong>{item.title}</strong> · {item.description}</p>)}</div> : null}{insights.weaknesses?.length ? <div><div className="mb-1 flex items-center gap-1 text-xs font-semibold text-rose-700"><ThumbsDown className="h-3.5 w-3.5" /> Aree di miglioramento</div>{insights.weaknesses.slice(0, 3).map((item) => <p key={item.title} className="text-xs"><strong>{item.title}</strong> · {item.description}</p>)}</div> : null}{insights.recurring_topics?.length ? <div className="flex flex-wrap gap-1">{insights.recurring_topics.slice(0, 8).map((topic) => <Badge key={topic.topic} variant="secondary">{topic.topic}</Badge>)}</div> : null}</>}</CardContent></Card>
      </div>

      <Card>
        <CardHeader className="pb-3"><div className="flex items-center justify-between gap-3"><CardTitle className="text-base">Recensioni {total > 0 ? `(${total})` : ""}</CardTitle><span className="text-xs text-muted-foreground">Clicca una recensione per dettaglio, traduzione, risposta o manutenzione</span></div></CardHeader>
        <CardContent className="space-y-3">
          {loading ? [0, 1, 2].map((i) => <Skeleton key={i} className="h-28 w-full" />) : null}
          {!loading && error ? <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{error}</div> : null}
          {!loading && !error && reviews.length === 0 ? <div className="py-10 text-center text-sm text-muted-foreground">Nessuna recensione trovata.</div> : null}
          {!loading && !error ? reviews.map((review) => <button key={review.id} type="button" onClick={() => openReview(review)} className="block w-full rounded-lg border p-4 text-left transition hover:bg-muted/40"><div className="flex items-start justify-between gap-3"><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><Badge variant="outline">{platformLabel(review.platform)}</Badge>{review.rating != null ? <span className="flex items-center gap-1 text-sm font-semibold"><Star className="h-3.5 w-3.5 fill-current" /> {Number(review.rating).toFixed(1)}</span> : null}{review.sentiment ? <Badge variant="secondary">{review.sentiment === "negative" ? "Negativa" : review.sentiment === "positive" ? "Positiva" : "Neutra"}</Badge> : null}{review.roomTypeName ? <Badge variant="outline">{review.roomTypeName}</Badge> : null}{review.author_name ? <span className="text-xs text-muted-foreground">{review.author_name}</span> : null}</div>{review.title ? <h3 className="mt-2 text-sm font-medium">{review.title}</h3> : null}{review.text ? <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-sm text-muted-foreground">{review.text}</p> : null}{review.response_text ? <div className="mt-3 border-l-2 border-primary/40 pl-3 text-xs text-muted-foreground"><span className="font-medium text-primary">Risposta hotel:</span> {review.response_text}</div> : null}</div><div className="shrink-0 text-xs text-muted-foreground">{review.review_date ? new Date(review.review_date).toLocaleDateString("it-IT") : ""}</div></div></button>) : null}
          {total > pageSize ? <div className="flex items-center justify-between border-t pt-4"><span className="text-xs text-muted-foreground">Pagina {page + 1} di {totalPages}</span><div className="flex gap-1"><Button variant="outline" size="icon" disabled={page === 0 || loading} onClick={() => setPage((value) => Math.max(0, value - 1))}><ChevronLeft className="h-4 w-4" /></Button><Button variant="outline" size="icon" disabled={page + 1 >= totalPages || loading} onClick={() => setPage((value) => value + 1)}><ChevronRight className="h-4 w-4" /></Button></div></div> : null}
        </CardContent>
      </Card>

      <Dialog open={Boolean(selected)} onOpenChange={(open) => { if (!open && !savingTask && !savingReply && !publishingReply) setSelected(null) }}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
          {selected ? <div className="space-y-5">
            <DialogHeader><DialogTitle>Recensione · {platformLabel(selected.platform)}</DialogTitle><DialogDescription>Leggi, traduci, rispondi oppure trasforma una criticità in un ticket manutenzione completo.</DialogDescription></DialogHeader>

            <div className="rounded-lg border bg-muted/20 p-4">
              <div className="flex flex-wrap items-center gap-2">{selected.rating != null ? <span className="flex items-center gap-1 font-semibold"><Star className="h-4 w-4 fill-current" /> {selected.rating.toFixed(1)}/5</span> : null}{selected.sentiment ? <Badge variant="secondary">{selected.sentiment === "positive" ? "Positiva" : selected.sentiment === "negative" ? "Negativa" : "Neutra"}</Badge> : null}{selected.roomTypeName ? <Badge variant="outline">{selected.roomTypeName}</Badge> : null}{selected.author_name ? <span className="text-sm text-muted-foreground">{selected.author_name}</span> : null}</div>
              {selected.title ? <h3 className="mt-3 font-semibold">{selected.title}</h3> : null}
              {selected.text ? <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{selected.text}</p> : null}
              <div className="mt-3 flex flex-wrap gap-2"><Button type="button" variant="outline" size="sm" className="gap-1.5" disabled={intelligenceLoading} onClick={() => void loadIntelligence("translate")}>{intelligenceLoading && !showMaintenance ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Languages className="h-3.5 w-3.5" />} Traduci</Button></div>
              {showTranslation && intelligence ? <div className="mt-3 rounded-md border border-sky-200 bg-sky-50/60 p-3"><div className="mb-1 flex items-center gap-1.5 text-sm font-semibold"><Languages className="h-4 w-4 text-sky-700" /> Traduzione italiana</div>{intelligence.translation.title_it ? <p className="font-medium">{intelligence.translation.title_it}</p> : null}{intelligence.translation.text_it ? <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">{intelligence.translation.text_it}</p> : null}</div> : null}
              {selected.response_text ? <div className="mt-4 rounded-md border-l-2 border-primary bg-background p-3 text-sm"><div className="mb-1 flex items-center gap-1.5 font-medium text-primary"><MessageCircle className="h-4 w-4" /> Risposta dell&apos;hotel</div>{selected.response_text}</div> : null}
            </div>

            <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><div className="flex items-center gap-2 font-semibold"><Wrench className="h-4 w-4 text-amber-700" /> Problema di manutenzione?</div><p className="mt-1 text-xs text-muted-foreground">L&apos;IA legge tutta la recensione, riconosce camera/asset e precompila il ticket con ogni dettaglio utile.</p></div><Button type="button" variant="outline" className="gap-2 bg-background" onClick={() => { const next = !showMaintenance; setShowMaintenance(next); if (next) void loadIntelligence("maintenance") }}><Wrench className="h-4 w-4" /> {showMaintenance ? "Chiudi task" : "Segnala task manutenzione"}</Button></div>
              {showMaintenance ? <div className="mt-4 space-y-4 border-t border-amber-200 pt-4">{manubotMessage ? <div className="rounded-md border bg-background p-3 text-sm"><p>{manubotMessage}</p>{manubot?.status === "inactive" ? <Button asChild size="sm" className="mt-3"><a href={manubot.activation_url || "https://www.manubot.it/prezzi"} target="_blank" rel="noreferrer">Attiva ManuBot <ExternalLink className="ml-2 h-4 w-4" /></a></Button> : null}</div> : <>
                {intelligenceLoading ? <div className="flex items-center gap-2 rounded-md border border-violet-200 bg-violet-50/60 p-3 text-sm"><Loader2 className="h-4 w-4 animate-spin text-violet-700" /><span><strong>L&apos;IA sta recuperando tutte le informazioni possibili…</strong></span></div> : intelligence ? <div className="space-y-2 rounded-md border border-violet-200 bg-violet-50/60 p-3"><div className="flex items-center gap-2 text-sm font-semibold"><Sparkles className="h-4 w-4 text-violet-700" /> Dati riconosciuti</div>{detectedLabels.length ? <div className="flex flex-wrap gap-1.5">{detectedLabels.map((label) => <Badge key={label} variant="outline" className="bg-white">{label}</Badge>)}</div> : <p className="text-xs text-muted-foreground">Nessun asset/camera identificato con certezza; i dettagli testuali sono comunque inclusi.</p>}{intelligence.detected.safety_risks.length ? <p className="text-xs font-medium text-red-700">Rischi: {intelligence.detected.safety_risks.join("; ")}</p> : null}</div> : null}
                <div className="space-y-1.5"><Label>Titolo task</Label><Input value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} maxLength={240} /></div>
                <div className="space-y-1.5"><Label>Descrizione completa</Label><Textarea rows={12} value={taskDescription} onChange={(event) => setTaskDescription(event.target.value)} /><p className="text-[11px] text-muted-foreground">Puoi correggere o integrare il testo. Gli asset vengono verificati nuovamente lato server prima della creazione.</p></div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="space-y-1.5"><Label>Responsabile *</Label><Select value={responsible || "none"} onValueChange={(value) => setResponsible(value === "none" ? "" : value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Seleziona</SelectItem>{operators.map((operator) => <SelectItem key={operator.id} value={`operator:${operator.id}`}>{operator.full_name || "Operatore"}</SelectItem>)}{groups.map((group) => <SelectItem key={group.id} value={`group:${group.id}`} disabled={group.member_count === 0}>Gruppo · {group.name}</SelectItem>)}</SelectContent></Select></div>
                  <div className="space-y-1.5"><Label>Priorità ManuBot *</Label><Select value={priority || "none"} onValueChange={(value) => setPriority(value === "none" ? "" : value)}><SelectTrigger><SelectValue placeholder="Priorità configurata" /></SelectTrigger><SelectContent><SelectItem value="none">Seleziona</SelectItem>{priorities.map((item) => <SelectItem key={item.id || item.name} value={item.name}>{item.label || item.name}{item.response_time_hours != null ? ` · ${item.response_time_hours}h` : ""}</SelectItem>)}</SelectContent></Select>{priorities.length === 0 ? <p className="text-xs text-destructive">Nessuna priorità attiva trovata in ManuBot.</p> : null}</div>
                  <div className="space-y-1.5"><Label>Tempo (min)</Label><Input type="number" min={5} max={1440} value={minutes} onChange={(event) => setMinutes(event.target.value)} /></div>
                </div>
                <div className="flex justify-end"><Button type="button" onClick={() => void createMaintenanceTask()} disabled={savingTask || intelligenceLoading || !priority} className="gap-2">{savingTask ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wrench className="h-4 w-4" />} Crea task manutenzione</Button></div>
              </>}</div> : null}
            </div>

            <div className="space-y-3 border-t pt-5"><div className="flex items-center gap-2 text-base font-semibold"><Reply className="h-4 w-4" /> Rispondi alla recensione</div><div className="space-y-1.5"><Label>Indicazioni per l&apos;AI (facoltative)</Label><Input value={replyInstructions} onChange={(event) => setReplyInstructions(event.target.value)} placeholder="Es. ringrazia, chiarisci il problema della SPA, tono più formale…" /></div><Button type="button" variant="secondary" onClick={() => void generateReply()} disabled={generatingReply} className="w-full gap-2">{generatingReply ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} {replyDraft ? "Rigenera bozza con AI" : "Genera bozza con AI"}</Button><Textarea rows={8} value={replyDraft} onChange={(event) => setReplyDraft(event.target.value)} placeholder="La risposta apparirà qui e può essere modificata liberamente." /><div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" onClick={() => void copyReply()} disabled={!replyDraft.trim() || savingReply} className="gap-2">{copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied ? "Copiata" : "Copia"}</Button><Button type="button" variant="outline" onClick={() => void saveReply("draft")} disabled={!replyDraft.trim() || savingReply}>{savingReply ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Salva bozza</Button>{selected.platform.toLowerCase() === "google" ? <Button type="button" onClick={() => void publishReply()} disabled={!replyDraft.trim() || publishingReply} className="gap-2">{publishingReply ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Pubblica su Google</Button> : null}</div>{selected.platform.toLowerCase() !== "google" ? <p className="text-xs text-muted-foreground">La pubblicazione diretta dipende dall&apos;API ufficiale del canale; puoi sempre copiare la risposta.</p> : null}</div>
          </div> : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
