"use client"

import { useState } from "react"
import useSWR, { mutate } from "swr"
import Link from "next/link"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import {
  Check,
  X,
  Clock,
  MapPin,
  Star,
  Loader2,
  Mail,
  Phone,
  Globe,
  ChevronLeft,
  AlertCircle,
} from "lucide-react"
import { toast } from "sonner"

const fetcher = (url: string) => fetch(url, { cache: "no-store" }).then((r) => r.json())

type Req = {
  id: string
  prospect_id: string
  agent_id: string
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
    email: string | null
    website: string | null
    phone: string | null
    status: string | null
    assigned_agent_id: string | null
  } | null
  sales_agents: {
    id: string
    display_name: string | null
    email: string | null
  } | null
}

export function AssignmentRequestsManager() {
  const [tab, setTab] = useState<"pending" | "approved" | "rejected" | "cancelled">("pending")
  const swrKey = `/api/superadmin/prospects/assignment-requests?status=${tab}`
  const { data, isLoading } = useSWR<{
    requests: Req[]
    counts: Record<string, number>
  }>(swrKey, fetcher)

  const requests = data?.requests || []
  const counts = data?.counts || {}

  const refresh = () => mutate(swrKey)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Link
          href="/superadmin/prospects"
          className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center"
        >
          <ChevronLeft className="h-4 w-4 mr-1" />
          Torna a Prospects
        </Link>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList>
          <TabsTrigger value="pending" className="relative">
            In attesa
            {counts.pending > 0 && (
              <Badge className="ml-2 bg-amber-500 text-xs px-1.5 py-0">
                {counts.pending}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="approved">
            Approvate
            <span className="ml-2 text-xs text-muted-foreground">{counts.approved || 0}</span>
          </TabsTrigger>
          <TabsTrigger value="rejected">
            Rifiutate
            <span className="ml-2 text-xs text-muted-foreground">{counts.rejected || 0}</span>
          </TabsTrigger>
          <TabsTrigger value="cancelled">
            Annullate
            <span className="ml-2 text-xs text-muted-foreground">{counts.cancelled || 0}</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value={tab} className="mt-6">
          {isLoading ? (
            <Card className="p-12 text-center text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin inline-block mr-2" />
              Caricamento...
            </Card>
          ) : requests.length === 0 ? (
            <Card className="p-12 text-center text-muted-foreground">
              {tab === "pending"
                ? "Nessuna richiesta in attesa."
                : "Nessuna richiesta in questa categoria."}
            </Card>
          ) : (
            <ul className="space-y-3">
              {requests.map((r) => (
                <RequestCard key={r.id} request={r} onChanged={refresh} canDecide={tab === "pending"} />
              ))}
            </ul>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}

function RequestCard({
  request: r,
  onChanged,
  canDecide,
}: {
  request: Req
  onChanged: () => void
  canDecide: boolean
}) {
  const [open, setOpen] = useState<"approve" | "reject" | null>(null)
  const [notes, setNotes] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const submit = async () => {
    if (!open) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/superadmin/prospects/assignment-requests/${r.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: open,
          decision_notes: notes.trim() || undefined,
        }),
      })
      const json = await res.json()
      if (!res.ok) {
        toast.error(json.error || "Errore")
        return
      }
      toast.success(open === "approve" ? "Richiesta approvata" : "Richiesta rifiutata")
      setOpen(null)
      setNotes("")
      onChanged()
    } catch (err: any) {
      toast.error(err?.message || "Errore di rete")
    } finally {
      setSubmitting(false)
    }
  }

  const p = r.prospects
  const a = r.sales_agents

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-base">{p?.name || "(prospect cancellato)"}</span>
            {p?.stars && (
              <span className="inline-flex items-center text-xs text-amber-600">
                <Star className="h-3 w-3 fill-current mr-0.5" />
                {p.stars}
              </span>
            )}
            {p?.category && (
              <Badge variant="outline" className="text-xs font-normal">
                {p.category}
              </Badge>
            )}
            <StatusBadge status={r.status} />
          </div>

          <div className="text-sm text-muted-foreground mt-1 flex items-center gap-3 flex-wrap">
            {(p?.city || p?.province) && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {[p?.city, p?.province, p?.region].filter(Boolean).join(", ")}
              </span>
            )}
            {p?.email && (
              <span className="inline-flex items-center gap-1 truncate max-w-[260px]">
                <Mail className="h-3 w-3" />
                {p.email}
              </span>
            )}
            {p?.website && (
              <span className="inline-flex items-center gap-1 truncate max-w-[260px]">
                <Globe className="h-3 w-3" />
                {p.website.replace(/^https?:\/\//, "")}
              </span>
            )}
            {p?.phone && (
              <span className="inline-flex items-center gap-1">
                <Phone className="h-3 w-3" />
                {p.phone}
              </span>
            )}
          </div>

          <div className="mt-3 rounded-md bg-muted/40 p-3 text-sm">
            <div className="text-xs text-muted-foreground mb-1">
              Richiesta da{" "}
              <span className="font-medium text-foreground">
                {a?.display_name || a?.email || "Venditore sconosciuto"}
              </span>
              {" · "}
              {new Date(r.created_at).toLocaleDateString("it-IT", {
                day: "2-digit",
                month: "long",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </div>
            {r.message ? (
              <p className="text-sm italic">&ldquo;{r.message}&rdquo;</p>
            ) : (
              <p className="text-xs text-muted-foreground">Nessun messaggio</p>
            )}
          </div>

          {r.status !== "pending" && r.decided_at && (
            <div className="mt-2 text-xs text-muted-foreground">
              Decisa il{" "}
              {new Date(r.decided_at).toLocaleDateString("it-IT", {
                day: "2-digit",
                month: "long",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
              {r.decision_notes ? ` · ${r.decision_notes}` : ""}
            </div>
          )}

          {r.status === "pending" && p?.assigned_agent_id && p.assigned_agent_id !== r.agent_id && (
            <div className="mt-2 text-xs text-rose-600 flex items-start gap-1">
              <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
              <span>
                Attenzione: questo prospect e&apos; stato gia&apos; assegnato ad un altro venditore. Approvarla
                fallira&apos; (auto-rifiuto).
              </span>
            </div>
          )}
        </div>

        {canDecide && (
          <div className="flex items-center gap-2 shrink-0">
            <Button
              size="sm"
              variant="outline"
              className="border-rose-300 text-rose-700 hover:bg-rose-50"
              onClick={() => setOpen("reject")}
            >
              <X className="h-3.5 w-3.5 mr-1" />
              Rifiuta
            </Button>
            <Button
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700"
              onClick={() => setOpen("approve")}
            >
              <Check className="h-3.5 w-3.5 mr-1" />
              Approva
            </Button>
          </div>
        )}
      </div>

      <Dialog open={!!open} onOpenChange={(o) => (o ? null : setOpen(null))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {open === "approve" ? "Approva assegnazione" : "Rifiuta richiesta"}
            </DialogTitle>
            <DialogDescription>
              {open === "approve"
                ? `Stai assegnando "${p?.name}" a ${a?.display_name || a?.email}. Eventuali altre richieste pending sullo stesso prospect verranno auto-rifiutate.`
                : `Stai rifiutando la richiesta di ${a?.display_name || a?.email} per "${p?.name}".`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <label className="text-sm font-medium">Note per il venditore (opzionale)</label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={
                open === "approve"
                  ? "Es. assegnata, contattalo entro la settimana"
                  : "Es. struttura gia' contattata da altro canale"
              }
              rows={3}
              maxLength={500}
            />
            <p className="text-xs text-muted-foreground text-right">{notes.length}/500</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(null)} disabled={submitting}>
              Annulla
            </Button>
            <Button
              onClick={submit}
              disabled={submitting}
              className={
                open === "approve" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-rose-600 hover:bg-rose-700"
              }
            >
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {open === "approve" ? "Approva" : "Rifiuta"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}

function StatusBadge({ status }: { status: string }) {
  if (status === "pending") {
    return (
      <Badge variant="outline" className="border-amber-500 text-amber-700 bg-amber-50">
        <Clock className="h-3 w-3 mr-1" />
        In attesa
      </Badge>
    )
  }
  if (status === "approved") {
    return (
      <Badge className="bg-emerald-600 hover:bg-emerald-600">
        <Check className="h-3 w-3 mr-1" />
        Approvata
      </Badge>
    )
  }
  if (status === "rejected") {
    return (
      <Badge variant="outline" className="border-rose-300 text-rose-700 bg-rose-50">
        Rifiutata
      </Badge>
    )
  }
  if (status === "cancelled") {
    return (
      <Badge variant="outline" className="text-muted-foreground">
        Annullata
      </Badge>
    )
  }
  return <Badge variant="outline">{status}</Badge>
}
