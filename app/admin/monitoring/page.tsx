"use client"

import type React from "react"
import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Skeleton } from "@/components/ui/skeleton"
import { AdminHeader } from "@/components/admin/admin-header"
import { useAdminAuth } from "@/lib/admin-hooks"
import {
  ActivityIcon,
  AlertTriangle,
  Database,
  HardDrive,
  Mail,
  MessageSquare,
  FileText,
  Users,
  TrendingUp,
  CheckCircle2,
} from "lucide-react"

interface QuotaStatus {
  usage: {
    photosCount: number
    pagesCount: number
    emailChannelsCount: number
    conversationsThisMonth: number
    adminUsersCount: number
    messagesToday: number
    eventsToday: number
  }
  percentages: {
    photos: number
    pages: number
    emailChannels: number
    conversations: number
    adminUsers: number
  }
  warnings: string[]
  quotas: {
    maxPhotosCount: number
    maxPagesCount: number
    maxEmailChannels: number
    maxConversationsPerMonth: number
    maxAdminUsers: number
  }
}

interface TenantStats {
  totalConversations: number
  totalMessages: number
  totalContacts: number
  totalEvents: number
}

function QuotaItem({
  icon,
  label,
  current,
  limit,
  percentage,
}: {
  icon: React.ReactNode
  label: string
  current: number
  limit: number
  percentage: number
}) {
  const getColor = (p: number) => {
    if (p >= 90) return "bg-red-500"
    if (p >= 75) return "bg-yellow-500"
    return "bg-green-500"
  }

  const getBadgeVariant = (p: number): "destructive" | "secondary" | "default" => {
    if (p >= 90) return "destructive"
    if (p >= 75) return "secondary"
    return "default"
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-sm font-medium">{label}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">
            {current} / {limit}
          </span>
          <Badge variant={getBadgeVariant(percentage)}>{percentage}%</Badge>
        </div>
      </div>
      <Progress value={percentage} className={`h-2 ${getColor(percentage)}`} />
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-32 w-full" />
      <div className="grid gap-4 md:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
      <Skeleton className="h-96 w-full" />
    </div>
  )
}

export default function MonitoringPage() {
  const { adminUser, isLoading: authLoading } = useAdminAuth()
  const [quotaStatus, setQuotaStatus] = useState<QuotaStatus | null>(null)
  const [stats, setStats] = useState<TenantStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function loadData() {
      if (!adminUser?.property_id) return

      try {
        setLoading(true)
        const res = await fetch(`/api/admin/monitoring?propertyId=${adminUser.property_id}`)
        if (!res.ok) {
          throw new Error("Errore nel caricamento dei dati")
        }
        const data = await res.json()
        setQuotaStatus(data.quotaStatus)
        setStats(data.stats)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Errore sconosciuto")
      } finally {
        setLoading(false)
      }
    }

    if (!authLoading && adminUser) {
      loadData()
    }
  }, [adminUser, authLoading])

  if (authLoading || loading) {
    return (
      <>
        <AdminHeader
          title="Monitoring"
          description="Stato del sistema e utilizzo risorse"
          breadcrumbs={[{ label: "Admin", href: "/admin" }, { label: "Monitoring" }]}
        />
        <div className="container py-6">
          <LoadingSkeleton />
        </div>
      </>
    )
  }

  if (!adminUser) {
    return (
      <>
        <AdminHeader
          title="Monitoring"
          description="Stato del sistema e utilizzo risorse"
          breadcrumbs={[{ label: "Admin", href: "/admin" }, { label: "Monitoring" }]}
        />
        <div className="container py-6">
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Non autorizzato</AlertTitle>
            <AlertDescription>Devi effettuare il login per accedere a questa pagina.</AlertDescription>
          </Alert>
        </div>
      </>
    )
  }

  if (error) {
    return (
      <>
        <AdminHeader
          title="Monitoring"
          description="Stato del sistema e utilizzo risorse"
          breadcrumbs={[{ label: "Admin", href: "/admin" }, { label: "Monitoring" }]}
        />
        <div className="container py-6">
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Errore</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </div>
      </>
    )
  }

  if (!quotaStatus || !stats) {
    return (
      <>
        <AdminHeader
          title="Monitoring"
          description="Stato del sistema e utilizzo risorse"
          breadcrumbs={[{ label: "Admin", href: "/admin" }, { label: "Monitoring" }]}
        />
        <div className="container py-6">
          <LoadingSkeleton />
        </div>
      </>
    )
  }

  const { usage, percentages, warnings } = quotaStatus

  return (
    <>
      <AdminHeader
        title="Monitoring"
        description="Stato del sistema e utilizzo risorse"
        breadcrumbs={[{ label: "Admin", href: "/admin" }, { label: "Monitoring" }]}
      />
      <div className="container py-6">
        <div className="space-y-6">
          {/* Health Status */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ActivityIcon className="h-5 w-5" />
                Stato Sistema
              </CardTitle>
            </CardHeader>
            <CardContent>
              {warnings.length === 0 ? (
                <Alert>
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <AlertTitle>Tutto OK</AlertTitle>
                  <AlertDescription>
                    Tutti i sistemi funzionano correttamente. Nessun problema rilevato.
                  </AlertDescription>
                </Alert>
              ) : (
                <div className="space-y-2">
                  {warnings.map((warning, i) => (
                    <Alert key={i} variant="destructive">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertTitle>Attenzione</AlertTitle>
                      <AlertDescription>{warning}</AlertDescription>
                    </Alert>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Stats Overview */}
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Conversazioni</CardTitle>
                <MessageSquare className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.totalConversations}</div>
                <p className="text-xs text-muted-foreground">{usage.conversationsThisMonth} questo mese</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Messaggi</CardTitle>
                <Mail className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.totalMessages}</div>
                <p className="text-xs text-muted-foreground">{usage.messagesToday} oggi</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Contatti</CardTitle>
                <Users className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.totalContacts}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Eventi</CardTitle>
                <TrendingUp className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stats.totalEvents}</div>
                <p className="text-xs text-muted-foreground">{usage.eventsToday} oggi</p>
              </CardContent>
            </Card>
          </div>

          {/* Quota Usage */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5" />
                Utilizzo Quote
              </CardTitle>
              <CardDescription>Consumo risorse rispetto ai limiti del piano</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <QuotaItem
                  icon={<HardDrive className="h-4 w-4" />}
                  label="Foto"
                  current={usage.photosCount}
                  limit={quotaStatus.quotas.maxPhotosCount}
                  percentage={percentages.photos}
                />

                <QuotaItem
                  icon={<FileText className="h-4 w-4" />}
                  label="Pagine CMS"
                  current={usage.pagesCount}
                  limit={quotaStatus.quotas.maxPagesCount}
                  percentage={percentages.pages}
                />

                <QuotaItem
                  icon={<Mail className="h-4 w-4" />}
                  label="Canali Email"
                  current={usage.emailChannelsCount}
                  limit={quotaStatus.quotas.maxEmailChannels}
                  percentage={percentages.emailChannels}
                />

                <QuotaItem
                  icon={<MessageSquare className="h-4 w-4" />}
                  label="Conversazioni (mese)"
                  current={usage.conversationsThisMonth}
                  limit={quotaStatus.quotas.maxConversationsPerMonth}
                  percentage={percentages.conversations}
                />

                <QuotaItem
                  icon={<Users className="h-4 w-4" />}
                  label="Utenti Admin"
                  current={usage.adminUsersCount}
                  limit={quotaStatus.quotas.maxAdminUsers}
                  percentage={percentages.adminUsers}
                />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  )
}
