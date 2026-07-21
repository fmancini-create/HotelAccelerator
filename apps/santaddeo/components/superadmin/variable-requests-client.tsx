"use client"

import { useState } from "react"
import useSWR from "swr"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  CheckCircle2,
  Clock,
  XCircle,
  MessageCircle,
  Eye,
  Filter,
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"

interface VariableRequest {
  id: string
  hotel_id: string
  requested_by: string
  proposed_name: string
  description: string
  datasource: string
  frequency: string | null
  format: string | null
  rationale: string | null
  status: "pending" | "approved" | "rejected" | "needs_info"
  reviewed_by: string | null
  review_notes: string | null
  reviewed_at: string | null
  created_at: string
  hotels?: { name: string } | null
  requester?: { email: string | null; full_name: string | null } | null
}

const fetcher = (url: string) => fetch(url).then((r) => r.json())

function StatusBadge({ status }: { status: VariableRequest["status"] }) {
  const map: Record<VariableRequest["status"], { cls: string; icon: any; label: string }> = {
    pending: { cls: "border-amber-300 text-amber-700 bg-amber-50", icon: Clock, label: "In attesa" },
    approved: { cls: "border-emerald-300 text-emerald-700 bg-emerald-50", icon: CheckCircle2, label: "Approvata" },
    rejected: { cls: "border-rose-300 text-rose-700 bg-rose-50", icon: XCircle, label: "Rifiutata" },
    needs_info: { cls: "border-blue-300 text-blue-700 bg-blue-50", icon: MessageCircle, label: "Servono info" },
  }
  const { cls, icon: Icon, label } = map[status]
  return (
    <Badge variant="outline" className={cls}>
      <Icon className="h-3 w-3 mr-1" /> {label}
    </Badge>
  )
}

export function VariableRequestsClient({
  initialRequests,
}: {
  initialRequests: VariableRequest[]
}) {
  const { toast } = useToast()
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const swrKey =
    statusFilter === "all"
      ? `/api/superadmin/pricing-variable-requests`
      : `/api/superadmin/pricing-variable-requests?status=${statusFilter}`
  const { data, mutate } = useSWR<{ requests: VariableRequest[] }>(swrKey, fetcher, {
    fallbackData: statusFilter === "all" ? { requests: initialRequests } : undefined,
  })
  const [selected, setSelected] = useState<VariableRequest | null>(null)
  const [newStatus, setNewStatus] = useState<string>("approved")
  const [reviewNotes, setReviewNotes] = useState("")
  const [saving, setSaving] = useState(false)

  const requests = data?.requests ?? []
  const counts = requests.reduce(
    (acc, r) => {
      acc.total++
      acc[r.status] = (acc[r.status] ?? 0) + 1
      return acc
    },
    { total: 0, pending: 0, approved: 0, rejected: 0, needs_info: 0 } as Record<string, number>,
  )

  const openReview = (r: VariableRequest) => {
    setSelected(r)
    setNewStatus(r.status === "pending" ? "approved" : r.status)
    setReviewNotes(r.review_notes ?? "")
  }

  const submitReview = async () => {
    if (!selected) return
    setSaving(true)
    try {
      const res = await fetch("/api/superadmin/pricing-variable-requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: selected.id,
          status: newStatus,
          reviewNotes: reviewNotes.trim() || undefined,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Errore salvataggio")
      toast({ title: "Stato aggiornato", description: `Nuovo stato: ${newStatus}` })
      setSelected(null)
      mutate()
    } catch (err: any) {
      toast({ title: "Errore", description: err?.message, variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 text-sm text-muted-foreground">
          <Filter className="h-4 w-4" />
          Filtra:
        </div>
        {(["all", "pending", "approved", "rejected", "needs_info"] as const).map((s) => (
          <Button
            key={s}
            size="sm"
            variant={statusFilter === s ? "default" : "outline"}
            onClick={() => setStatusFilter(s)}
          >
            {s === "all"
              ? `Tutte (${counts.total})`
              : s === "pending"
              ? `Attesa (${counts.pending ?? 0})`
              : s === "approved"
              ? `Approvate (${counts.approved ?? 0})`
              : s === "rejected"
              ? `Rifiutate (${counts.rejected ?? 0})`
              : `Info (${counts.needs_info ?? 0})`}
          </Button>
        ))}
      </div>

      {requests.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Nessuna richiesta in questa categoria.
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3">
        {requests.map((r) => (
          <Card key={r.id} className="hover:bg-muted/30 transition-colors">
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold">{r.proposed_name}</span>
                    <StatusBadge status={r.status} />
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    <span className="font-medium">{r.hotels?.name ?? "?"}</span> -{" "}
                    {r.requester?.full_name ?? r.requester?.email ?? "?"} - inviata il{" "}
                    {new Date(r.created_at).toLocaleDateString("it-IT")}
                  </div>
                  <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                    {r.description}
                  </p>
                  <div className="text-xs mt-2 flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
                    <span>
                      <strong>Fonte:</strong> {r.datasource}
                    </span>
                    {r.frequency && (
                      <span>
                        <strong>Frequenza:</strong> {r.frequency}
                      </span>
                    )}
                    {r.format && (
                      <span>
                        <strong>Formato:</strong> {r.format}
                      </span>
                    )}
                  </div>
                  {r.review_notes && (
                    <div className="text-xs mt-2 rounded border bg-muted px-2 py-1">
                      <strong>Note:</strong> {r.review_notes}
                    </div>
                  )}
                </div>
                <Button size="sm" variant="outline" onClick={() => openReview(r)}>
                  <Eye className="h-4 w-4 mr-1" />
                  Valuta
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="sm:max-w-lg">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle>{selected.proposed_name}</DialogTitle>
                <DialogDescription>
                  {selected.hotels?.name ?? "?"} -{" "}
                  {selected.requester?.full_name ?? selected.requester?.email ?? "?"}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-3 text-sm">
                <div>
                  <div className="font-medium mb-0.5">Descrizione</div>
                  <p className="text-muted-foreground whitespace-pre-wrap">{selected.description}</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="font-medium mb-0.5">Fonte</div>
                    <p className="text-muted-foreground">{selected.datasource}</p>
                  </div>
                  {selected.frequency && (
                    <div>
                      <div className="font-medium mb-0.5">Frequenza</div>
                      <p className="text-muted-foreground">{selected.frequency}</p>
                    </div>
                  )}
                  {selected.format && (
                    <div>
                      <div className="font-medium mb-0.5">Formato</div>
                      <p className="text-muted-foreground">{selected.format}</p>
                    </div>
                  )}
                </div>
                {selected.rationale && (
                  <div>
                    <div className="font-medium mb-0.5">Note operative</div>
                    <p className="text-muted-foreground whitespace-pre-wrap">{selected.rationale}</p>
                  </div>
                )}

                <hr />

                <div className="space-y-2">
                  <Label>Decisione</Label>
                  <Select value={newStatus} onValueChange={setNewStatus}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">In attesa</SelectItem>
                      <SelectItem value="needs_info">Servono dettagli</SelectItem>
                      <SelectItem value="approved">Approvata</SelectItem>
                      <SelectItem value="rejected">Rifiutata</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Note al tenant (mostrate nella loro UI)</Label>
                  <Textarea
                    value={reviewNotes}
                    onChange={(e) => setReviewNotes(e.target.value)}
                    rows={3}
                    placeholder="Spiega la decisione o richiedi dettagli aggiuntivi..."
                    maxLength={2000}
                  />
                </div>

                {newStatus === "approved" && (
                  <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
                    <strong>Promemoria:</strong> dopo l&apos;approvazione, seeda
                    manualmente la variabile in <code>pricing_variables</code>{" "}
                    seguendo la pipeline architetturale (no AUTO senza
                    pipeline validata).
                  </div>
                )}
              </div>

              <DialogFooter>
                <Button variant="ghost" onClick={() => setSelected(null)} disabled={saving}>
                  Annulla
                </Button>
                <Button onClick={submitReview} disabled={saving}>
                  {saving ? "Salvataggio..." : "Salva decisione"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
