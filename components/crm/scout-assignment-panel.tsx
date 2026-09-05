"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { ArrowRight, Loader2, RefreshCw, UserRoundCheck, Users } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

type Assignee = {
  id: string
  name: string
  email: string
  role: string
  isTenantAdmin: boolean
}

type Prospect = {
  id: string
  full_name: string | null
  job_title: string | null
  organization_name: string | null
  city: string | null
  country: string | null
  status: string
  assigned_to_user_id: string | null
  assigned_at: string | null
  assignee: { id: string; name: string; email: string } | null
  createdBy: { id: string; name: string; email: string } | null
}

type Payload = {
  access: {
    canAssign: boolean
    currentUserId: string | null
    isAdmin: boolean
    isGroupLead: boolean
  }
  assignees: Assignee[]
  prospects: Prospect[]
}

function formatAssigned(value: string | null) {
  if (!value) return ""
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  return new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(date)
}

export function ScoutAssignmentPanel() {
  const [data, setData] = useState<Payload | null>(null)
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState("")
  const [error, setError] = useState("")
  const [onlyUnassigned, setOnlyUnassigned] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const response = await fetch("/api/admin/crm/scout/team", { cache: "no-store" })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.error || "Impossibile leggere le assegnazioni Scout")
      setData(payload as Payload)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossibile leggere le assegnazioni Scout")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const prospects = useMemo(() => {
    const rows = data?.prospects ?? []
    return onlyUnassigned ? rows.filter((prospect) => !prospect.assigned_to_user_id) : rows
  }, [data?.prospects, onlyUnassigned])

  const assign = async (prospect: Prospect, userId: string | null) => {
    setBusyId(prospect.id)
    try {
      const response = await fetch("/api/admin/crm/scout/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "assign", prospectId: prospect.id, userId }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.error || "Assegnazione non riuscita")
      toast.success(userId ? "Prospect assegnato" : "Prospect rimesso tra i non assegnati")
      await load()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Assegnazione non riuscita")
    } finally {
      setBusyId("")
    }
  }

  if (loading && !data) {
    return (
      <section className="mt-6">
        <Card><CardContent className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></CardContent></Card>
      </section>
    )
  }

  if (error && !data) {
    return (
      <section className="mt-6">
        <Card><CardContent className="pt-6 text-sm text-destructive">{error}</CardContent></Card>
      </section>
    )
  }

  if (!data) return null
  const canAssign = data.access.canAssign

  return (
    <section className="mt-8 space-y-3" aria-label="Assegnazioni Scout">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                {canAssign ? <Users className="h-5 w-5 text-ha-brand" aria-hidden /> : <UserRoundCheck className="h-5 w-5 text-ha-brand" aria-hidden />}
                <CardTitle>{canAssign ? "Distribuzione prospect Scout" : "I miei prospect Scout"}</CardTitle>
              </div>
              <CardDescription className="mt-1">
                {canAssign
                  ? data.access.isGroupLead && !data.access.isAdmin
                    ? "Puoi assegnare i prospect non assegnati o quelli del tuo gruppo ai membri dei gruppi che coordini."
                    : "Assegna ogni prospect a un utente del tenant: da quel momento diventa il responsabile della lavorazione commerciale."
                  : "I prospect che crei personalmente vengono assegnati a te; qui vedi quelli di cui sei responsabile."}
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              {canAssign && (
                <Button
                  type="button"
                  size="sm"
                  variant={onlyUnassigned ? "default" : "outline"}
                  onClick={() => setOnlyUnassigned((value) => !value)}
                >
                  Non assegnati {data.prospects.filter((prospect) => !prospect.assigned_to_user_id).length}
                </Button>
              )}
              <Button type="button" size="sm" variant="outline" onClick={() => void load()} disabled={loading}>
                <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />Aggiorna
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link href="/admin/crm/prospecting">Apri lavorazione CRM<ArrowRight className="ml-2 h-4 w-4" /></Link>
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {prospects.length === 0 ? (
            <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              {onlyUnassigned ? "Nessun prospect da assegnare." : "Nessun prospect Scout in questa vista."}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full min-w-[820px] text-sm">
                <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-medium">Prospect</th>
                    <th className="px-3 py-2 font-medium">Azienda</th>
                    <th className="px-3 py-2 font-medium">Stato</th>
                    <th className="px-3 py-2 font-medium">Responsabile</th>
                    <th className="px-3 py-2 font-medium">Assegnato</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {prospects.map((prospect) => (
                    <tr key={prospect.id} className="align-middle">
                      <td className="px-3 py-3">
                        <div className="font-medium">{prospect.full_name || "Prospect"}</div>
                        <div className="text-xs text-muted-foreground">{prospect.job_title || [prospect.city, prospect.country].filter(Boolean).join(" · ") || "—"}</div>
                      </td>
                      <td className="px-3 py-3 text-muted-foreground">{prospect.organization_name || "—"}</td>
                      <td className="px-3 py-3"><Badge variant="outline">{prospect.status}</Badge></td>
                      <td className="px-3 py-3">
                        {canAssign ? (
                          <div className="flex items-center gap-2">
                            <select
                              className="h-9 min-w-[220px] rounded-md border bg-background px-2 text-sm"
                              value={prospect.assigned_to_user_id || "__unassigned__"}
                              disabled={busyId === prospect.id}
                              onChange={(event) => void assign(prospect, event.target.value === "__unassigned__" ? null : event.target.value)}
                              aria-label={`Assegna ${prospect.full_name || "prospect"}`}
                            >
                              <option value="__unassigned__">Non assegnato</option>
                              {data.assignees.map((user) => (
                                <option key={user.id} value={user.id}>{user.name}{user.isTenantAdmin ? " · Admin" : ""}</option>
                              ))}
                            </select>
                            {busyId === prospect.id && <Loader2 className="h-4 w-4 animate-spin" />}
                          </div>
                        ) : (
                          <span>{prospect.assignee?.name || "Tu"}</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-xs text-muted-foreground">{formatAssigned(prospect.assigned_at) || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  )
}
