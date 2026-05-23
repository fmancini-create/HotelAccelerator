import type React from "react"
import Link from "next/link"
import { Calendar, Globe, Radio } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { AdminHeader } from "@/components/admin/admin-header"

interface TrackingModule {
  id: string
  title: string
  description: string
  icon: React.ReactNode
  href: string
  iconBg: string
}

const modules: TrackingModule[] = [
  {
    id: "visitors",
    title: "Visitatori Live",
    description:
      "Sessioni in tempo reale, timeline degli eventi e stitching automatico al CRM quando il visitatore si identifica.",
    icon: <Radio className="h-6 w-6" />,
    href: "/admin/tracking/visitors",
    iconBg: "bg-blue-600",
  },
  {
    id: "sites",
    title: "Siti Tracking",
    description:
      "Gestisci write key e domini autorizzati per tenant. Snippet pronto da incollare su siti esterni; injection automatica sui siti CMS.",
    icon: <Globe className="h-6 w-6" />,
    href: "/admin/tracking/sites",
    iconBg: "bg-sky-600",
  },
  {
    id: "demand",
    title: "Calendario Domanda",
    description:
      "Aggregazione delle date piu' cercate dai visitatori: signal di pricing per intervalli specifici.",
    icon: <Calendar className="h-6 w-6" />,
    href: "/admin/tracking/demand",
    iconBg: "bg-amber-500",
  },
]

export default function TrackingHubPage() {
  return (
    <>
      <AdminHeader
        title="Tracking"
        subtitle="Sistema script-first per acquisire eventi, sessioni e segnali di domanda"
        backHref="/admin/dashboard"
        backLabel="Dashboard"
      />

      <div className="container py-6">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {modules.map((m) => (
            <Link key={m.id} href={m.href} className="group">
              <Card className="h-full transition-shadow hover:shadow-md">
                <CardHeader>
                  <div
                    className={`${m.iconBg} text-white inline-flex h-12 w-12 items-center justify-center rounded-lg`}
                  >
                    {m.icon}
                  </div>
                  <CardTitle className="mt-4 text-lg">{m.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription className="leading-relaxed">{m.description}</CardDescription>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </>
  )
}
