"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import useSWR from "swr"
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Building2,
  CreditCard,
  Users,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

type ActivityItem = {
  id: string
  type: "tenant_created" | "plan_upgraded" | "plan_downgraded" | "tenant_suspended" | "error"
  tenant: string
  description: string
  timestamp: string
}

type PlatformAlert = {
  id: string
  severity: "warning" | "error" | "info"
  message: string
  tenant?: string
}

type PlatformStats = {
  totalTenants: number
  activeTenants: number
  trialTenants: number
  suspendedTenants: number
  totalUsers: number
  totalConversations: number
  totalMessages: number
  mrr: number
  mrrGrowth: number
  newTenantsThisMonth: number
  churnRate: number
  recentActivity: ActivityItem[]
  planDistribution: { plan: string; count: number }[]
  alerts: PlatformAlert[]
}

async function fetcher(url: string): Promise<PlatformStats> {
  const response = await fetch(url, { credentials: "include", cache: "no-store" })
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error("Sessione Super Admin scaduta: rientra per leggere i dati della piattaforma.")
    }
    throw new Error(`Dati piattaforma non disponibili (errore ${response.status}).`)
  }
  return response.json()
}

function number(value: number) {
  return value.toLocaleString("it-IT")
}

/**
 * Panoramica globale. E' deliberatamente inerte fuori da `/super-admin`: il
 * componente era storicamente importato anche dalla dashboard tenant, quindi
 * questa guardia impedisce sia il rendering sia il fetch dei dati globali
 * mentre si lavora su una singola struttura.
 */
export function PlatformOverviewPanel() {
  const pathname = usePathname() || ""
  const inPlatformArea = pathname === "/super-admin" || pathname.startsWith("/super-admin/")
  const { data: stats, error, isLoading } = useSWR<PlatformStats>(
    inPlatformArea ? "/api/super-admin/dashboard" : null,
    fetcher,
    { revalidateOnFocus: false },
  )

  if (!inPlatformArea) return null

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
        <Activity className="h-4 w-4 animate-pulse" aria-hidden />
        Carico i dati aggregati della piattaforma...
      </div>
    )
  }

  if (error || !stats) {
    return (
      <Card className="border-destructive/40 bg-destructive/5">
        <CardContent className="flex items-start gap-3 p-5">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden />
          <div>
            <p className="font-medium text-foreground">Dati della piattaforma non disponibili</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {error instanceof Error ? error.message : "Errore sconosciuto."}
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <section data-platform-overview aria-label="Dashboard aggregata di piattaforma" className="space-y-6">
      {stats.alerts.length > 0 && (
        <div className="space-y-2">
          {stats.alerts.map((alert) => (
            <div
              key={alert.id}
              className="flex items-center gap-3 rounded-lg border border-border bg-muted/40 px-4 py-3"
            >
              <AlertTriangle className="h-4 w-4 shrink-0 text-ha-warning" aria-hidden />
              <span className="flex-1 text-sm text-foreground">{alert.message}</span>
              {alert.tenant && <Badge variant="outline">{alert.tenant}</Badge>}
            </div>
          ))}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Tenant</CardTitle>
            <Building2 className="h-4 w-4 text-muted-foreground" aria-hidden />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">{number(stats.totalTenants)}</div>
            <p className="mt-1 text-xs text-muted-foreground">
              {stats.activeTenants} attivi · {stats.trialTenants} trial · {stats.suspendedTenants} sospesi
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">MRR piattaforma</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" aria-hidden />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">€{number(stats.mrr)}</div>
            <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
              {stats.mrrGrowth >= 0 ? (
                <ArrowUpRight className="h-3.5 w-3.5 text-ha-success" aria-hidden />
              ) : (
                <ArrowDownRight className="h-3.5 w-3.5 text-destructive" aria-hidden />
              )}
              <span>{stats.mrrGrowth}% rispetto al mese scorso</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Utenti complessivi</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" aria-hidden />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">{number(stats.totalUsers)}</div>
            <p className="mt-1 text-xs text-muted-foreground">
              {stats.totalTenants > 0 ? (stats.totalUsers / stats.totalTenants).toFixed(1) : "0"} medi per tenant
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Conversazioni globali</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" aria-hidden />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold tabular-nums">{number(stats.totalConversations)}</div>
            <p className="mt-1 text-xs text-muted-foreground">{number(stats.totalMessages)} messaggi complessivi</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Attività recente della piattaforma</CardTitle>
          </CardHeader>
          <CardContent>
            {stats.recentActivity.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Nessuna attività recente.</p>
            ) : (
              <div className="divide-y divide-border">
                {stats.recentActivity.slice(0, 10).map((item) => (
                  <div key={item.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                    <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-ha-brand" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground">{item.description}</p>
                      <p className="text-xs text-muted-foreground">{item.tenant}</p>
                    </div>
                    <time className="shrink-0 text-xs text-muted-foreground">
                      {new Date(item.timestamp).toLocaleString("it-IT", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </time>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Portafoglio clienti</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              {stats.planDistribution.map((item) => (
                <div key={item.plan} className="flex items-center justify-between gap-3">
                  <Badge variant="outline">{item.plan}</Badge>
                  <span className="font-semibold tabular-nums">{item.count}</span>
                </div>
              ))}
            </div>
            <div className="border-t border-border pt-4 text-sm">
              <div className="flex justify-between gap-3">
                <span className="text-muted-foreground">Nuovi questo mese</span>
                <span className="font-semibold">+{stats.newTenantsThisMonth}</span>
              </div>
              <div className="mt-2 flex justify-between gap-3">
                <span className="text-muted-foreground">Churn</span>
                <span className="font-semibold">{stats.churnRate}%</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-3 border-t border-border pt-5 sm:grid-cols-2 lg:grid-cols-4">
        <Link href="/super-admin/structures" className="rounded-lg border border-border p-3 text-sm font-medium hover:bg-muted">
          Gestisci tenant
        </Link>
        <Link href="/super-admin/billing" className="rounded-lg border border-border p-3 text-sm font-medium hover:bg-muted">
          Fatturazione piattaforma
        </Link>
        <Link href="/super-admin/module-costs" className="rounded-lg border border-border p-3 text-sm font-medium hover:bg-muted">
          Costi e prezzi moduli
        </Link>
        <Link href="/super-admin/roadmap" className="rounded-lg border border-border p-3 text-sm font-medium hover:bg-muted">
          Roadmap piattaforma
        </Link>
      </div>
    </section>
  )
}
