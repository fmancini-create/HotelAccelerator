"use client"

import useSWR, { mutate } from "swr"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Clock, AlertCircle, Check, X } from "lucide-react"
import { toast } from "sonner"

const fetcher = (url: string) => fetch(url, { cache: "no-store" }).then((r) => r.json())

type Req = {
  id: string
  prospect_id: string
  status: string
  message: string | null
  decision_notes: string | null
  created_at: string
  decided_at: string | null
  prospects: {
    id: string
    name: string
    city: string | null
    province: string | null
    region: string | null
    category: string | null
    stars: number | null
  } | null
}

/**
 * Mostra le richieste di assegnazione ancora in attesa o decise di recente
 * (rejected ultimi 14gg, approved ultimi 7gg). Lista ordinata dalla piu'
 * recente. Tasto "Annulla" per cancellare richieste pending.
 */
export function MyAssignmentRequests() {
  const { data, isLoading } = useSWR<{ requests: Req[] }>(
    "/api/sales/prospects/request-assignment",
    fetcher,
  )

  if (isLoading) return null
  const all = data?.requests || []

  // Mostra: pending tutti + rejected ultimi 14gg + approved ultimi 7gg
  const now = Date.now()
  const visible = all.filter((r) => {
    if (r.status === "pending") return true
    if (!r.decided_at) return false
    const ts = new Date(r.decided_at).getTime()
    if (r.status === "rejected") return now - ts < 14 * 24 * 3600 * 1000
    if (r.status === "approved") return now - ts < 7 * 24 * 3600 * 1000
    return false
  })

  if (visible.length === 0) return null

  const cancelOne = async (id: string) => {
    try {
      const res = await fetch(
        `/api/sales/prospects/request-assignment?id=${encodeURIComponent(id)}`,
        { method: "DELETE" },
      )
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error || "Errore")
        return
      }
      toast.success("Richiesta annullata")
      mutate("/api/sales/prospects/request-assignment")
    } catch (err: any) {
      toast.error(err?.message || "Errore di rete")
    }
  }

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold">Le tue richieste di assegnazione</h3>
        <span className="text-xs text-muted-foreground">{visible.length} richieste</span>
      </div>
      <ul className="divide-y -mx-2">
        {visible.map((r) => (
          <li key={r.id} className="px-2 py-2 flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="font-medium text-sm">{r.prospects?.name || "(struttura sconosciuta)"}</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {[r.prospects?.city, r.prospects?.province, r.prospects?.region]
                  .filter(Boolean)
                  .join(" · ") || "—"}
              </div>
              {r.message && (
                <div className="text-xs text-muted-foreground italic mt-1 line-clamp-2">
                  &ldquo;{r.message}&rdquo;
                </div>
              )}
              {r.status === "rejected" && r.decision_notes && (
                <div className="text-xs text-rose-600 mt-1 flex items-start gap-1">
                  <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
                  <span>{r.decision_notes}</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <RequestStatusBadge status={r.status} />
              {r.status === "pending" && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => cancelOne(r.id)}
                  className="h-7 px-2 text-xs"
                >
                  <X className="h-3 w-3 mr-1" />
                  Annulla
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  )
}

function RequestStatusBadge({ status }: { status: string }) {
  if (status === "pending") {
    return (
      <Badge variant="outline" className="border-amber-500 text-amber-700 bg-amber-50 whitespace-nowrap">
        <Clock className="h-3 w-3 mr-1" />
        In attesa
      </Badge>
    )
  }
  if (status === "approved") {
    return (
      <Badge className="bg-emerald-600 hover:bg-emerald-600 whitespace-nowrap">
        <Check className="h-3 w-3 mr-1" />
        Approvata
      </Badge>
    )
  }
  if (status === "rejected") {
    return (
      <Badge variant="outline" className="border-rose-300 text-rose-700 bg-rose-50 whitespace-nowrap">
        Rifiutata
      </Badge>
    )
  }
  return <Badge variant="outline">{status}</Badge>
}
