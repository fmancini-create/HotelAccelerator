"use client"

import { useEffect, useState } from "react"
import useSWR from "swr"
import Link from "next/link"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { toast } from "sonner"
import {
  Users,
  HandCoins,
  Percent,
  TrendingUp,
  ChevronRight,
  UserPlus,
  Clock,
  CheckCircle2,
  XCircle,
} from "lucide-react"

const fetcher = (url: string) => fetch(url, { cache: "no-store" }).then((r) => r.json())

type TeamMember = {
  id: string
  display_name: string | null
  email: string | null
  is_active: boolean
  default_commission_percentage: number | null
  hotels_count: number
  commission_month_eur: number
  commission_total_maturato_eur: number
  override_generated_total_eur: number
  override_generated_month_eur: number
}

type ApiData = {
  area_manager: {
    id: string
    display_name: string | null
    email: string | null
    override_percentage: number
    override_is_custom: boolean
  }
  totals: {
    team_size: number
    override_month_eur: number
    override_total_eur: number
  }
  team: TeamMember[]
  error?: string
}

export function TeamClient() {
  const { data, isLoading, error } = useSWR<ApiData>(
    "/api/sales/area-manager/team",
    fetcher,
    { revalidateOnFocus: false },
  )

  if (isLoading) {
    return (
      <div className="container mx-auto max-w-7xl px-6 py-10">
        <p className="text-sm text-muted-foreground">Caricamento team…</p>
      </div>
    )
  }
  if (error || !data || data.error) {
    return (
      <div className="container mx-auto max-w-7xl px-6 py-10">
        <Card className="p-6">
          <p className="text-sm text-destructive">
            Errore caricamento team. Verifica di essere un capo area attivo.
          </p>
        </Card>
      </div>
    )
  }

  const { area_manager: am, totals, team } = data

  return (
    <div className="container mx-auto max-w-7xl px-6 py-8 space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Il tuo team</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Capo area: <span className="font-medium">{am.display_name ?? am.email ?? "—"}</span>
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Badge className="bg-amber-100 text-amber-900 hover:bg-amber-100">
            <Percent className="mr-1 h-3 w-3" />
            Override {am.override_percentage}%
            {am.override_is_custom && (
              <span className="ml-1 text-amber-700">(personalizzato)</span>
            )}
          </Badge>
          <InviteAgentButton />
        </div>
      </div>

      <InvitationsSection />

      <div className="grid gap-4 md:grid-cols-3">
        <Kpi
          label="Membri del team"
          value={totals.team_size.toString()}
          icon={<Users className="h-4 w-4" />}
        />
        <Kpi
          label="Override mese corrente"
          value={formatEur(totals.override_month_eur)}
          icon={<HandCoins className="h-4 w-4" />}
          accent
        />
        <Kpi
          label="Override totale generato"
          value={formatEur(totals.override_total_eur)}
          icon={<TrendingUp className="h-4 w-4" />}
        />
      </div>

      <Card className="overflow-hidden">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <h2 className="text-lg font-semibold">Agenti del team</h2>
          <Link
            href="/sales/team/commissions"
            className="text-sm text-amber-700 hover:underline"
          >
            Vedi storico override →
          </Link>
        </div>
        {team.length === 0 ? (
          <div className="px-6 py-10 text-center">
            <p className="text-sm text-muted-foreground">
              Nessun agente assegnato a te. Contatta il super-admin per
              configurare il team.
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Agente</TableHead>
                <TableHead className="text-right">Strutture</TableHead>
                <TableHead className="text-right">Mat. mese</TableHead>
                <TableHead className="text-right">Mat. totale</TableHead>
                <TableHead className="text-right">Override mese</TableHead>
                <TableHead className="text-right">Override totale</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {team.map((m) => (
                <TableRow key={m.id} className="hover:bg-muted/50">
                  <TableCell>
                    <div className="flex flex-col">
                      <span className="font-medium">
                        {m.display_name ?? "(senza nome)"}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {m.email}
                      </span>
                      {!m.is_active && (
                        <Badge variant="secondary" className="mt-1 w-fit">
                          Disattivato
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">{m.hotels_count}</TableCell>
                  <TableCell className="text-right">
                    {formatEur(m.commission_month_eur)}
                  </TableCell>
                  <TableCell className="text-right">
                    {formatEur(m.commission_total_maturato_eur)}
                  </TableCell>
                  <TableCell className="text-right text-amber-700 font-medium">
                    {formatEur(m.override_generated_month_eur)}
                  </TableCell>
                  <TableCell className="text-right text-amber-700 font-medium">
                    {formatEur(m.override_generated_total_eur)}
                  </TableCell>
                  <TableCell>
                    <Link href={`/sales/team/${m.id}`}>
                      <Button variant="ghost" size="sm">
                        Dettagli
                        <ChevronRight className="ml-1 h-4 w-4" />
                      </Button>
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <p className="text-xs text-muted-foreground">
        L&apos;override del {am.override_percentage}% viene calcolato
        automaticamente su ogni commissione maturata dai tuoi agenti. La
        liquidazione del bonifico è gestita separatamente da Santaddeo.
      </p>
    </div>
  )
}

function Kpi({
  label,
  value,
  icon,
  accent,
}: {
  label: string
  value: string
  icon: React.ReactNode
  accent?: boolean
}) {
  return (
    <Card className={`p-5 ${accent ? "border-amber-300 bg-amber-50" : ""}`}>
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <span className={accent ? "text-amber-700" : "text-muted-foreground"}>
          {icon}
        </span>
      </div>
      <p
        className={`mt-2 text-2xl font-bold ${
          accent ? "text-amber-900" : "text-foreground"
        }`}
      >
        {value}
      </p>
    </Card>
  )
}

function formatEur(n: number) {
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n ?? 0)
}

type Invitation = {
  id: string
  email: string
  display_name: string | null
  default_commission_percentage: number | null
  expires_at: string
  approval_status: "pending" | "approved" | "rejected"
  approved_at: string | null
  rejection_reason: string | null
  accepted_at: string | null
  accepted_user_id: string | null
  created_at: string
}

function InviteAgentButton() {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState("")
  const [displayName, setDisplayName] = useState("")
  const [phone, setPhone] = useState("")
  const [commission, setCommission] = useState<string>("")
  const [notes, setNotes] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const reset = () => {
    setEmail("")
    setDisplayName("")
    setPhone("")
    setCommission("")
    setNotes("")
  }

  const submit = async () => {
    if (!email.trim()) {
      toast.error("Email obbligatoria")
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch("/api/sales/area-manager/invitations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          display_name: displayName.trim() || undefined,
          phone: phone.trim() || undefined,
          default_commission_percentage: commission.trim()
            ? Number(commission)
            : undefined,
          notes: notes.trim() || undefined,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        toast.error(json.details || json.error || "Errore creazione invito")
        return
      }
      toast.success(
        "Invito creato. Il super-admin riceverà una notifica per l'approvazione.",
      )
      reset()
      setOpen(false)
      // Forza il refresh del pannello inviti.
      window.dispatchEvent(new CustomEvent("am-invitations:refresh"))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <UserPlus className="mr-2 h-4 w-4" />
          Invita agente
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Invita un nuovo agente</DialogTitle>
          <DialogDescription>
            L&apos;invito verrà revisionato dal super-admin prima di essere
            attivato. L&apos;agente riceverà l&apos;email solo dopo
            l&apos;approvazione e verrà agganciato sotto di te.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="invite-email">Email *</Label>
            <Input
              id="invite-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="mario.rossi@esempio.it"
            />
          </div>
          <div>
            <Label htmlFor="invite-name">Nome</Label>
            <Input
              id="invite-name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Mario Rossi"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="invite-phone">Telefono</Label>
              <Input
                id="invite-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+39 ..."
              />
            </div>
            <div>
              <Label htmlFor="invite-comm">% commissione</Label>
              <Input
                id="invite-comm"
                type="number"
                step="0.01"
                value={commission}
                onChange={(e) => setCommission(e.target.value)}
                placeholder="es. 10"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="invite-notes">Note (visibili solo al super-admin)</Label>
            <Textarea
              id="invite-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Contesto utile per l'approvazione…"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={submitting}>
            Annulla
          </Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting ? "Invio…" : "Invia per approvazione"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function InvitationsSection() {
  const { data, mutate, isLoading } = useSWR<{ invitations: Invitation[] }>(
    "/api/sales/area-manager/invitations",
    fetcher,
    { revalidateOnFocus: false },
  )

  // Permette al dialog "Invita agente" di forzare il reload dopo creazione.
  useEffect(() => {
    const handler = () => {
      mutate()
    }
    window.addEventListener("am-invitations:refresh", handler)
    return () => window.removeEventListener("am-invitations:refresh", handler)
  }, [mutate])

  const invitations = data?.invitations ?? []
  if (isLoading) return null
  if (invitations.length === 0) return null

  return (
    <Card className="overflow-hidden">
      <div className="px-6 py-4 border-b border-border">
        <h2 className="text-lg font-semibold">I tuoi inviti</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Stato di approvazione degli agenti che hai invitato. Solo dopo
          l&apos;approvazione del super-admin l&apos;agente riceve l&apos;email
          di registrazione.
        </p>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Invitato</TableHead>
            <TableHead>Stato</TableHead>
            <TableHead>Data invito</TableHead>
            <TableHead>Note</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {invitations.map((inv) => (
            <TableRow key={inv.id}>
              <TableCell>
                <div className="flex flex-col">
                  <span className="font-medium">
                    {inv.display_name ?? inv.email}
                  </span>
                  {inv.display_name && (
                    <span className="text-xs text-muted-foreground">{inv.email}</span>
                  )}
                </div>
              </TableCell>
              <TableCell>
                <InvitationStatusBadge inv={inv} />
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {new Date(inv.created_at).toLocaleDateString("it-IT")}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground max-w-xs">
                {inv.rejection_reason ? (
                  <span className="text-destructive">{inv.rejection_reason}</span>
                ) : inv.accepted_at ? (
                  <span className="text-emerald-700">
                    Registrato il{" "}
                    {new Date(inv.accepted_at).toLocaleDateString("it-IT")}
                  </span>
                ) : (
                  "—"
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  )
}

function InvitationStatusBadge({ inv }: { inv: Invitation }) {
  if (inv.accepted_at) {
    return (
      <Badge className="bg-emerald-100 text-emerald-900 hover:bg-emerald-100">
        <CheckCircle2 className="mr-1 h-3 w-3" />
        Registrato
      </Badge>
    )
  }
  if (inv.approval_status === "approved") {
    return (
      <Badge className="bg-blue-100 text-blue-900 hover:bg-blue-100">
        <CheckCircle2 className="mr-1 h-3 w-3" />
        Approvato — in attesa registrazione
      </Badge>
    )
  }
  if (inv.approval_status === "rejected") {
    return (
      <Badge variant="destructive">
        <XCircle className="mr-1 h-3 w-3" />
        Rifiutato
      </Badge>
    )
  }
  return (
    <Badge className="bg-amber-100 text-amber-900 hover:bg-amber-100">
      <Clock className="mr-1 h-3 w-3" />
      In attesa di approvazione
    </Badge>
  )
}
