"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Trash2, Eye } from "lucide-react"

type Agent = { id: string; email: string | null; full_name: string | null }
type Grant = {
  id: string
  sales_agent_id: string
  granted_at: string
  sales_agent_email: string | null
  sales_agent_name: string | null
}

export function RevmanSalesAccessManager({ hotelId }: { hotelId: string }) {
  const [agents, setAgents] = useState<Agent[]>([])
  const [grants, setGrants] = useState<Grant[]>([])
  const [selected, setSelected] = useState<string>("")
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function refresh() {
    setLoading(true)
    try {
      const [aRes, gRes] = await Promise.all([
        fetch("/api/superadmin/sales-agents"),
        fetch(`/api/superadmin/revman-sales-access?hotel_id=${hotelId}`),
      ])
      const aJson = await aRes.json()
      const gJson = await gRes.json()
      if (!aRes.ok) throw new Error(aJson.error || "Errore caricamento venditori")
      if (!gRes.ok) throw new Error(gJson.error || "Errore caricamento grant")
      setAgents(aJson.agents || [])
      setGrants(gJson.grants || [])
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [hotelId])

  async function grant() {
    if (!selected) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch("/api/superadmin/revman-sales-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hotel_id: hotelId, sales_agent_id: selected }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Errore concessione accesso")
      setSelected("")
      await refresh()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  async function revoke(grantId: string) {
    if (!confirm("Revocare l'accesso a questo venditore?")) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/superadmin/revman-sales-access?id=${grantId}`, {
        method: "DELETE",
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Errore revoca")
      await refresh()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  // Venditori non ancora autorizzati su questo hotel
  const grantedIds = new Set(grants.map((g) => g.sales_agent_id))
  const available = agents.filter((a) => !grantedIds.has(a.id))

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Eye className="h-4 w-4" />
          Accesso venditori (sola lettura)
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          I venditori autorizzati possono visualizzare note, attivit&agrave; e file
          di questo hotel. Non possono modificare nulla.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <div className="text-sm text-destructive bg-destructive/10 p-2 rounded">
            {error}
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-2">
          <Select value={selected} onValueChange={setSelected} disabled={busy || loading}>
            <SelectTrigger className="flex-1">
              <SelectValue placeholder={loading ? "Caricamento..." : "Seleziona venditore"} />
            </SelectTrigger>
            <SelectContent>
              {available.length === 0 && (
                <div className="px-2 py-1.5 text-sm text-muted-foreground">
                  Tutti i venditori hanno gi&agrave; accesso
                </div>
              )}
              {available.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.full_name || a.email || a.id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={grant} disabled={!selected || busy}>
            Concedi accesso
          </Button>
        </div>

        {grants.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nessun venditore ha accesso a questo hotel.
          </p>
        ) : (
          <ul className="divide-y rounded border">
            {grants.map((g) => (
              <li
                key={g.id}
                className="flex items-center justify-between gap-2 px-3 py-2"
              >
                <div className="text-sm">
                  <div className="font-medium">
                    {g.sales_agent_name || g.sales_agent_email || g.sales_agent_id}
                  </div>
                  {g.sales_agent_name && g.sales_agent_email && (
                    <div className="text-xs text-muted-foreground">
                      {g.sales_agent_email}
                    </div>
                  )}
                  <div className="text-xs text-muted-foreground">
                    Concesso il {new Date(g.granted_at).toLocaleDateString("it-IT")}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => revoke(g.id)}
                  disabled={busy}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
