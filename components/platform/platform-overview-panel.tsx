"use client"

import useSWR from "swr"
import Link from "next/link"
import {
  Building2,
  Users,
  TrendingUp,
  AlertTriangle,
  CreditCard,
  Activity,
  ArrowUpRight,
  ArrowDownRight,
  XCircle,
  Zap,
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

/**
 * Vista d'insieme sulla piattaforma: tutti i clienti sommati.
 *
 * PERCHE' E' UN COMPONENTE E NON UNA PAGINA.
 * Prima questo pannello era la pagina `/super-admin`, gemella di
 * `/admin/dashboard`: due cruscotti separati, due intestazioni, due menu. Ora e'
 * un pezzo che il cruscotto unico mostra in cima a chi amministra la
 * piattaforma, sopra i dati della struttura attiva.
 *
 * COSA E' STATO TOLTO, DI PROPOSITO: il ripiego su dati finti.
 * La pagina di prima aveva un `getMockStats()` usato in DUE casi — se l'API
 * rispondeva male e se la chiamata andava in errore. Il risultato era che una
 * sessione scaduta (401) o un guasto del database facevano comparire "1 tenant"
 * e "Villa I Barronci" con l'aria di essere veri: numeri inventati indistinguibili
 * da una misura. Un cruscotto che mente e' peggio di un cruscotto rotto, perche'
 * chi guarda non ha modo di sapere che sta guardando un'invenzione. Ora un
 * guasto si vede.
 */

interface ActivityItem {
  id: string
  type: "tenant_created" | "plan_upgraded" | "plan_downgraded" | "tenant_suspended" | "error"
  tenant: string
  description: string
  timestamp: string
}

interface PlatformAlert {
  id: string
  severity: "warning" | "error" | "info"
  message: string
  tenant?: string
}

interface PlatformStats {
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
  const res = await fetch(url)
  if (!res.ok) {
    // Si distingue la sessione scaduta dal guasto: sono due cose che l'utente
    // risolve in modi diversi (rientrare, oppure riprovare/segnalare).
    if (res.status === 401 || res.status === 403) {
      throw new Error("Sessione scaduta: rientra per vedere i dati della piattaforma.")
    }
    throw new Error(`Non riesco a leggere i dati della piattaforma (errore ${res.status}).`)
  }
  return res.json()
}

export function PlatformOverviewPanel() {
  const { data: stats, error, isLoading } = useSWR<PlatformStats>("/api/super-admin/dashboard", fetcher)

  if (isLoading) {
    return (
      <section aria-label="Vista d'insieme sulla piattaforma" className="mb-8">
        <div className="flex items-center gap-2 text-muted-foreground py-6">
          <Activity className="w-4 h-4 animate-pulse" aria-hidden />
          <span className="text-sm">Carico i dati della piattaforma...</span>
        </div>
      </section>
    )
  }

  if (error || !stats) {
    return (
      <section aria-label="Vista d'insieme sulla piattaforma" className="mb-8">
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-destructive shrink-0 mt-0.5" aria-hidden />
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">Dati della piattaforma non disponibili</p>
              <p className="text-sm text-muted-foreground mt-0.5">
                {error instanceof Error ? error.message : "Errore sconosciuto."}
              </p>
            </div>
          </CardContent>
        </Card>
      </section>
    )
  }

  return (
    <section aria-label="Vista d'insieme sulla piattaforma" className="mb-10">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-foreground">Tutta la piattaforma</h2>
        <p className="text-sm text-muted-foreground">
          Somma di tutti i clienti. I riquadri piu' sotto riguardano invece la struttura su cui stai lavorando.
        </p>
      </div>

      {stats.alerts.length > 0 && (
        <div className="mb-6 space-y-2">
          {stats.alerts.map((alert) => (
            <div
              key={alert.id}
              className={`p-4 rounded-lg flex items-center gap-3 border ${
                alert.severity === "error"
                  ? "bg-destructive/5 text-destructive border-destructive/30"
                  : alert.severity === "warning"
                    ? "bg-amber-50 text-amber-800 border-amber-200"
                    : "bg-muted text-foreground border-border"
              }`}
            >
              <AlertTriangle className="w-5 h-5 shrink-0" aria-hidden />
              <span className="flex-1 text-sm">{alert.message}</span>
              {alert.tenant && <Badge variant="outline">{alert.tenant}</Badge>}
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Strutture clienti</CardTitle>
            <Building2 className="w-4 h-4 text-muted-foreground" aria-hidden />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalTenants}</div>
            <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground mt-1">
              <span className="text-emerald-600">{stats.activeTenants} attive</span>
              <span>·</span>
              <span className="text-amber-600">{stats.trialTenants} in prova</span>
              <span>·</span>
              <span className="text-destructive">{stats.suspendedTenants} sospese</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Ricavo mensile</CardTitle>
            <CreditCard className="w-4 h-4 text-muted-foreground" aria-hidden />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">€{stats.mrr.toLocaleString("it-IT")}</div>
            <div className="flex items-center gap-1 text-xs mt-1">
              {stats.mrrGrowth >= 0 ? (
                <span className="text-emerald-600 flex items-center">
                  <ArrowUpRight className="w-3 h-3" aria-hidden />+{stats.mrrGrowth}%
                </span>
              ) : (
                <span className="text-destructive flex items-center">
                  <ArrowDownRight className="w-3 h-3" aria-hidden />
                  {stats.mrrGrowth}%
                </span>
              )}
              <span className="text-muted-foreground">rispetto al mese scorso</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Utenti su tutti i clienti</CardTitle>
            <Users className="w-4 h-4 text-muted-foreground" aria-hidden />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalUsers}</div>
            <div className="text-xs text-muted-foreground mt-1">
              Media: {(stats.totalUsers / Math.max(stats.totalTenants, 1)).toFixed(1)} per struttura
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Conversazioni</CardTitle>
            <TrendingUp className="w-4 h-4 text-muted-foreground" aria-hidden />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalConversations.toLocaleString("it-IT")}</div>
            <div className="text-xs text-muted-foreground mt-1">
              {stats.totalMessages.toLocaleString("it-IT")} messaggi in tutto
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="w-4 h-4" aria-hidden />
              Attivita&apos; recente
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {stats.recentActivity.length === 0 ? (
                <p className="text-muted-foreground text-sm text-center py-6">Nessuna attivita&apos; recente</p>
              ) : (
                stats.recentActivity.map((activity) => (
                  <div key={activity.id} className="flex items-start gap-3">
                    <div
                      className={`p-2 rounded-full shrink-0 ${
                        activity.type === "tenant_created"
                          ? "bg-emerald-100 text-emerald-700"
                          : activity.type === "plan_upgraded"
                            ? "bg-muted text-foreground"
                            : activity.type === "error"
                              ? "bg-destructive/10 text-destructive"
                              : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {activity.type === "tenant_created" && <Building2 className="w-4 h-4" aria-hidden />}
                      {activity.type === "plan_upgraded" && <Zap className="w-4 h-4" aria-hidden />}
                      {activity.type === "plan_downgraded" && <ArrowDownRight className="w-4 h-4" aria-hidden />}
                      {activity.type === "tenant_suspended" && <XCircle className="w-4 h-4" aria-hidden />}
                      {activity.type === "error" && <AlertTriangle className="w-4 h-4" aria-hidden />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">{activity.description}</p>
                      <p className="text-xs text-muted-foreground">{activity.tenant}</p>
                    </div>
                    <time className="text-xs text-muted-foreground shrink-0">
                      {new Date(activity.timestamp).toLocaleString("it-IT", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </time>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CreditCard className="w-4 h-4" aria-hidden />
              Piani sottoscritti
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {stats.planDistribution.map((item) => (
                <div key={item.plan} className="flex items-center justify-between">
                  <Badge
                    variant={
                      item.plan === "Enterprise" ? "default" : item.plan === "Professional" ? "secondary" : "outline"
                    }
                  >
                    {item.plan}
                  </Badge>
                  <span className="font-semibold">{item.count}</span>
                </div>
              ))}
            </div>

            <div className="mt-6 pt-4 border-t space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Nuove questo mese</span>
                <span className="font-semibold text-emerald-600">+{stats.newTenantsThisMonth}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Abbandoni</span>
                <span className="font-semibold text-destructive">{stats.churnRate}%</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <p className="text-sm text-muted-foreground mt-4">
        Le sezioni di piattaforma (strutture, fatturazione, costi dei moduli) sono nel menu{" "}
        <Link href="/super-admin/structures" className="underline underline-offset-2 hover:text-foreground">
          Altro › Piattaforma
        </Link>
        .
      </p>
    </section>
  )
}
