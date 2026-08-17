"use client"

import { useRouter } from "next/navigation"
import { AdminHeader } from "@/components/admin/admin-header"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useAdminAuth } from "@/lib/admin-hooks"
import {
  Globe,
  Users,
  Radio,
  Lock,
  Boxes,
  BarChart3,
  FileText,
  Activity,
  ChevronRight,
  Scale,
  KeyRound,
} from "lucide-react"

interface SettingsItem {
  id: string
  title: string
  description: string
  icon: React.ReactNode
  href: string
  color: string
  requiresPermission?: "can_manage_users"
  superAdminOnly?: boolean
  adminOnly?: boolean
}

const settingsItems: SettingsItem[] = [
  {
    id: "site-legal",
    title: "Dati legali e policy",
    description: "Footer societario, Privacy Policy, Cookie Policy e White Label",
    icon: <Scale className="w-6 h-6" />,
    href: "/admin/settings/site-legal",
    color: "bg-stone-700",
    adminOnly: true,
  },
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
    id: "api-access",
    title: "Accesso API",
    description: "Token con cui un sistema esterno legge i dati della struttura",
    icon: <KeyRound className="w-6 h-6" />,
    href: "/admin/settings/api-access",
    color: "bg-amber-600",
    // Solo amministratori: il token vale come una password verso i dati della
    // struttura, e la rotta applica lo stesso presidio lato server.
    adminOnly: true,
  },
  {
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
    title: "CMS AI-first",
    description: "Crea il sito con template, chat guidata e gestione pagine",
    icon: <FileText className="w-6 h-6" />,
    href: "/admin/cms/studio",
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
      <div className="min-h-full bg-background flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Caricamento...</div>
      </div>
    )
  }

  const isSuperAdmin = adminUser?.role === "super_admin"
  const isAdmin = isSuperAdmin || adminUser?.role === "admin"

  const visibleItems = settingsItems.filter((item) => {
    if (item.superAdminOnly && !isSuperAdmin) return false
    if (item.adminOnly && !isAdmin) return false
    if (item.requiresPermission && !adminUser?.[item.requiresPermission] && !isSuperAdmin) return false
    return true
  })

  return (
    <div className="min-h-full bg-muted/40">
      {/*
       * The page used to print its own title below the header. Now that
       * AdminHeader renders `title`, the local block would show "Impostazioni"
       * twice, so the richer description moves up into the header.
       */}
      <AdminHeader
        title="Impostazioni"
        subtitle="Gestisci la configurazione della tua struttura: domini, canali, utenti e moduli."
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {visibleItems.map((item) => (
            <button key={item.id} onClick={() => router.push(item.href)} className="text-left">
              <Card className="h-full transition-all hover:shadow-md hover:border-ha-brand/40">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className={`${item.color} text-white rounded-lg p-2.5 flex items-center justify-center`}>
                      {item.icon}
                    </div>
                    <ChevronRight className="w-5 h-5 text-muted-foreground" />
                  </div>
                </CardHeader>
                <CardContent>
                  <CardTitle className="text-base text-foreground">{item.title}</CardTitle>
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
