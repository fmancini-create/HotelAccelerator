"use client"

import useSWR from "swr"
import { useMemo, useState } from "react"
import Link from "next/link"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { ArrowLeft, Search, Upload } from "lucide-react"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

const STATUS_LABEL: Record<string, string> = {
  draft: "Bozza",
  invited: "Invitato",
  opened: "Email aperta",
  clicked: "Cliccato",
  registered: "Registrato",
  converted: "Convertito",
  rejected: "Perso",
}

const STATUS_COLOR: Record<string, string> = {
  draft: "bg-gray-100 text-gray-700",
  invited: "bg-blue-100 text-blue-700",
  opened: "bg-cyan-100 text-cyan-700",
  clicked: "bg-indigo-100 text-indigo-700",
  registered: "bg-purple-100 text-purple-700",
  converted: "bg-emerald-100 text-emerald-700",
  rejected: "bg-red-100 text-red-700",
}

type Lead = {
  id: string
  sales_agent_id: string
  first_name: string
  last_name: string
  email: string
  hotel_name: string
  phone: string | null
  status: string
  email_sent_at: string | null
  registered_at: string | null
  converted_at: string | null
  source: string
  created_at: string
  sales_agents: { id: string; display_name: string | null; email: string | null } | null
}

export function LeadsAdminClient() {
  const [agentFilter, setAgentFilter] = useState<string>("")
  const [statusFilter, setStatusFilter] = useState<string>("")
  const [search, setSearch] = useState<string>("")
  const [debouncedSearch, setDebouncedSearch] = useState<string>("")

  // debounce search
  useMemoSetTimeout(() => setDebouncedSearch(search), [search], 350)

  const queryString = useMemo(() => {
    const p = new URLSearchParams()
    if (agentFilter) p.set("agent", agentFilter)
    if (statusFilter) p.set("status", statusFilter)
    if (debouncedSearch.trim()) p.set("q", debouncedSearch.trim())
    return p.toString()
  }, [agentFilter, statusFilter, debouncedSearch])

  const { data: leadsData, mutate } = useSWR<{ leads: Lead[] }>(
    `/api/superadmin/sales/leads${queryString ? `?${queryString}` : ""}`,
    fetcher,
  )
  const { data: agentsData } = useSWR<{ agents: any[] }>(
    "/api/superadmin/sales/agents",
    fetcher,
  )

  const leads = leadsData?.leads ?? []
  const agents = agentsData?.agents ?? []

  return (
    <div className="container mx-auto px-4 py-6">
      <Link
        href="/superadmin/sales"
        className="mb-4 inline-flex items-center gap-1 text-sm text-gray-600 hover:underline"
      >
        <ArrowLeft className="h-4 w-4" />
        Tutti i venditori
      </Link>

      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Lead globali</h1>
          <p className="mt-1 text-sm text-gray-600">
            Tutti i lead di tutti i venditori. Riassegna o importa in massa.
          </p>
        </div>
        <CsvImport agents={agents} onImported={() => mutate()} />
      </div>

      <Card className="mb-4 p-4">
        <div className="grid gap-3 md:grid-cols-4">
          <div className="md:col-span-2">
            <Label className="text-xs">Cerca (email, nome, struttura)</Label>
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8"
                placeholder="hotel paradiso..."
              />
            </div>
          </div>
          <div>
            <Label className="text-xs">Venditore</Label>
            <Select
              value={agentFilter || "all"}
              onValueChange={(v) => setAgentFilter(v === "all" ? "" : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Tutti" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti</SelectItem>
                {agents.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.display_name ?? a.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Status</Label>
            <Select
              value={statusFilter || "all"}
              onValueChange={(v) => setStatusFilter(v === "all" ? "" : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Tutti" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tutti</SelectItem>
                {Object.entries(STATUS_LABEL).map(([k, l]) => (
                  <SelectItem key={k} value={k}>
                    {l}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-3 py-2">Lead</th>
              <th className="px-3 py-2">Struttura</th>
              <th className="px-3 py-2">Venditore</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Inserito</th>
              <th className="px-3 py-2">Azioni</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {leads.length === 0 ? (
              <tr>
                <td colSpan={6} className="p-8 text-center text-gray-500">
                  Nessun lead trovato.
                </td>
              </tr>
            ) : (
              leads.map((l) => (
                <tr key={l.id}>
                  <td className="px-3 py-2">
                    <div className="font-medium">
                      {l.first_name} {l.last_name}
                    </div>
                    <div className="text-xs text-gray-500">{l.email}</div>
                  </td>
                  <td className="px-3 py-2">{l.hotel_name}</td>
                  <td className="px-3 py-2 text-xs">
                    {l.sales_agents?.display_name ?? l.sales_agents?.email ?? "—"}
                  </td>
                  <td className="px-3 py-2">
                    <Badge className={STATUS_COLOR[l.status] ?? ""} variant="secondary">
                      {STATUS_LABEL[l.status] ?? l.status}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-500">
                    {new Date(l.created_at).toLocaleDateString("it-IT")}
                  </td>
                  <td className="px-3 py-2">
                    <ReassignButton lead={l} agents={agents} onChange={() => mutate()} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>
    </div>
  )
}

function ReassignButton({
  lead,
  agents,
  onChange,
}: {
  lead: Lead
  agents: any[]
  onChange: () => void
}) {
  const [open, setOpen] = useState(false)
  const [target, setTarget] = useState(lead.sales_agent_id)
  const [busy, setBusy] = useState(false)

  async function reassign() {
    if (target === lead.sales_agent_id) {
      setOpen(false)
      return
    }
    setBusy(true)
    try {
      const res = await fetch(`/api/superadmin/sales/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sales_agent_id: target }),
      })
      const j = await res.json()
      if (!res.ok) {
        alert(j.error === "duplicate_lead" ? j.details : j.error || "Errore")
        return
      }
      setOpen(false)
      onChange()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          Riassegna
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Riassegna lead</DialogTitle>
          <DialogDescription>
            {lead.first_name} {lead.last_name} ({lead.email}) — {lead.hotel_name}
          </DialogDescription>
        </DialogHeader>
        <div>
          <Label>Sposta a venditore:</Label>
          <Select value={target} onValueChange={setTarget}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {agents.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.display_name ?? a.email}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
            Annulla
          </Button>
          <Button onClick={reassign} disabled={busy}>
            {busy ? "Sposto..." : "Riassegna"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function CsvImport({
  agents,
  onImported,
}: {
  agents: any[]
  onImported: () => void
}) {
  const [open, setOpen] = useState(false)
  const [agentId, setAgentId] = useState("")
  const [csv, setCsv] = useState("")
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<any>(null)

  function parseCsv(input: string): any[] {
    // Parser semplice: prima riga = header, separatore = , o ;.
    const lines = input
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
    if (lines.length < 2) return []
    const sep = lines[0].includes(";") ? ";" : ","
    const headers = lines[0].split(sep).map((h) => h.trim().toLowerCase())
    const map = (h: string) =>
      h === "nome"
        ? "first_name"
        : h === "cognome"
          ? "last_name"
          : h === "struttura" || h === "hotel"
            ? "hotel_name"
            : h === "telefono" || h === "tel"
              ? "phone"
              : h
    const rows = []
    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(sep)
      const row: any = {}
      headers.forEach((h, idx) => {
        row[map(h)] = values[idx]?.trim() ?? ""
      })
      rows.push(row)
    }
    return rows
  }

  async function doImport() {
    const rows = parseCsv(csv)
    if (rows.length === 0) {
      alert("CSV vuoto o malformato. Header richiesti: first_name,last_name,email,hotel_name (o nome,cognome,email,struttura)")
      return
    }
    setBusy(true)
    setResult(null)
    try {
      const res = await fetch("/api/superadmin/sales/leads/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sales_agent_id: agentId, rows }),
      })
      const j = await res.json()
      setResult(j)
      if (res.ok) onImported()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Upload className="mr-2 h-4 w-4" />
          Importa CSV
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Importa lead da CSV</DialogTitle>
          <DialogDescription>
            Header richiesti:{" "}
            <code className="rounded bg-gray-100 px-1">
              first_name,last_name,email,hotel_name,phone
            </code>{" "}
            (o italiani: nome,cognome,email,struttura,telefono). Separatore: , oppure ;
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label>Assegna i lead al venditore *</Label>
            <Select value={agentId} onValueChange={setAgentId}>
              <SelectTrigger>
                <SelectValue placeholder="Scegli venditore" />
              </SelectTrigger>
              <SelectContent>
                {agents.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.display_name ?? a.email}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Incolla CSV</Label>
            <textarea
              value={csv}
              onChange={(e) => setCsv(e.target.value)}
              rows={10}
              placeholder="first_name,last_name,email,hotel_name&#10;Mario,Rossi,mario@hotel.it,Hotel Sole"
              className="w-full rounded border border-gray-300 p-2 font-mono text-xs"
            />
          </div>
          {result && (
            <Card className="bg-gray-50 p-3 text-sm">
              <div>
                <strong>{result.inserted_count}</strong> inseriti,{" "}
                <strong>{result.skipped_count}</strong> saltati (duplicati),{" "}
                <strong>{result.error_count}</strong> errori
              </div>
              {result.errors?.length > 0 && (
                <details className="mt-2 text-xs">
                  <summary className="cursor-pointer text-red-600">
                    Errori ({result.errors.length})
                  </summary>
                  <pre className="mt-1 overflow-auto whitespace-pre-wrap">
                    {JSON.stringify(result.errors, null, 2)}
                  </pre>
                </details>
              )}
            </Card>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
            Chiudi
          </Button>
          <Button onClick={doImport} disabled={!agentId || !csv.trim() || busy}>
            {busy ? "Importo..." : "Importa"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// Hook minimale per debouncare l'effetto
import { useEffect } from "react"
function useMemoSetTimeout(fn: () => void, deps: any[], delay: number) {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const t = setTimeout(fn, delay)
    return () => clearTimeout(t)
  }, deps)
}
