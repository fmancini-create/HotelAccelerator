"use client"

import type React from "react"
import { useState, useEffect } from "react"
import Link from "next/link"
import {
  Images,
  Users,
  LogOut,
  Settings,
  FileText,
  Calendar,
  MessageSquare,
  BarChart3,
  Lock,
  Home,
  Inbox,
  Megaphone,
  Globe,
  ExternalLink,
  Layers,
  Radio,
  Activity,
  CheckSquare,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { useAdminAuth, getRoleLabel } from "@/lib/admin-hooks"
import { createClient } from "@/lib/supabase/client"
import { Progress } from "@/components/ui/progress"
import RevenueSummaryCard from "@/components/admin/revenue-summary-card"

interface DashboardModule {
  id: string
  title: string
  description: string
  icon: React.ReactNode
  href: string
  requiresPermission?: "can_upload" | "can_delete" | "can_move" | "can_manage_users"
  comingSoon?: boolean
}

const dashboardModules: DashboardModule[] = [
  {
    id: "photos",
    title: "Gestione Foto",
    description: "Carica, elimina e organizza le foto delle camere",
    icon: <Images className="w-5 h-5" />,
    href: "/admin/photos",
  },
  {
    id: "cms",
    title: "Pagine CMS",
    description: "Crea e gestisci pagine libere del sito",
    icon: <Layers className="w-5 h-5" />,
    href: "/admin/cms",
  },
  {
    id: "channels",
    title: "Canali",
    description: "Configura Email, Chat, WhatsApp, Social e altri canali",
    icon: <Radio className="w-5 h-5" />,
    href: "/admin/channels",
  },
  {
    id: "inbox",
    title: "Inbox",
    description: "Gestisci tutte le conversazioni in un unico posto",
    icon: <Inbox className="w-5 h-5" />,
    href: "/admin/inbox",
  },
  {
    id: "smart-messages",
    title: "Smart Messages",
    description: "Mostra offerte e messaggi personalizzati ai visitatori",
    icon: <Megaphone className="w-5 h-5" />,
    href: "/admin/message-rules",
  },
  {
    id: "demand-calendar",
    title: "Calendario Domanda",
    description: "Monitora le date più cercate dai visitatori",
    icon: <Calendar className="w-5 h-5" />,
    href: "/admin/tracking/demand",
  },
  {
    id: "tracking-visitors",
    title: "Visitatori Live",
    description: "Sessioni in tempo reale, timeline eventi e stitching al CRM",
    icon: <Radio className="w-5 h-5" />,
    href: "/admin/tracking/visitors",
  },
  {
    id: "tracking-sites",
    title: "Siti Tracking",
    description: "Gestisci chiavi script-first e domini autorizzati per tenant",
    icon: <Globe className="w-5 h-5" />,
    href: "/admin/tracking/sites",
  },
  {
    id: "todos",
    title: "Task & To-Do",
    description: "Gestisci attività, assegna task al team e sincronizza con Manubot",
    icon: <CheckSquare className="w-5 h-5" />,
    href: "/admin/todos",
  },
  {
    id: "monitoring",
    title: "Monitoring",
    description: "Monitora utilizzo risorse e performance",
    icon: <Activity className="w-5 h-5" />,
    href: "/admin/monitoring",
  },
  {
    id: "domains",
    title: "Domini",
    description: "Configura subdomain e dominio personalizzato",
    icon: <Globe className="w-5 h-5" />,
    href: "/admin/settings/domains",
  },
  {
    id: "users",
    title: "Gestione Utenti",
    description: "Aggiungi e gestisci gli utenti admin",
    icon: <Users className="w-5 h-5" />,
    href: "/admin/users",
    requiresPermission: "can_manage_users",
  },
  {
    id: "profile",
    title: "Il Mio Profilo",
    description: "Modifica la tua password e visualizza i permessi",
    icon: <Lock className="w-5 h-5" />,
    href: "/admin/profile",
  },
  {
    id: "content",
    title: "Contenuti",
    description: "Modifica testi e contenuti del sito",
    icon: <FileText className="w-5 h-5" />,
    href: "/admin/content",
    comingSoon: true,
  },
  {
    id: "bookings",
    title: "Prenotazioni",
    description: "Visualizza e gestisci le prenotazioni",
    icon: <Calendar className="w-5 h-5" />,
    href: "/admin/bookings",
    comingSoon: true,
  },
  {
    id: "reviews",
    title: "Recensioni",
    description: "Gestisci le recensioni degli ospiti",
    icon: <MessageSquare className="w-5 h-5" />,
    href: "/admin/reviews",
    comingSoon: true,
  },
  {
    id: "analytics",
    title: "Statistiche",
    description: "Analisi del traffico e performance",
    icon: <BarChart3 className="w-5 h-5" />,
    href: "/admin/analytics",
    comingSoon: true,
  },
  {
    id: "settings",
    title: "Impostazioni",
    description: "Configurazione generale del sito",
    icon: <Settings className="w-5 h-5" />,
    href: "/admin/settings",
    comingSoon: true,
  },
]

export default function AdminDashboardPage() {
  const { isLoading, adminUser, logout } = useAdminAuth()
  const [property, setProperty] = useState<{ name: string; slug: string; domain: string | null } | null>(null)
  const [siteUrl, setSiteUrl] = useState<string>("/")
  const [quotas, setQuotas] = useState<{
    pages: { current: number; limit: number }
    photos: { current: number; limit: number }
    conversations: { current: number; limit: number }
    plan: string
  } | null>(null)

  // Qui siamo nella dashboard /admin, quindi è sempre un tenant admin
  const isSuperAdmin = false // In /admin siamo sempre nel contesto tenant

  useEffect(() => {
    async function loadProperty() {
      if (!adminUser?.property_id) return

      const supabase = createClient()
      if (!supabase) return

      const { data } = await supabase
        .from("properties")
        .select("name, slug, domain")
        .eq("id", adminUser.property_id)
        .single()

      if (data) {
        setProperty(data)
        if (data.domain) {
          setSiteUrl(`https://${data.domain}`)
        } else if (data.slug) {
          setSiteUrl(`/${data.slug}`)
        }
      }
    }

    async function loadQuotas() {
      if (!adminUser?.property_id) return

      try {
        const response = await fetch("/api/admin/quotas")
        if (response.ok) {
          const data = await response.json()
          setQuotas(data)
        }
      } catch (error) {
        // silently fail
      }
    }

    loadProperty()
    loadQuotas()
  }, [adminUser?.property_id])

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    )
  }

  const effectiveAdmin = adminUser

  if (!effectiveAdmin) {
    return null
  }

  const availableModules = dashboardModules.filter((module) => {
    if (module.requiresPermission) {
      return effectiveAdmin[module.requiresPermission]
    }
    return true
  })

  const isExternalSite = siteUrl.startsWith("https://")

  const headerTitle = property?.name || "Dashboard"

  const siteButtonLabel = "Sito"

  return (
    <main className="min-h-screen bg-background">
      {/* Header */}
      <header className="bg-background border-b border-border sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <h1 className="text-xl font-semibold text-foreground">{headerTitle}</h1>
              <span className="text-sm text-muted-foreground">Dashboard</span>
            </div>

            <div className="flex items-center gap-4">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-medium text-foreground">{effectiveAdmin.name}</p>
                <p className="text-xs text-muted-foreground">{getRoleLabel(effectiveAdmin.role)}</p>
              </div>
              {isExternalSite ? (
                <a href={siteUrl} target="_blank" rel="noopener noreferrer">
                  <Button
                    variant="outline"
                    size="sm"
                    className="bg-transparent"
                  >
                    <Home className="w-4 h-4 mr-2" />
                    {siteButtonLabel}
                    <ExternalLink className="w-3 h-3 ml-1" />
                  </Button>
                </a>
              ) : (
                <Link href={siteUrl}>
                  <Button
                    variant="outline"
                    size="sm"
                    className="bg-transparent"
                  >
                    <Home className="w-4 h-4 mr-2" />
                    {siteButtonLabel}
                  </Button>
                </Link>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={logout}
                className="bg-transparent"
              >
                <LogOut className="w-4 h-4 mr-2" />
                Esci
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Welcome Section */}
        <div className="mb-8">
          <h2 className="text-2xl font-semibold text-foreground mb-2">Benvenuto, {effectiveAdmin.name.split(" ")[0]}</h2>
          <p className="text-muted-foreground">Seleziona un modulo per iniziare.</p>
        </div>

        {quotas && !isSuperAdmin && (
          <div className="mb-8 bg-card rounded-xl border border-border p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-foreground">Utilizzo Risorse</h3>
              <span className="px-3 py-1 bg-primary text-primary-foreground text-xs rounded-full uppercase">
                Piano {quotas.plan}
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-muted-foreground">Pagine CMS</span>
                  <span className="text-foreground font-medium">
                    {quotas.pages?.current ?? 0} / {quotas.pages?.limit === -1 ? "∞" : (quotas.pages?.limit ?? 0)}
                  </span>
                </div>
                <Progress
                  value={
                    quotas.pages?.limit === -1 ? 10 : ((quotas.pages?.current ?? 0) / (quotas.pages?.limit || 1)) * 100
                  }
                  className="h-2"
                />
              </div>
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-muted-foreground">Foto</span>
                  <span className="text-foreground font-medium">
                    {quotas.photos?.current ?? 0} / {quotas.photos?.limit === -1 ? "∞" : (quotas.photos?.limit ?? 0)}
                  </span>
                </div>
                <Progress
                  value={
                    quotas.photos?.limit === -1
                      ? 10
                      : ((quotas.photos?.current ?? 0) / (quotas.photos?.limit || 1)) * 100
                  }
                  className="h-2"
                />
              </div>
              <div>
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-muted-foreground">Conversazioni/mese</span>
                  <span className="text-foreground font-medium">
                    {quotas.conversations?.current ?? 0} /{" "}
                    {quotas.conversations?.limit === -1 ? "∞" : (quotas.conversations?.limit ?? 0)}
                  </span>
                </div>
                <Progress
                  value={
                    quotas.conversations?.limit === -1
                      ? 10
                      : ((quotas.conversations?.current ?? 0) / (quotas.conversations?.limit || 1)) * 100
                  }
                  className="h-2"
                />
              </div>
            </div>
          </div>
        )}

        {/* Revenue (modulo Santaddeo, read-only) */}
        <RevenueSummaryCard />

        {/* Modules Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {availableModules.map((module) => (
            <div key={module.id} className="relative">
              {module.comingSoon ? (
                <div className="bg-card rounded-xl border border-border p-6 opacity-60 cursor-not-allowed">
                  <div className="w-10 h-10 rounded-lg bg-secondary text-muted-foreground flex items-center justify-center mb-4">
                    {module.icon}
                  </div>
                  <h3 className="text-base font-medium text-foreground mb-2">{module.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed mb-4">{module.description}</p>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Lock className="w-4 h-4" />
                    <span>Prossimamente</span>
                  </div>
                </div>
              ) : (
                <Link href={module.href}>
                  <div className="bg-card rounded-xl border border-border p-6 hover:border-primary/40 hover:shadow-sm transition-colors duration-200 cursor-pointer group">
                    <div className="w-10 h-10 rounded-lg bg-secondary text-foreground flex items-center justify-center mb-4 group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                      {module.icon}
                    </div>
                    <h3 className="text-base font-medium text-foreground mb-2">{module.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{module.description}</p>
                  </div>
                </Link>
              )}
            </div>
          ))}
        </div>

        {/* Quick Stats */}
        <div className="mt-12">
          <h3 className="text-lg font-medium text-foreground mb-4">Riepilogo Rapido</h3>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-card rounded-xl border border-border p-4">
              <p className="text-2xl font-semibold text-foreground">109</p>
              <p className="text-sm text-muted-foreground">Foto totali</p>
            </div>
            <div className="bg-card rounded-xl border border-border p-4">
              <p className="text-2xl font-semibold text-foreground">8</p>
              <p className="text-sm text-muted-foreground">Categorie camere</p>
            </div>
            <div className="bg-card rounded-xl border border-border p-4">
              <p className="text-2xl font-semibold text-foreground">3</p>
              <p className="text-sm text-muted-foreground">Utenti attivi</p>
            </div>
            <div className="bg-card rounded-xl border border-border p-4">
              <p className="text-2xl font-semibold text-foreground">Online</p>
              <p className="text-sm text-muted-foreground">Stato sito</p>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
