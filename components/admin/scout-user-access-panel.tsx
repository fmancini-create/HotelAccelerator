"use client"

import { useCallback, useEffect, useState } from "react"
import Link from "next/link"
import { Loader2, RefreshCw, UserRoundSearch } from "lucide-react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"

type UserRow = {
  id: string
  name: string
  email: string
  role: string
  isTenantAdmin: boolean
  isGroupLead: boolean
  scoutEnabled: boolean
  scoutUpdatedAt: string | null
}

export function ScoutUserAccessPanel() {
  const [users, setUsers] = useState<UserRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState("")
  const [error, setError] = useState("")

  const load = useCallback(async () => {
    setLoading(true)
    setError("")
    try {
      const response = await fetch("/api/admin/crm/scout/users", { cache: "no-store" })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.error || "Impossibile leggere i permessi Scout")
      setUsers(payload?.users ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossibile leggere i permessi Scout")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const toggle = async (user: UserRow, enabled: boolean) => {
    setBusyId(user.id)
    try {
      const response = await fetch("/api/admin/crm/scout/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user.id, enabled }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok) throw new Error(payload?.error || "Aggiornamento Scout non riuscito")
      setUsers((current) => current.map((row) => row.id === user.id
        ? { ...row, scoutEnabled: payload.scoutEnabled === true, scoutUpdatedAt: payload.scoutUpdatedAt ?? row.scoutUpdatedAt }
        : row))
      toast.success(enabled ? `Scout attivato per ${user.name}` : `Scout disattivato per ${user.name}`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Aggiornamento Scout non riuscito")
    } finally {
      setBusyId("")
    }
  }

  return (
    <section id="permessi-scout" className="container mx-auto px-4 pb-10">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <UserRoundSearch className="h-5 w-5 text-ha-brand" aria-hidden />
                <CardTitle>Permessi HotelAccelerator Scout</CardTitle>
              </div>
              <CardDescription className="mt-1 max-w-3xl">
                Decidi chi può usare Scout. L'abilitazione è individuale e separata dal normale accesso al CRM. Un amministratore o un capogruppo abilitato può anche distribuire i prospect agli utenti da lavorare.
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
                <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />Aggiorna
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link href="/admin/crm/intelligence/scout">Apri Scout</Link>
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {error ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>
          ) : loading && users.length === 0 ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : users.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Nessun utente nel tenant.</p>
          ) : (
            <div className="divide-y rounded-lg border">
              {users.map((user) => (
                <div key={user.id} className="flex flex-wrap items-center justify-between gap-4 p-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{user.name}</span>
                      {user.isTenantAdmin && <Badge variant="secondary">Admin tenant</Badge>}
                      {user.isGroupLead && <Badge variant="outline">Capogruppo</Badge>}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {user.scoutEnabled
                        ? user.isTenantAdmin || user.isGroupLead
                          ? "Può usare Scout e assegnare prospect agli utenti che può gestire."
                          : "Può usare Scout; i prospect che seleziona vengono assegnati a lui/lei."
                        : "Scout non disponibile per questo utente."}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 rounded-md border px-3 py-2">
                    <div className="text-right">
                      <p className="text-xs font-medium">Scout</p>
                      <p className="text-[11px] text-muted-foreground">{user.scoutEnabled ? "Abilitato" : "Disabilitato"}</p>
                    </div>
                    {busyId === user.id && <Loader2 className="h-4 w-4 animate-spin" />}
                    <Switch
                      checked={user.scoutEnabled}
                      disabled={busyId === user.id}
                      onCheckedChange={(enabled) => void toggle(user, enabled)}
                      aria-label={`${user.scoutEnabled ? "Disattiva" : "Attiva"} Scout per ${user.name}`}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  )
}
