"use client"

import { useState } from "react"
import useSWR, { mutate } from "swr"
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
  Building2,
  Check,
  Clock,
  CalendarClock,
  ExternalLink,
  Loader2,
  MapPin,
  User,
  X,
} from "lucide-react"
import { toast } from "sonner"

const fetcher = (url: string) => fetch(url, { cache: "no-store" }).then((r) => r.json())

type DemoReq = {
  id: string
  agent_id: string | null
  prospect_id: string | null
  title: string
  notes: string | null
  requested_start: string
  requested_end: string
  attendee_email: string | null
  status: string
  google_event_link: string | null
  decision_notes: string | null
  decided_at: string | null
  created_at: string
  prospects: { id: string; name: string; city: string | null } | null
  sales_agents: { id: string; display_name: string | null; email: string | null } | null
}

function fmtRange(startIso: string, endIso: string) {
  const s = new Date(startIso)
  const e = new Date(endIso)
  const day = s.toLocaleDateString("it-IT", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })
  const st = s.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })
  const et = e.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })
  return `${day} · ${st}–${et}`
}

/** ISO -> valore per <input type="datetime-local"> in ora locale del browser. */
function isoToLocalInput(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function DemoRequestsManager() {
  const [tab, setTab] = useState<"pending" | "approved" | "rejected" | "cancelled">("pending")
  const swrKey = `/api/superadmin/demo-requests?status=${tab}`
  const { data, isLoading } = useSWR<{
    requests: DemoReq[]
    counts: Record<string, number>
    googleConfigured: boolean
  }>(swrKey, fetcher)

  const requests = data?.requests || []
  const counts = data?.counts || {}
  const refresh = () => mutate(swrKey)

  return (
    <div className="space-y-6">
      {data && !data.googleConfigured && (
        <Card className="border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">
          Google Calendar non e&apos; configurato: le richieste possono essere ricevute ma
          l&apos;approvazione non creera&apos; l&apos;evento finche&apos; non imposti le variabili
          GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY e GOOGLE_CLIENTI_CALENDAR_ID.
        </Card>
      )}

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList>
          <TabsTrigger value="pending" className="relative">
            In attesa
            {counts.pending > 0 && <Badge className="ml-2 bg-amber-500 text-xs px-1.5 py-0">{counts.pending}</Badge>}
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
              {tab === "pending" ? "Nessuna richiesta di demo in attesa." : "Nessuna richiesta in questa categoria."}
            </Card>
          ) : (
            <ul className="space-y-3">
              {requests.map((r) => (
                <DemoCard key={r.id} request={r} onChanged={refresh} canDecide={tab === "pending"} />
              ))}
            </ul>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}

function DemoCard({
  request: r,
  onChanged,
  canDecide,
}: {
  request: DemoReq
  onChanged: () => void
  canDecide: boolean
}) {
  const [open, setOpen] = useState<"approve" | "reject" | "reschedule" | null>(null)
  const [notes, setNotes] = useState("")
  const [submitting, setSubmitting] = useState(false)
  // Durata (minuti) della proposta originale, per ricalcolare la fine al reschedule.
  const durationMin = Math.max(
    15,
    Math.round((new Date(r.requested_end).getTime() - new Date(r.requested_start).getTime()) / 60000),
  )
  const [newStart, setNewStart] = useState(() => isoToLocalInput(r.requested_start))

  const submit = async () => {
    if (!open) return
    setSubmitting(true)
    try {
      const payload: Record<string, unknown> = {
        id: r.id,
        action: open,
        decision_notes: notes.trim() || undefined,
      }
      if (open === "reschedule") {
        const start = new Date(newStart)
        if (isNaN(start.getTime())) {
          toast.error("Data/ora non valida")
          setSubmitting(false)
          return
        }
        const end = new Date(start.getTime() + durationMin * 60000)
        payload.requested_start = start.toISOString()
        payload.requested_end = end.toISOString()
      }
      const res = await fetch("/api/superadmin/demo-requests", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(
          json.error === "google_not_configured"
            ? "Google Calendar non configurato"
            : json.error === "google_create_failed"
              ? "Errore nella creazione dell'evento Google"
              : json.error === "invalid_range"
                ? "Intervallo orario non valido"
                : json.error || "Errore",
        )
        return
      }
      toast.success(
        open === "approve"
          ? "Demo accettata, calendario aggiornato ed email di conferma inviate"
          : open === "reschedule"
            ? "Orario aggiornato. La richiesta resta da approvare."
            : "Richiesta rifiutata",
      )
      setOpen(null)
      setNotes("")
      onChanged()
    } catch (err: any) {
      toast.error(err?.message || "Errore di rete")
    } finally {
      setSubmitting(false)
    }
  }

  const a = r.sales_agents
  const p = r.prospects

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <CalendarClock className="h-4 w-4 text-emerald-600 shrink-0" />
            <span className="font-semibold text-base">{r.title}</span>
            <StatusBadge status={r.status} />
          </div>

          <div className="text-sm text-foreground mt-1 font-medium">{fmtRange(r.requested_start, r.requested_end)}</div>

          <div className="text-sm text-muted-foreground mt-1 flex items-center gap-3 flex-wrap">
            <span className="inline-flex items-center gap-1">
              <User className="h-3 w-3" />
              {a?.display_name || a?.email || "Venditore"}
            </span>
            {p?.name && (
              <span className="inline-flex items-center gap-1">
                <Building2 className="h-3 w-3" />
                {p.name}
              </span>
            )}
            {p?.city && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {p.city}
              </span>
            )}
          </div>

          {r.notes && (
            <div className="mt-3 rounded-md bg-muted/40 p-3 text-sm">
              <p className="italic">&ldquo;{r.notes}&rdquo;</p>
            </div>
          )}

          {r.status === "approved" && r.google_event_link && (
            <a
              href={r.google_event_link}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1 text-xs text-sky-700 hover:underline"
            >
              <ExternalLink className="h-3 w-3" />
              Apri evento su Google Calendar
            </a>
          )}

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
              variant="outline"
              className="border-sky-300 text-sky-700 hover:bg-sky-50"
              onClick={() => {
                setNewStart(isoToLocalInput(r.requested_start))
                setOpen("reschedule")
              }}
            >
              <CalendarClock className="h-3.5 w-3.5 mr-1" />
              Modifica orario
            </Button>
            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setOpen("approve")}>
              <Check className="h-3.5 w-3.5 mr-1" />
              Accetta
            </Button>
          </div>
        )}
      </div>

      <Dialog open={!!open} onOpenChange={(o) => (o ? null : setOpen(null))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {open === "approve"
                ? "Accetta la demo"
                : open === "reschedule"
                  ? "Modifica data e ora"
                  : "Rifiuta la richiesta"}
            </DialogTitle>
            <DialogDescription>
              {open === "approve"
                ? `Verra' confermato l'evento "${r.title}" sul calendario clienti@4bid.it (${fmtRange(r.requested_start, r.requested_end)}) e verranno inviate le email di conferma con il link alla call.`
                : open === "reschedule"
                  ? `Sposta la proposta a un nuovo orario. La durata resta di ${durationMin} minuti e la richiesta rimane da approvare.`
                  : `Stai rifiutando la richiesta di ${a?.display_name || a?.email || "un venditore"}.`}
            </DialogDescription>
          </DialogHeader>
          {open === "reschedule" ? (
            <div className="space-y-2">
              <label className="text-sm font-medium">Nuova data e ora di inizio</label>
              <input
                type="datetime-local"
                value={newStart}
                onChange={(e) => setNewStart(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Fine prevista:{" "}
                {newStart
                  ? new Date(new Date(newStart).getTime() + durationMin * 60000).toLocaleString("it-IT", {
                      day: "2-digit",
                      month: "long",
                      hour: "2-digit",
                      minute: "2-digit",
                    })
                  : "—"}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <label className="text-sm font-medium">Note per il venditore (opzionale)</label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={open === "approve" ? "Es. confermo, ci vediamo in call" : "Es. spostiamo ad altra data"}
                rows={3}
                maxLength={500}
              />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(null)} disabled={submitting}>
              Annulla
            </Button>
            <Button
              onClick={submit}
              disabled={submitting}
              className={
                open === "approve"
                  ? "bg-emerald-600 hover:bg-emerald-700"
                  : open === "reschedule"
                    ? "bg-sky-600 hover:bg-sky-700"
                    : "bg-rose-600 hover:bg-rose-700"
              }
            >
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {open === "approve" ? "Accetta" : open === "reschedule" ? "Salva orario" : "Rifiuta"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}

function StatusBadge({ status }: { status: string }) {
  if (status === "pending")
    return (
      <Badge variant="outline" className="border-amber-500 text-amber-700 bg-amber-50">
        <Clock className="h-3 w-3 mr-1" />
        In attesa
      </Badge>
    )
  if (status === "approved")
    return (
      <Badge className="bg-emerald-600 hover:bg-emerald-600">
        <Check className="h-3 w-3 mr-1" />
        Accettata
      </Badge>
    )
  if (status === "rejected")
    return (
      <Badge variant="outline" className="border-rose-300 text-rose-700 bg-rose-50">
        Rifiutata
      </Badge>
    )
  if (status === "cancelled")
    return (
      <Badge variant="outline" className="text-muted-foreground">
        Annullata
      </Badge>
    )
  return <Badge variant="outline">{status}</Badge>
}
