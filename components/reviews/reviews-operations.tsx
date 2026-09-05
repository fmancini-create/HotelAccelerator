"use client"

import Link from "next/link"
import { useCallback, useEffect, useMemo, useState } from "react"
import { ChevronLeft, ChevronRight, ExternalLink, Loader2, RefreshCw, Settings, Star, Wrench } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"

type Review = {
  id: string
  platform: string
  author_name: string | null
  rating: number | null
  title: string | null
  text: string | null
  review_date: string | null
  sentiment: "positive" | "neutral" | "negative" | null
}

type ManuBotContext = {
  status?: "active" | "inactive" | "configuration_required"
  active?: boolean
  reason?: string | null
  activation_url?: string
  task_data?: {
    operators?: Array<{ id: string; full_name: string | null }>
    operatorGroups?: Array<{ id: string; name: string; member_count?: number | null }>
  } | null
}

function defaultPriority(review: Review): "low" | "normal" | "high" | "urgent" {
  if (review.rating != null && review.rating <= 1.5) return "urgent"
  if ((review.rating != null && review.rating <= 2.5) || review.sentiment === "negative") return "high"
  return "normal"
}

function defaultTitle(review: Review) {
  const score = review.rating != null ? ` ${Number(review.rating).toFixed(1)}/5` : ""
  return review.title?.trim()
    ? `Recensione ${review.platform}${score}: ${review.title.trim()}`.slice(0, 240)
    : `Recensione ${review.platform}${score} da gestire`
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

export function ReviewsOperations() {
  const [reviews, setReviews] = useState<Review[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState("")
  const [sentiment, setSentiment] = useState("all")
  const [sort, setSort] = useState("newest")
  const pageSize = 25

  const [manubot, setManubot] = useState<ManuBotContext | null>(null)
  const [manubotLoading, setManubotLoading] = useState(true)
  const [selected, setSelected] = useState<Review | null>(null)
  const [responsible, setResponsible] = useState("")
  const [minutes, setMinutes] = useState("60")
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [priority, setPriority] = useState<"low" | "normal" | "high" | "urgent">("normal")
  const [saving, setSaving] = useState(false)

  const loadReviews = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize), sort })
      if (q.trim()) params.set("q", q.trim())
      if (sentiment !== "all") params.set("sentiment", sentiment)
      const res = await fetch(`/api/admin/reviews/list?${params}`, { cache: "no-store" })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || "Impossibile caricare le recensioni")
      setReviews(Array.isArray(body.reviews) ? body.reviews : [])
      setTotal(Number(body.total || 0))
    } catch (err) {
      setReviews([])
      setTotal(0)
      setError(err instanceof Error ? err.message : "Impossibile caricare le recensioni")
    } finally {
      setLoading(false)
    }
  }, [page, q, sentiment, sort])

  useEffect(() => {
    const timer = window.setTimeout(() => void loadReviews(), 250)
    return () => window.clearTimeout(timer)
  }, [loadReviews])

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
      .finally(() => {
        if (!cancelled) setManubotLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  useEffect(() => { setPage(0) }, [q, sentiment, sort])

  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const operators = manubot?.task_data?.operators || []
  const groups = manubot?.task_data?.operatorGroups || []

  const manubotMessage = useMemo(() => {
    if (manubotLoading) return "Verifico ManuBot…"
    if (manubot?.status === "inactive") return "ManuBot non è attivo per questa struttura."
    if (manubot?.status === "configuration_required") return "ManuBot è attivo ma il collegamento tecnico alla struttura va completato."
    return null
  }, [manubotLoading, manubot])

  const openTicket = (review: Review) => {
    setSelected(review)
    setResponsible("")
    setMinutes("60")
    setTitle(defaultTitle(review))
    setDescription(defaultDescription(review))
    setPriority(defaultPriority(review))
  }

  const createTicket = async () => {
    if (!selected) return
    const expectedResolutionMinutes = Number(minutes)
    if (!responsible) return toast.error("Scegli un responsabile")
    if (!Number.isInteger(expectedResolutionMinutes) || expectedResolutionMinutes < 5 || expectedResolutionMinutes > 1440) {
      return toast.error("Il tempo stimato deve essere tra 5 e 1440 minuti")
    }
    if (!title.trim()) return toast.error("Inserisci un titolo")

    setSaving(true)
    try {
      const res = await fetch("/api/admin/reviews/manubot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reviewId: selected.id,
          title: title.trim(),
          description: description.trim(),
          priority,
          responsible,
          expectedResolutionMinutes,
          review: {
            platform: selected.platform,
            rating: selected.rating,
            author_name: selected.author_name,
            review_date: selected.review_date,
            sentiment: selected.sentiment,
          },
        }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || "Creazione ticket non riuscita")
      toast.success("Ticket ManuBot creato dalla recensione")
      setSelected(null)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Creazione ticket non riuscita")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[220px] flex-1 space-y-1.5">
          <Label htmlFor="reviews-search">Cerca</Label>
          <Input id="reviews-search" placeholder="Testo, titolo o autore" value={q} onChange={(event) => setQ(event.target.value)} />
        </div>
        <div className="w-[180px] space-y-1.5">
          <Label>Sentiment</Label>
          <Select value={sentiment} onValueChange={setSentiment}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tutte</SelectItem>
              <SelectItem value="negative">Negative</SelectItem>
              <SelectItem value="neutral">Neutre</SelectItem>
              <SelectItem value="positive">Positive</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="w-[180px] space-y-1.5">
          <Label>Ordina</Label>
          <Select value={sort} onValueChange={setSort}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="newest">Più recenti</SelectItem>
              <SelectItem value="oldest">Più vecchie</SelectItem>
              <SelectItem value="lowest">Voto più basso</SelectItem>
              <SelectItem value="highest">Voto più alto</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button type="button" variant="outline" size="icon" onClick={() => void loadReviews()} aria-label="Aggiorna recensioni">
          <RefreshCw className="h-4 w-4" />
        </Button>
        <Button asChild variant="outline" className="gap-2">
          <Link href="/admin/settings/reviews"><Settings className="h-4 w-4" /> Impostazioni</Link>
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Recensioni {total > 0 ? `(${total})` : ""}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? [0, 1, 2].map((i) => <Skeleton key={i} className="h-32 w-full" />) : null}
          {!loading && error ? <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{error}</div> : null}
          {!loading && !error && reviews.length === 0 ? <div className="py-10 text-center text-sm text-muted-foreground">Nessuna recensione trovata.</div> : null}
          {!loading && !error ? reviews.map((review) => (
            <div key={review.id} className="rounded-lg border p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{review.platform}</Badge>
                    {review.rating != null ? <span className="flex items-center gap-1 text-sm font-semibold"><Star className="h-3.5 w-3.5 fill-current" /> {Number(review.rating).toFixed(1)}</span> : null}
                    {review.sentiment ? <Badge variant="secondary">{review.sentiment === "negative" ? "Negativa" : review.sentiment === "positive" ? "Positiva" : "Neutra"}</Badge> : null}
                    {review.author_name ? <span className="text-xs text-muted-foreground">{review.author_name}</span> : null}
                  </div>
                  {review.title ? <h3 className="mt-2 text-sm font-medium">{review.title}</h3> : null}
                  {review.text ? <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{review.text}</p> : null}
                </div>
                <div className="shrink-0 text-xs text-muted-foreground">{review.review_date ? new Date(review.review_date).toLocaleDateString("it-IT") : ""}</div>
              </div>
              <div className="mt-3 flex justify-end">
                <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={() => openTicket(review)}>
                  <Wrench className="h-3.5 w-3.5" /> Crea ticket
                </Button>
              </div>
            </div>
          )) : null}

          {total > pageSize ? (
            <div className="flex items-center justify-between border-t pt-4">
              <span className="text-xs text-muted-foreground">Pagina {page + 1} di {totalPages}</span>
              <div className="flex gap-1">
                <Button variant="outline" size="icon" disabled={page === 0 || loading} onClick={() => setPage((value) => Math.max(0, value - 1))}><ChevronLeft className="h-4 w-4" /></Button>
                <Button variant="outline" size="icon" disabled={page + 1 >= totalPages || loading} onClick={() => setPage((value) => value + 1)}><ChevronRight className="h-4 w-4" /></Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Dialog open={Boolean(selected)} onOpenChange={(open) => { if (!open && !saving) setSelected(null) }}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader><DialogTitle>Crea ticket ManuBot dalla recensione</DialogTitle></DialogHeader>
          {manubotMessage ? (
            <div className="space-y-4 rounded-lg border bg-muted/30 p-4 text-sm">
              <p>{manubotMessage}</p>
              {manubot?.status === "inactive" ? <Button asChild><a href={manubot.activation_url || "https://www.manubot.it/prezzi"} target="_blank" rel="noreferrer">Attiva ManuBot <ExternalLink className="ml-2 h-4 w-4" /></a></Button> : null}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-1.5"><Label>Titolo</Label><Input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={240} /></div>
              <div className="space-y-1.5"><Label>Descrizione</Label><Textarea rows={6} value={description} onChange={(event) => setDescription(event.target.value)} /></div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Responsabile *</Label>
                  <Select value={responsible || "none"} onValueChange={(value) => setResponsible(value === "none" ? "" : value)}>
                    <SelectTrigger><SelectValue placeholder="Tecnico o gruppo" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Seleziona</SelectItem>
                      {operators.map((operator) => <SelectItem key={operator.id} value={`operator:${operator.id}`}>{operator.full_name || "Operatore"}</SelectItem>)}
                      {groups.map((group) => <SelectItem key={group.id} value={`group:${group.id}`} disabled={group.member_count === 0}>Gruppo · {group.name}{group.member_count === 0 ? " (senza membri)" : ""}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Priorità</Label>
                  <Select value={priority} onValueChange={(value) => setPriority(value as typeof priority)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="low">Bassa</SelectItem><SelectItem value="normal">Normale</SelectItem><SelectItem value="high">Alta</SelectItem><SelectItem value="urgent">Urgente</SelectItem></SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5"><Label>Tempo stimato di risoluzione (minuti)</Label><Input type="number" min={5} max={1440} value={minutes} onChange={(event) => setMinutes(event.target.value)} /></div>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setSelected(null)} disabled={saving}>Annulla</Button>
            {!manubotMessage ? <Button type="button" onClick={createTicket} disabled={saving || !responsible || !title.trim()}>{saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wrench className="mr-2 h-4 w-4" />} Crea ticket</Button> : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
