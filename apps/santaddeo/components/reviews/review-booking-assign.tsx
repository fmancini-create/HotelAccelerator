"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { BedDouble, Check, Link2, Loader2, Search, X } from "lucide-react"
import { format } from "date-fns"
import { it } from "date-fns/locale"

type Candidate = {
  id: string
  guestName: string | null
  checkInDate: string | null
  checkOutDate: string | null
  roomTypeId: string | null
  roomTypeName: string | null
  score: number
}

/**
 * Mostra la tipologia camera associata a una recensione e consente di
 * associare/cambiare manualmente la prenotazione (da cui deriva la tipologia).
 * - Se associata: badge tipologia + sorgente (auto/manuale) e azione "Cambia".
 * - Se non associata: bottone "Associa prenotazione" che apre il selettore.
 */
export function ReviewBookingAssign({
  reviewId,
  initialRoomTypeName,
  initialMatchSource,
  initialBookingId,
}: {
  reviewId: string
  initialRoomTypeName: string | null
  initialMatchSource: "auto" | "manual" | null
  initialBookingId: string | null
}) {
  const [roomTypeName, setRoomTypeName] = useState(initialRoomTypeName)
  const [matchSource, setMatchSource] = useState(initialMatchSource)
  const [bookingId, setBookingId] = useState(initialBookingId)

  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [search, setSearch] = useState("")
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const load = useCallback(
    async (term: string) => {
      setLoading(true)
      try {
        const params = new URLSearchParams({ reviewId })
        if (term.trim()) params.set("search", term.trim())
        const res = await fetch(`/api/reviews/booking-candidates?${params}`)
        if (res.ok) {
          const body = await res.json()
          setCandidates(body.candidates || [])
        }
      } finally {
        setLoading(false)
      }
    },
    [reviewId],
  )

  // Carica i candidati all'apertura del popover.
  useEffect(() => {
    if (open) load("")
  }, [open, load])

  // Ricerca con debounce.
  useEffect(() => {
    if (!open) return
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => load(search), 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [search, open, load])

  async function assign(candidate: Candidate | null) {
    setSaving(true)
    try {
      const res = await fetch("/api/reviews/assign-booking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reviewId, bookingId: candidate?.id ?? null }),
      })
      if (res.ok) {
        const body = await res.json()
        if (candidate) {
          setRoomTypeName(body.roomType?.name ?? null)
          setMatchSource("manual")
          setBookingId(candidate.id)
        } else {
          setRoomTypeName(null)
          setMatchSource(null)
          setBookingId(null)
        }
        setOpen(false)
        setSearch("")
      }
    } finally {
      setSaving(false)
    }
  }

  const isAssigned = !!bookingId

  return (
    <div className="flex items-center gap-2">
      {isAssigned ? (
        <Badge variant="secondary" className="gap-1 text-[10px] font-normal bg-primary/10 text-primary">
          <BedDouble className="h-3 w-3" />
          {roomTypeName || "Tipologia n/d"}
          <span className="text-primary/60">{matchSource === "manual" ? "· manuale" : "· auto"}</span>
        </Badge>
      ) : (
        <span className="text-[10px] text-muted-foreground italic">Nessuna tipologia associata</span>
      )}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-[10px] text-muted-foreground hover:text-foreground"
          >
            <Link2 className="h-3 w-3 mr-1" />
            {isAssigned ? "Cambia" : "Associa prenotazione"}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80 p-0">
          <div className="p-2 border-b">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cerca per nome ospite..."
                className="h-8 pl-8 text-xs"
              />
            </div>
          </div>
          <div className="max-h-72 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-6 text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            ) : candidates.length === 0 ? (
              <div className="py-6 text-center text-xs text-muted-foreground px-3">
                Nessuna prenotazione trovata{search ? " per questa ricerca" : " nelle date del soggiorno"}.
              </div>
            ) : (
              <ul className="py-1">
                {candidates.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => assign(c)}
                      className="w-full text-left px-3 py-2 hover:bg-muted/60 transition-colors disabled:opacity-50"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium truncate">{c.guestName || "Ospite senza nome"}</span>
                        {c.roomTypeName && (
                          <Badge variant="outline" className="text-[9px] font-normal shrink-0">
                            {c.roomTypeName}
                          </Badge>
                        )}
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        {c.checkInDate ? format(new Date(c.checkInDate), "d MMM yyyy", { locale: it }) : "?"}
                        {" → "}
                        {c.checkOutDate ? format(new Date(c.checkOutDate), "d MMM yyyy", { locale: it }) : "?"}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {isAssigned && (
            <div className="p-2 border-t">
              <Button
                variant="ghost"
                size="sm"
                disabled={saving}
                onClick={() => assign(null)}
                className="h-7 w-full text-[11px] text-destructive hover:text-destructive"
              >
                <X className="h-3 w-3 mr-1" />
                Rimuovi associazione
              </Button>
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  )
}
