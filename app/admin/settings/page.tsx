"use client"

import { useRouter } from "next/navigation"
import { AdminHeader } from "@/components/admin/admin-header"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useAdminAuth } from "@/lib/admin-hooks"
import { Globe, Users, Radio, Lock, Boxes, BarChart3, FileText, Activity, ChevronRight } from "lucide-react"

interface SettingsItem {
  id: string
  title: string
  description: string
  icon: React.ReactNode
  href: string
  color: string
  /** Only show if the admin has this permission */
  requiresPermission?: "can_manage_users"
  /** Only show to super admins */
  superAdminOnly?: boolean
  /** Only show to tenant admins / super admins (hidden from regular members) */
  adminOnly?: boolean
}

const settingsItems: SettingsItem[] = [
  {
    id: "domains",
    title: "Domini",
    description: "Configura sottodominio e dominio personalizzato della struttura",
    icon: <Globe className="w-6 h-6" />,
    href: "/admin/settings/domains",
    color: "bg-teal-500",
    adminOnly: true,
  },
  {
    // Visible to everyone: a member uses this to connect/configure THEIR own
    // mailbox. Admin-only channel config is gated on the channel pages.
    id: "channels",
    title: "Canali",
    description: "Email, WhatsApp, Telegram, Chat e Telefono IP",
    icon: <Radio className="w-6 h-6" />,
    href: "/admin/channels",
    color: "bg-blue-500",
  },
  {
    id: "modules",
    title: "Moduli",
    description: "Attiva e gestisci i moduli della piattaforma",
    icon: <Boxes className="w-6 h-6" />,
    href: "/admin/modules",
    color: "bg-indigo-500",
    adminOnly: true,
  },
  {
    id: "users",
    title: "Gestione Utenti",
    description: "Aggiungi e gestisci gli utenti e i loro permessi",
    icon: <Users className="w-6 h-6" />,
    href: "/admin/users",
    color: "bg-purple-500",
    requiresPermission: "can_manage_users",
    adminOnly: true,
  },
  {
    id: "tracking",
    title: "Tracking & Siti",
    description: "Chiavi script-first, domini autorizzati ed eventi",
    icon: <BarChart3 className="w-6 h-6" />,
    href: "/admin/tracking",
    color: "bg-sky-600",
    adminOnly: true,
  },
  {
    id: "cms",
    title: "Contenuti CMS",
    description: "Gestisci pagine, blocchi e SEO del sito",
    icon: <FileText className="w-6 h-6" />,
    href: "/admin/cms",
    color: "bg-green-500",
    adminOnly: true,
  },
  {
    id: "billing",
    title: "Abbonamento & Fatturazione",
    description: "Piano, quote e gestione della sottoscrizione",
    icon: <Activity className="w-6 h-6" />,
    href: "/admin/billing",
    color: "bg-amber-500",
    adminOnly: true,
  },
  {
    // Visible to everyone: change own password and view own permissions.
    id: "profile",
    title: "Il Mio Profilo",
    description: "Modifica la tua password e visualizza i permessi",
    icon: <Lock className="w-6 h-6" />,
    href: "/admin/profile",
    color: "bg-gray-500",
  },
]

export default function AdminSettingsPage() {
  const router = useRouter()
  const { isLoading, adminUser } = useAdminAuth()

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Caricamento...</div>
      </div>
    )
  }

  const isSuperAdmin = adminUser?.role === "super_admin"
  // A tenant admin has role "admin"; regular members are "editor".
  const isAdmin = isSuperAdmin || adminUser?.role === "admin"

  const visibleItems = settingsItems.filter((item) => {
    if (item.superAdminOnly && !isSuperAdmin) return false
    if (item.adminOnly && !isAdmin) return false
    if (item.requiresPermission && !adminUser?.[item.requiresPermission] && !isSuperAdmin) return false
    return true
  })

  return (
    <div className="min-h-screen bg-[#fafafa]">
      <AdminHeader title="Impostazioni" subtitle="Configurazione della struttura" />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-[#1a1a1a]">Impostazioni</h1>
          <p className="text-sm text-[#8b8b8b] mt-1">
            Gestisci la configurazione della tua struttura: domini, canali, utenti e moduli.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {visibleItems.map((item) => (
            <button key={item.id} onClick={() => router.push(item.href)} className="text-left">
              <Card className="h-full transition-all hover:shadow-md hover:border-[#8b7355]/40">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className={`${item.color} text-white rounded-lg p-2.5 flex items-center justify-center`}>
                      {item.icon}
                    </div>
                    <ChevronRight className="w-5 h-5 text-[#c0c0c0]" />
                  </div>
                </CardHeader>
                <CardContent>
                  <CardTitle className="text-base text-[#1a1a1a]">{item.title}</CardTitle>
                  <CardDescription className="mt-1.5 text-sm leading-relaxed">{item.description}</CardDescription>
                </CardContent>
              </Card>
            </button>
          ))}
        </div>
      </main>
    </div>
  )
}
