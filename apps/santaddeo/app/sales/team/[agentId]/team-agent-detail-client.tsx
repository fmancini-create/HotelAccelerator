"use client"

import { useState } from "react"
import useSWR from "swr"
import Link from "next/link"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
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
import { ArrowLeft, ArrowRightLeft, Mail } from "lucide-react"

const fetcher = (url: string) => fetch(url, { cache: "no-store" }).then((r) => r.json())

type DrillData = {
  agent: {
    id: string
    display_name: string | null
    email: string | null
    default_commission_percentage: number | null
    is_active: boolean
    created_at: string
  }
  kpi: {
    prospects_count: number
    hotels_count: number
    total_accrued_eur: number
    total_earned_eur: number
    total_paid_eur: number
    total_maturato_eur: number
  }
  prospects: Array<{
    id: string
    name: string
    city: string | null
    province: string | null
    region: string | null
    stars: number | null
    rooms_count: number | null
    status: string | null
    last_contact_at: string | null
    assignment_date: string | null
  }>
  hotels: Array<{
    hotel_id: string
    hotel_name: string
    is_active: boolean
    lead_status: string
    commission_percentage: number | null
    activated_at: string | null
    created_at: string
  }>
  ledger: Array<{
    id: string
    hotel_id: string
    hotel_name: string
    period_year: number
    period_month: number
    period_start: string
    base_amount_eur: number
    commission_percentage: number
    amount_eur: number
    status: string
    accrued_at: string | null
    earned_at: string | null
    paid_at: string | null
  }>
  error?: string
}

type TeamMember = {
  id: string
  display_name: string | null
  email: string | null
  is_active: boolean
}

export function TeamAgentDetailClient({ agentId }: { agentId: string }) {
  const { data, isLoading, error, mutate } = useSWR<DrillData>(
    `/api/sales/area-manager/team/${agentId}`,
    fetcher,
    { revalidateOnFocus: false },
  )
  const { data: teamData } = useSWR<{ team: TeamMember[]; area_manager: { id: string } }>(
    "/api/sales/area-manager/team",
    fetcher,
    { revalidateOnFocus: false },
  )
  const [reassignOpen, setReassignOpen] = useState(false)
  const [reassignProspect, setReassignProspect] = useState<{ id: string; name: string } | null>(
    null,
  )
  const [reassignTarget, setReassignTarget] = useState("")
  const [reassignBusy, setReassignBusy] = useState(false)

  if (isLoading) {
    return (
      <div className="container mx-auto max-w-7xl px-6 py-10">
        <p className="text-sm text-muted-foreground">Caricamento dettaglio agente…</p>
      </div>
    )
  }
  if (error || !data || data.error || !data.agent) {
    return (
      <div className="container mx-auto max-w-7xl px-6 py-10">
        <Card className="p-6 space-y-3">
          <p className="text-sm text-destructive">
            Impossibile caricare i dati dell&apos;agente.
          </p>
          <Link href="/sales/team">
            <Button variant="outline" size="sm">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Torna al team
            </Button>
          </Link>
        </Card>
      </div>
    )
  }

  const { agent, kpi, prospects, hotels, ledger } = data
  // Candidati per la riassegnazione: tutti gli altri membri del team + il
  // capo area stesso (per "riprendersi" il prospect). Escludiamo l'agente
  // corrente (non puo' essere target di se stesso).
  const reassignCandidates: TeamMember[] = [
    ...(teamData?.team ?? []).filter((m) => m.id !== agent.id && m.is_active),
    // Aggiungi il capo area come opzione "Riprendi tu il prospect"
    ...(teamData?.area_manager
      ? [
          {
            id: teamData.area_manager.id,
            display_name: "→ Riprendi tu il prospect",
            email: null,
            is_active: true,
          },
        ]
      : []),
  ]

  async function submitReassign() {
    if (!reassignProspect || !reassignTarget) return
    setReassignBusy(true)
    try {
      const res = await fetch("/api/sales/area-manager/assign-prospect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prospect_id: reassignProspect.id,
          target_agent_id: reassignTarget,
        }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) {
        alert(j.error ?? "Errore riassegnazione")
        return
      }
      setReassignOpen(false)
      setReassignProspect(null)
      setReassignTarget("")
      mutate()
    } finally {
      setReassignBusy(false)
    }
  }

  return (
    <div className="container mx-auto max-w-7xl px-6 py-8 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Link href="/sales/team">
            <Button variant="ghost" size="sm" className="mb-2 -ml-2">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Team
            </Button>
          </Link>
          <h1 className="text-2xl font-bold text-foreground">
            {agent.display_name ?? "(senza nome)"}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground flex items-center gap-1">
            <Mail className="h-3 w-3" />
            {agent.email}
          </p>
          <div className="mt-2 flex items-center gap-2">
            {!agent.is_active && <Badge variant="secondary">Disattivato</Badge>}
            <Badge variant="outline">
              % default: {agent.default_commission_percentage ?? "—"}
            </Badge>
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Kpi label="Prospect" value={kpi.prospects_count.toString()} />
        <Kpi label="Strutture" value={kpi.hotels_count.toString()} />
        <Kpi label="Maturato totale" value={formatEur(kpi.total_maturato_eur)} />
        <Kpi
          label="Già liquidato"
          value={formatEur(kpi.total_paid_eur)}
          muted
        />
      </div>

      <Card className="overflow-hidden">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold">Prospect assegnati</h2>
          <p className="text-xs text-muted-foreground mt-1">
            Sola lettura. Puoi riassegnare un prospect a un altro membro del
            team (o riprenderlo tu) dal pulsante a destra.
          </p>
        </div>
        {prospects.length === 0 ? (
          <p className="px-6 py-8 text-sm text-muted-foreground text-center">
            Nessun prospect assegnato.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Località</TableHead>
                <TableHead className="text-right">Camere</TableHead>
                <TableHead>Stato</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {prospects.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {[p.city, p.province].filter(Boolean).join(", ") || "—"}
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    {p.rooms_count ?? "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">
                      {p.status ?? "—"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setReassignProspect({ id: p.id, name: p.name })
                        setReassignTarget("")
                        setReassignOpen(true)
                      }}
                    >
                      <ArrowRightLeft className="mr-1 h-3 w-3" />
                      Riassegna
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <Card className="overflow-hidden">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold">Strutture associate</h2>
        </div>
        {hotels.length === 0 ? (
          <p className="px-6 py-8 text-sm text-muted-foreground text-center">
            Nessuna struttura associata.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Struttura</TableHead>
                <TableHead>Stato lead</TableHead>
                <TableHead className="text-right">% commissione</TableHead>
                <TableHead>Attivata</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {hotels.map((h) => (
                <TableRow key={h.hotel_id}>
                  <TableCell className="font-medium">
                    {h.hotel_name}
                    {!h.is_active && (
                      <Badge variant="secondary" className="ml-2 text-xs">
                        inattiva
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">
                      {h.lead_status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {h.commission_percentage ?? "—"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {h.activated_at
                      ? new Date(h.activated_at).toLocaleDateString("it-IT")
                      : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <Card className="overflow-hidden">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold">Ledger commissioni</h2>
        </div>
        {ledger.length === 0 ? (
          <p className="px-6 py-8 text-sm text-muted-foreground text-center">
            Nessuna commissione registrata.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Periodo</TableHead>
                <TableHead>Struttura</TableHead>
                <TableHead className="text-right">Base</TableHead>
                <TableHead className="text-right">%</TableHead>
                <TableHead className="text-right">Importo</TableHead>
                <TableHead>Stato</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ledger.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="text-sm">
                    {String(r.period_month).padStart(2, "0")}/{r.period_year}
                  </TableCell>
                  <TableCell className="text-sm">{r.hotel_name}</TableCell>
                  <TableCell className="text-right text-sm">
                    {formatEur(r.base_amount_eur)}
                  </TableCell>
                  <TableCell className="text-right text-sm">
                    {r.commission_percentage}%
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {formatEur(r.amount_eur)}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={r.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <Dialog open={reassignOpen} onOpenChange={setReassignOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Riassegna prospect</DialogTitle>
            <DialogDescription>
              {reassignProspect
                ? `Sposta "${reassignProspect.name}" a un altro membro del team.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Select value={reassignTarget} onValueChange={setReassignTarget}>
              <SelectTrigger>
                <SelectValue placeholder="Seleziona destinatario" />
              </SelectTrigger>
              <SelectContent>
                {reassignCandidates.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.display_name ?? c.email ?? c.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setReassignOpen(false)}
              disabled={reassignBusy}
            >
              Annulla
            </Button>
            <Button
              onClick={submitReassign}
              disabled={!reassignTarget || reassignBusy}
            >
              {reassignBusy ? "Riassegno…" : "Conferma riassegnazione"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Kpi({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <Card className="p-5">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p
        className={`mt-2 text-2xl font-bold ${
          muted ? "text-muted-foreground" : "text-foreground"
        }`}
      >
        {value}
      </p>
    </Card>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    accrued: { label: "Maturata", className: "bg-gray-100 text-gray-700" },
    earned: { label: "Liquidabile", className: "bg-blue-100 text-blue-800" },
    paid: { label: "Liquidata", className: "bg-green-100 text-green-800" },
    voided: { label: "Annullata", className: "bg-red-100 text-red-800" },
  }
  const v = map[status] ?? { label: status, className: "bg-gray-100" }
  return <Badge className={`${v.className} hover:${v.className}`}>{v.label}</Badge>
}

function formatEur(n: number) {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n ?? 0)
}
