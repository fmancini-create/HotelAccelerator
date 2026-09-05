"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Activity, Coins, Search, UserRoundSearch, Users } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

type UsageRow = {
  userId: string | null
  name: string
  email: string
  role: string
  isTenantAdmin: boolean
  enabled: boolean
  searches: number
  saved: number
  enriched: number
  imported: number
  assignments: number
  dismissed: number
  failed: number
  creditsUsed: number
  assignedProspects: number
  lastUsedAt: string | null
}

type UsagePayload = {
  period: { from: string; to: string }
  users: UsageRow[]
  totals: {
    enabledUsers: number
    searches: number
    saved: number
    enriched: number
    imported: number
    creditsUsed: number
    assignedProspects: number
  }
}

function formatLastUse(value: string | null) {
  if (!value) return "Mai nel mese"
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "—"
  return new Intl.DateTimeFormat("it-IT", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)
}

export function ScoutUsagePanel() {
  const [data, setData] = useState<UsagePayload | null>(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const response = await fetch("/api/admin/crm/scout/usage", { cache: "no-store" })
        if (!response.ok) return
        const payload = await response.json()
        if (alive) setData(payload as UsagePayload)
      } catch {
        // Admin dashboard remains usable even if Scout monitoring is unavailable.
      }
    })()
    return () => { alive = false }
  }, [])

  if (!data) return null

  const month = new Intl.DateTimeFormat("it-IT", { month: "long", year: "numeric" }).format(new Date(data.period.from))
  const cards = [
    { label: "Utenti Scout abilitati", value: data.totals.enabledUsers, icon: Users },
    { label: "Ricerche nel mese", value: data.totals.searches, icon: Search },
    { label: "Prospect salvati", value: data.totals.saved, icon: UserRoundSearch },
    { label: "Crediti Scout registrati", value: data.totals.creditsUsed, icon: Coins },
  ]

  return (
    <section className="mx-auto mb-8 w-full max-w-7xl px-4 md:px-6" aria-label="Monitoraggio Scout">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-ha-brand" aria-hidden />
                <CardTitle>Utilizzo HotelAccelerator Scout per utente</CardTitle>
              </div>
              <CardDescription className="mt-1">
                Monitoraggio amministratore · {month}. Ricerche, prospect creati, verifiche, assegnazioni e consumo crediti registrato per singolo operatore.
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild size="sm" variant="outline"><Link href="/admin/users#permessi-scout">Gestisci accessi</Link></Button>
              <Button asChild size="sm" variant="outline"><Link href="/admin/crm/intelligence/scout">Apri Scout</Link></Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {cards.map(({ label, value, icon: Icon }) => (
              <div key={label} className="rounded-lg border bg-muted/20 p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs text-muted-foreground">{label}</span>
                  <Icon className="h-4 w-4 text-muted-foreground" aria-hidden />
                </div>
                <div className="mt-2 text-2xl font-semibold tabular-nums">{value.toLocaleString("it-IT")}</div>
              </div>
            ))}
          </div>

          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[1080px] text-sm">
              <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Utente</th>
                  <th className="px-3 py-2 text-center font-medium">Scout</th>
                  <th className="px-3 py-2 text-right font-medium">Ricerche</th>
                  <th className="px-3 py-2 text-right font-medium">Salvati</th>
                  <th className="px-3 py-2 text-right font-medium">Verifiche</th>
                  <th className="px-3 py-2 text-right font-medium">Importati</th>
                  <th className="px-3 py-2 text-right font-medium">Assegnazioni</th>
                  <th className="px-3 py-2 text-right font-medium">In carico</th>
                  <th className="px-3 py-2 text-right font-medium">Crediti</th>
                  <th className="px-3 py-2 text-right font-medium">Errori</th>
                  <th className="px-3 py-2 font-medium">Ultimo uso</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.users.map((user, index) => (
                  <tr key={`${user.userId || "platform"}-${user.name}-${index}`}>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{user.name}</span>
                        {user.isTenantAdmin && <Badge variant="outline">Admin</Badge>}
                      </div>
                      {user.email && <div className="text-xs text-muted-foreground">{user.email}</div>}
                    </td>
                    <td className="px-3 py-3 text-center">
                      <Badge variant={user.enabled ? "secondary" : "outline"}>{user.enabled ? "ON" : "OFF"}</Badge>
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">{user.searches}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{user.saved}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{user.enriched}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{user.imported}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{user.assignments}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{user.assignedProspects}</td>
                    <td className="px-3 py-3 text-right font-medium tabular-nums">{user.creditsUsed}</td>
                    <td className="px-3 py-3 text-right tabular-nums">{user.failed || "—"}</td>
                    <td className="px-3 py-3 text-xs text-muted-foreground">{formatLastUse(user.lastUsedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-muted-foreground">
            I crediti mostrati sono quelli registrati dalle operazioni Scout completate con successo; le ricerche e l'importazione nel CRM non consumano crediti di verifica.
          </p>
        </CardContent>
      </Card>
    </section>
  )
}
