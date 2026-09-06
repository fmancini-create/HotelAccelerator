"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { format } from "date-fns"
import { it } from "date-fns/locale"
import { BedDouble, Link2, Loader2, Search, X } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

type Candidate = {
  id: string
  guestName: string | null
  checkInDate: string | null
  checkOutDate: string | null
  roomTypeId: string | null
  roomTypeName: string | null
  score: number
}

type MatchSource = "auto" | "manual" | null

export function ReviewBookingAssign({
  reviewId,
  initialRoomTypeName,
  initialMatchSource,
  initialBookingId,
  onChanged,
}: {
  reviewId: string
  initialRoomTypeName: string | null
  initialMatchSource: MatchSource
  initialBookingId: string | null
  onChanged?: () => void
}) {
  const [roomTypeName, setRoomTypeName] = useState(initialRoomTypeName)
  const [matchSource, setMatchSource] = useState<MatchSource>(initialMatchSource)
  const [bookingId, setBookingId] = useState(initialBookingId)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [search, setSearch] = useState("")
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setRoomTypeName(initialRoomTypeName)
    setMatchSource(initialMatchSource)
    setBookingId(initialBookingId)
  }, [initialRoomTypeName, initialMatchSource, initialBookingId])

  const load = useCallback(async (term: string) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ reviewId })
      if (term.trim()) params.set("search", term.trim())
      const res = await fetch(`/api/admin/reviews/booking-candidates?${params}`, { cache: "no-store" })
      if (res.ok) {
        const body = await res.json()
        setCandidates(Array.isArray(body.candidates) ? body.candidates : [])
      } else {
        setCandidates([])
      }
    } finally {
      setLoading(false)
    }
  }, [reviewId])

  useEffect(() => {
    if (open) void load("")
  }, [open, load])

  useEffect(() => {
    if (!open) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => void load(search), 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [search, open, load])

  async function assign(candidate: Candidate | null) {
    setSaving(true)
    try {
      const res = await fetch("/api/admin/reviews/assign-booking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewId, bookingId: candidate?.id ?? null }),
      })
      if (!res.ok) return
      const body = await res.json()
      if (candidate) {
        setRoomTypeName(body.roomType?.name ?? candidate.roomTypeName ?? null)
        setMatchSource("manual")
        setBookingId(candidate.id)
      } else {
        setRoomTypeName(null)
        setMatchSource(null)
        setBookingId(null)
      }
      setOpen(false)
      setSearch("")
      onChanged?.()
    } finally {
      setSaving(false)
    }
  }

  const isAssigned = Boolean(bookingId)

  return (
    <div className="flex flex-wrap items-center gap-2" onClick={(event) => event.stopPropagation()}>
      {isAssigned ? (
        <Badge variant="secondary" className="gap-1 text-[10px] font-normal bg-primary/10 text-primary">
          <BedDouble className="h-3 w-3" />
          {roomTypeName || "Tipologia n/d"}
          <span className="text-primary/60">{matchSource === "manual" ? "· manuale" : "· auto"}</span>
        </Badge>
      ) : (
        <span className="text-[10px] italic text-muted-foreground">Nessuna tipologia associata</span>
      )}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm" className="h-6 px-2 text-[10px] text-muted-foreground hover:text-foreground">
            <Link2 className="mr-1 h-3 w-3" />
            {isAssigned ? "Cambia" : "Associa prenotazione"}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-80 p-0">
          <div className="border-b p-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                autoFocus
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Cerca per nome ospite..."
                className="h-8 pl-8 text-xs"
              />
            </div>
          </div>
          <div className="max-h-72 overflow-y-auto">
            {loading ? (
              <div className="flex justify-center py-6 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /></div>
            ) : candidates.length === 0 ? (
              <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                Nessuna prenotazione trovata{search ? " per questa ricerca" : " nelle date del soggiorno"}.
              </div>
            ) : (
              <ul className="py-1">
                {candidates.map((candidate) => (
                  <li key={candidate.id}>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => void assign(candidate)}
                      className="w-full px-3 py-2 text-left transition-colors hover:bg-muted/60 disabled:opacity-50"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-xs font-medium">{candidate.guestName || "Ospite senza nome"}</span>
                        {candidate.roomTypeName ? <Badge variant="outline" className="shrink-0 text-[9px] font-normal">{candidate.roomTypeName}</Badge> : null}
                      </div>
                      <div className="mt-0.5 text-[10px] text-muted-foreground">
                        {candidate.checkInDate ? format(new Date(candidate.checkInDate), "d MMM yyyy", { locale: it }) : "?"}
                        {" → "}
                        {candidate.checkOutDate ? format(new Date(candidate.checkOutDate), "d MMM yyyy", { locale: it }) : "?"}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {isAssigned ? (
            <div className="border-t p-2">
              <Button variant="ghost" size="sm" disabled={saving} onClick={() => void assign(null)} className="h-7 w-full text-[11px] text-destructive hover:text-destructive">
                <X className="mr-1 h-3 w-3" />
                Rimuovi associazione
              </Button>
            </div>
          ) : null}
        </PopoverContent>
      </Popover>
    </div>
  )
}
