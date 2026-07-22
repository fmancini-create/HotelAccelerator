"use client"

import { useState } from "react"
import useSWR from "swr"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ExpiryBadge } from "@/components/sales/expiry-badge"
import { Badge } from "@/components/ui/badge"
import { Loader2 } from "lucide-react"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

type Assignment = {
  id: string
  name: string
  category: string
  city: string | null
  province: string | null
  region: string | null
  assignment_date: string | null
  assignment_expires_at: string | null
  assignment_duration_days: number | null
  status: string
  assigned_agent: {
    id: string
    display_name: string | null
    email: string | null
    parent_agent_id: string | null
  } | null
}

export function AssignmentsClient() {
  const [filter, setFilter] = useState<string>("all")
  const { data, isLoading } = useSWR<{ assignments: Assignment[] }>(
    `/api/superadmin/prospects/assignments?filter=${filter}`,
    fetcher,
  )

  const list = data?.assignments ?? []
  const expiringSoon = list.filter((a) => {
    if (!a.assignment_expires_at) return false
    const days = Math.ceil(
      (new Date(a.assignment_expires_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24),
    )
    return days <= 7
  }).length
  const noExpiry = list.filter((a) => !a.assignment_expires_at).length

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Totale attive
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{list.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              In scadenza ({"<="} 7 giorni)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{expiringSoon}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Senza scadenza
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-700">{noExpiry}</div>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center gap-3">
        <span className="text-sm text-muted-foreground">Filtro:</span>
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-[220px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tutte</SelectItem>
            <SelectItem value="expiring_7">In scadenza entro 7 giorni</SelectItem>
            <SelectItem value="expiring_14">In scadenza entro 14 giorni</SelectItem>
            <SelectItem value="no_expiry">Senza scadenza</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Struttura</TableHead>
              <TableHead>Localita&apos;</TableHead>
              <TableHead>Venditore</TableHead>
              <TableHead>Stato</TableHead>
              <TableHead>Assegnato il</TableHead>
              <TableHead>Scadenza</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-10">
                  <Loader2 className="h-5 w-5 mx-auto animate-spin text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : list.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-10 text-muted-foreground">
                  Nessuna assegnazione trovata
                </TableCell>
              </TableRow>
            ) : (
              list.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="font-medium">{a.name}</TableCell>
                  <TableCell className="text-sm">
                    {a.city}
                    {a.province && (
                      <span className="text-muted-foreground"> ({a.province})</span>
                    )}
                  </TableCell>
                  <TableCell className="text-sm">
                    {a.assigned_agent?.display_name || a.assigned_agent?.email || "-"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">{a.status}</Badge>
                  </TableCell>
                  <TableCell className="text-sm">
                    {a.assignment_date
                      ? new Date(a.assignment_date).toLocaleDateString("it-IT")
                      : "-"}
                  </TableCell>
                  <TableCell>
                    {a.assignment_expires_at ? (
                      <ExpiryBadge expiresAt={a.assignment_expires_at} short={false} />
                    ) : (
                      <span className="text-xs text-muted-foreground">Nessuna</span>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
