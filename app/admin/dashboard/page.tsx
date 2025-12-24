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
  Mail,
  Globe,
  ExternalLink,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { useAdminAuth, getRoleLabel } from "@/lib/admin-hooks"
import { createClient } from "@/lib/supabase/client"

interface DashboardModule {
  id: string
  title: string
  description: string
  icon: React.ReactNode
  href: string
  color: string
  requiresPermission?: "can_upload" | "can_delete" | "can_move" | "can_manage_users"
  comingSoon?: boolean
}

const dashboardModules: DashboardModule[] = [
  {
    id: "photos",
    title: "Gestione Foto",
    description: "Carica, elimina e organizza le foto delle camere",
    icon: <Images className="w-8 h-8" />,
    href: "/admin/photos",
    color: "bg-blue-500",
  },
  {
    id: "inbox",
    title: "Email Inbox",
    description: "Gestisci richieste email con dettagli prenotazione",
    icon: <Inbox className="w-8 h-8" />,
    href: "/admin/inbox/email",
    color: "bg-emerald-500",
  },
  {
    id: "email-channels",
    title: "Canali Email",
    description: "Configura le caselle email da monitorare",
    icon: <Mail className="w-8 h-8" />,
    href: "/admin/channels/email",
    color: "bg-sky-500",
  },
  {
    id: "smart-messages",
    title: "Smart Messages",
    description: "Mostra offerte e messaggi personalizzati ai visitatori",
    icon: <Megaphone className="w-8 h-8" />,
    href: "/admin/message-rules",
    color: "bg-indigo-500",
  },
  {
    id: "domains",
    title: "Domini",
    description: "Configura subdomain e dominio personalizzato",
    icon: <Globe className="w-8 h-8" />,
    href: "/admin/settings/domains",
    color: "bg-teal-500",
  },
  {
    id: "users",
    title: "Gestione Utenti",
    description: "Aggiungi e gestisci gli utenti admin",
    icon: <Users className="w-8 h-8" />,
    href: "/admin/users",
    color: "bg-purple-500",
    requiresPermission: "can_manage_users",
  },
  {
    id: "profile",
    title: "Il Mio Profilo",
    description: "Modifica la tua password e visualizza i permessi",
    icon: <Lock className="w-8 h-8" />,
    href: "/admin/profile",
    color: "bg-amber-500",
  },
  {
    id: "content",
    title: "Contenuti",
    description: "Modifica testi e contenuti del sito",
    icon: <FileText className="w-8 h-8" />,
    href: "/admin/content",
    color: "bg-green-500",
    comingSoon: true,
  },
  {
    id: "bookings",
    title: "Prenotazioni",
    description: "Visualizza e gestisci le prenotazioni",
    icon: <Calendar className="w-8 h-8" />,
    href: "/admin/bookings",
    color: "bg-orange-500",
    comingSoon: true,
  },
  {
    id: "reviews",
    title: "Recensioni",
    description: "Gestisci le recensioni degli ospiti",
    icon: <MessageSquare className="w-8 h-8" />,
    href: "/admin/reviews",
    color: "bg-pink-500",
    comingSoon: true,
  },
  {
    id: "analytics",
    title: "Statistiche",
    description: "Analisi del traffico e performance",
    icon: <BarChart3 className="w-8 h-8" />,
    href: "/admin/analytics",
    color: "bg-cyan-500",
    comingSoon: true,
  },
  {
    id: "settings",
    title: "Impostazioni",
    description: "Configurazione generale del sito",
    icon: <Settings className="w-8 h-8" />,
    href: "/admin/settings",
    color: "bg-gray-500",
    comingSoon: true,
  },
]

export default function AdminDashboardPage() {
  const { isLoading, adminUser, logout } = useAdminAuth()
  const [property, setProperty] = useState<{ name: string; slug: string; domain: string | null } | null>(null)
  const [siteUrl, setSiteUrl] = useState<string>("/")

  const isSuperAdmin = adminUser?.role === "super_admin"

  useEffect(() => {
    async function loadProperty() {
      // super_admin non è legato a una property specifica
      if (!adminUser?.property_id || isSuperAdmin) return

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

    loadProperty()
  }, [adminUser?.property_id, isSuperAdmin])

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#f8f7f4] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#8b7355]"></div>
      </div>
    )
  }

  if (!adminUser) {
    return null
  }

  const availableModules = dashboardModules.filter((module) => {
    if (module.requiresPermission) {
      return adminUser[module.requiresPermission]
    }
    return true
  })

  const isExternalSite = siteUrl.startsWith("https://")

  const headerTitle = isSuperAdmin ? "HotelAccelerator" : property?.name || "Dashboard"

  const siteButtonLabel = isSuperAdmin ? "Home" : "Sito"

  return (
    <main className="min-h-screen bg-[#f8f7f4]">
      {/* Header */}
      <header className="bg-white border-b border-[#e5e5e5] sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <h1 className="text-xl font-serif text-[#5c5c5c]">{headerTitle}</h1>
              <span className="text-sm text-[#8b8b8b]">Dashboard</span>
            </div>

            <div className="flex items-center gap-4">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-medium text-[#5c5c5c]">{adminUser.name}</p>
                <p className="text-xs text-[#8b8b8b]">{getRoleLabel(adminUser.role)}</p>
              </div>
              {isExternalSite ? (
                <a href={siteUrl} target="_blank" rel="noopener noreferrer">
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-[#8b7355] text-[#8b7355] hover:bg-[#8b7355] hover:text-white bg-transparent"
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
                    className="border-[#8b7355] text-[#8b7355] hover:bg-[#8b7355] hover:text-white bg-transparent"
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
                className="border-[#8b7355] text-[#8b7355] hover:bg-[#8b7355] hover:text-white bg-transparent"
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
          <h2 className="text-2xl font-serif text-[#5c5c5c] mb-2">Benvenuto, {adminUser.name.split(" ")[0]}</h2>
          <p className="text-[#8b8b8b]">Seleziona un modulo per iniziare.</p>
        </div>

        {/* Modules Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {availableModules.map((module) => (
            <div key={module.id} className="relative">
              {module.comingSoon ? (
                <div className="bg-white rounded-xl border border-[#e5e5e5] p-6 opacity-60 cursor-not-allowed">
                  <div
                    className={`w-14 h-14 ${module.color} rounded-xl flex items-center justify-center text-white mb-4`}
                  >
                    {module.icon}
                  </div>
                  <h3 className="text-lg font-medium text-[#5c5c5c] mb-2">{module.title}</h3>
                  <p className="text-sm text-[#8b8b8b] mb-4">{module.description}</p>
                  <div className="flex items-center gap-2 text-sm text-[#8b8b8b]">
                    <Lock className="w-4 h-4" />
                    <span>Prossimamente</span>
                  </div>
                </div>
              ) : (
                <Link href={module.href}>
                  <div className="bg-white rounded-xl border border-[#e5e5e5] p-6 hover:shadow-lg hover:border-[#8b7355] transition-all duration-200 cursor-pointer group">
                    <div
                      className={`w-14 h-14 ${module.color} rounded-xl flex items-center justify-center text-white mb-4 group-hover:scale-110 transition-transform`}
                    >
                      {module.icon}
                    </div>
                    <h3 className="text-lg font-medium text-[#5c5c5c] mb-2 group-hover:text-[#8b7355] transition-colors">
                      {module.title}
                    </h3>
                    <p className="text-sm text-[#8b8b8b]">{module.description}</p>
                  </div>
                </Link>
              )}
            </div>
          ))}
        </div>

        {/* Quick Stats */}
        <div className="mt-12">
          <h3 className="text-lg font-medium text-[#5c5c5c] mb-4">Riepilogo Rapido</h3>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl border border-[#e5e5e5] p-4">
              <p className="text-2xl font-semibold text-[#8b7355]">109</p>
              <p className="text-sm text-[#8b8b8b]">Foto totali</p>
            </div>
            <div className="bg-white rounded-xl border border-[#e5e5e5] p-4">
              <p className="text-2xl font-semibold text-[#8b7355]">8</p>
              <p className="text-sm text-[#8b8b8b]">Categorie camere</p>
            </div>
            <div className="bg-white rounded-xl border border-[#e5e5e5] p-4">
              <p className="text-2xl font-semibold text-[#8b7355]">3</p>
              <p className="text-sm text-[#8b8b8b]">Utenti attivi</p>
            </div>
            <div className="bg-white rounded-xl border border-[#e5e5e5] p-4">
              <p className="text-2xl font-semibold text-[#8b7355]">Online</p>
              <p className="text-sm text-[#8b8b8b]">Stato sito</p>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
