"use client"

import { useState, useEffect } from "react"
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
  alerts: Alert[]
}

interface ActivityItem {
  id: string
  type: "tenant_created" | "plan_upgraded" | "plan_downgraded" | "tenant_suspended" | "error"
  tenant: string
  description: string
  timestamp: string
}

interface Alert {
  id: string
  severity: "warning" | "error" | "info"
  message: string
  tenant?: string
}

export default function SuperAdminDashboard() {
  const [stats, setStats] = useState<PlatformStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchStats()
  }, [])

  const fetchStats = async () => {
    try {
      const response = await fetch("/api/super-admin/dashboard")
      if (response.ok) {
        const data = await response.json()
        setStats(data)
      } else {
        // Use mock data if API not ready
        setStats(getMockStats())
      }
    } catch {
      setStats(getMockStats())
    } finally {
      setLoading(false)
    }
  }

  const getMockStats = (): PlatformStats => ({
    totalTenants: 1,
    activeTenants: 1,
    trialTenants: 0,
    suspendedTenants: 0,
    totalUsers: 3,
    totalConversations: 0,
    totalMessages: 0,
    mrr: 0,
    mrrGrowth: 0,
    newTenantsThisMonth: 1,
    churnRate: 0,
    recentActivity: [
      {
        id: "1",
        type: "tenant_created",
        tenant: "Villa I Barronci",
        description: "Nuovo tenant creato",
        timestamp: new Date().toISOString(),
      },
    ],
    planDistribution: [{ plan: "Professional", count: 1 }],
    alerts: [],
  })

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center">
        <div className="flex items-center gap-2 text-neutral-500">
          <Activity className="w-5 h-5 animate-pulse" />
          <span>Caricamento dashboard...</span>
        </div>
      </div>
    )
  }

  if (!stats) return null

  return (
    <div className="min-h-screen bg-neutral-50">
      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-neutral-900">Platform Overview</h1>
          <p className="text-neutral-500 mt-1">Gestione centralizzata di tutti i tenant</p>
        </div>

        {/* Alerts */}
        {stats.alerts.length > 0 && (
          <div className="mb-6 space-y-2">
            {stats.alerts.map((alert) => (
              <div
                key={alert.id}
                className={`p-4 rounded-lg flex items-center gap-3 ${
                  alert.severity === "error"
                    ? "bg-red-50 text-red-800 border border-red-200"
                    : alert.severity === "warning"
                      ? "bg-amber-50 text-amber-800 border border-amber-200"
                      : "bg-blue-50 text-blue-800 border border-blue-200"
                }`}
              >
                <AlertTriangle className="w-5 h-5 shrink-0" />
                <span className="flex-1">{alert.message}</span>
                {alert.tenant && <Badge variant="outline">{alert.tenant}</Badge>}
              </div>
            ))}
          </div>
        )}

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-neutral-500">Tenant Totali</CardTitle>
              <Building2 className="w-4 h-4 text-neutral-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalTenants}</div>
              <div className="flex items-center gap-1 text-xs text-neutral-500 mt-1">
                <span className="text-emerald-600">{stats.activeTenants} attivi</span>
                <span>·</span>
                <span className="text-amber-600">{stats.trialTenants} trial</span>
                <span>·</span>
                <span className="text-red-600">{stats.suspendedTenants} sospesi</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-neutral-500">MRR</CardTitle>
              <CreditCard className="w-4 h-4 text-neutral-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">€{stats.mrr.toLocaleString("it-IT")}</div>
              <div className="flex items-center gap-1 text-xs mt-1">
                {stats.mrrGrowth >= 0 ? (
                  <span className="text-emerald-600 flex items-center">
                    <ArrowUpRight className="w-3 h-3" />+{stats.mrrGrowth}%
                  </span>
                ) : (
                  <span className="text-red-600 flex items-center">
                    <ArrowDownRight className="w-3 h-3" />
                    {stats.mrrGrowth}%
                  </span>
                )}
                <span className="text-neutral-500">vs mese scorso</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-neutral-500">Utenti Totali</CardTitle>
              <Users className="w-4 h-4 text-neutral-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalUsers}</div>
              <div className="text-xs text-neutral-500 mt-1">
                Media: {(stats.totalUsers / Math.max(stats.totalTenants, 1)).toFixed(1)} per tenant
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-neutral-500">Conversazioni</CardTitle>
              <TrendingUp className="w-4 h-4 text-neutral-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalConversations.toLocaleString("it-IT")}</div>
              <div className="text-xs text-neutral-500 mt-1">
                {stats.totalMessages.toLocaleString("it-IT")} messaggi totali
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Recent Activity */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="w-5 h-5" />
                Attività Recente
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {stats.recentActivity.length === 0 ? (
                  <p className="text-neutral-500 text-sm text-center py-8">Nessuna attività recente</p>
                ) : (
                  stats.recentActivity.map((activity) => (
                    <div key={activity.id} className="flex items-start gap-3">
                      <div
                        className={`p-2 rounded-full shrink-0 ${
                          activity.type === "tenant_created"
                            ? "bg-emerald-100 text-emerald-600"
                            : activity.type === "plan_upgraded"
                              ? "bg-blue-100 text-blue-600"
                              : activity.type === "error"
                                ? "bg-red-100 text-red-600"
                                : "bg-neutral-100 text-neutral-600"
                        }`}
                      >
                        {activity.type === "tenant_created" && <Building2 className="w-4 h-4" />}
                        {activity.type === "plan_upgraded" && <Zap className="w-4 h-4" />}
                        {activity.type === "plan_downgraded" && <ArrowDownRight className="w-4 h-4" />}
                        {activity.type === "tenant_suspended" && <XCircle className="w-4 h-4" />}
                        {activity.type === "error" && <AlertTriangle className="w-4 h-4" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-neutral-900">{activity.description}</p>
                        <p className="text-xs text-neutral-500">{activity.tenant}</p>
                      </div>
                      <time className="text-xs text-neutral-400 shrink-0">
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

          {/* Plan Distribution */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="w-5 h-5" />
                Distribuzione Piani
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {stats.planDistribution.map((item) => (
                  <div key={item.plan} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={
                          item.plan === "Enterprise"
                            ? "default"
                            : item.plan === "Professional"
                              ? "secondary"
                              : "outline"
                        }
                      >
                        {item.plan}
                      </Badge>
                    </div>
                    <span className="font-semibold">{item.count}</span>
                  </div>
                ))}
              </div>

              <div className="mt-6 pt-4 border-t space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-neutral-500">Nuovi questo mese</span>
                  <span className="font-semibold text-emerald-600">+{stats.newTenantsThisMonth}</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-neutral-500">Churn rate</span>
                  <span className="font-semibold text-red-600">{stats.churnRate}%</span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <div className="mt-8">
          <h2 className="text-lg font-semibold text-neutral-900 mb-4">Azioni Rapide</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Link href="/super-admin/onboarding">
              <Card className="hover:border-neutral-300 transition-colors cursor-pointer">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-emerald-100 text-emerald-600">
                    <Building2 className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="font-medium text-neutral-900">Nuovo Tenant</p>
                    <p className="text-xs text-neutral-500">Crea nuova struttura</p>
                  </div>
                </CardContent>
              </Card>
            </Link>

            <Link href="/super-admin/structures">
              <Card className="hover:border-neutral-300 transition-colors cursor-pointer">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-blue-100 text-blue-600">
                    <Users className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="font-medium text-neutral-900">Gestisci Tenant</p>
                    <p className="text-xs text-neutral-500">Vedi tutte le strutture</p>
                  </div>
                </CardContent>
              </Card>
            </Link>

            <Link href="/super-admin/collaborators">
              <Card className="hover:border-neutral-300 transition-colors cursor-pointer">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-purple-100 text-purple-600">
                    <Users className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="font-medium text-neutral-900">Team</p>
                    <p className="text-xs text-neutral-500">Gestisci collaboratori</p>
                  </div>
                </CardContent>
              </Card>
            </Link>

            <Link href="/super-admin/billing">
              <Card className="hover:border-neutral-300 transition-colors cursor-pointer">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-amber-100 text-amber-600">
                    <CreditCard className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="font-medium text-neutral-900">Billing</p>
                    <p className="text-xs text-neutral-500">Fatturazione e piani</p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
