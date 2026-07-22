import { notFound, redirect } from "next/navigation"
import Link from "next/link"
import { getAuthUserOrDev } from "@/lib/auth/getAuthUserOrDev"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { sellerHasRevmanAccess, getSellerHotelPermissions } from "@/lib/sales/revman-access"
import { RevmanArea } from "@/components/revman/revman-area"
import { Button } from "@/components/ui/button"
import { ArrowLeft, Eye } from "lucide-react"

export const dynamic = "force-dynamic"

export default async function SalesRevmanHotelPage({
  params,
}: {
  params: Promise<{ hotelId: string }>
}) {
  const { hotelId } = await params
  const { user } = await getAuthUserOrDev()
  if (!user) redirect("/auth/login")

  const supabase = await createServiceRoleClient()

  // Il venditore deve avere accesso: grant esplicito OPPURE struttura associata
  // (vedi lib/sales/revman-access).
  const hasAccess = await sellerHasRevmanAccess(supabase, user.id, hotelId)
  if (!hasAccess) notFound()

  // Permessi dati per-struttura (Metriche / Dashboard completa). Flag per-hotel
  // in OR sul flag globale dell'agente (vedi getSellerHotelPermissions).
  const perms = await getSellerHotelPermissions(supabase, user.id, hotelId)
  const canViewMetrics = perms?.view_metrics ?? false
  const canViewFullDashboard = perms?.view_full_dashboard ?? false

  const { data: hotel } = await supabase
    .from("hotels").select("id, name").eq("id", hotelId).maybeSingle()
  if (!hotel) notFound()

  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/sales/revman">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Indietro
          </Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-semibold">Area Revenue Manager</h1>
          <p className="text-sm text-muted-foreground">{hotel.name}</p>
        </div>
        <span className="inline-flex items-center gap-1 text-xs rounded-md bg-muted px-2 py-1 text-muted-foreground">
          <Eye className="h-3 w-3" />
          Sola lettura
        </span>
      </div>
      <RevmanArea
        hotelId={hotel.id}
        isStaff={false}
        readOnly
        canViewMetrics={canViewMetrics}
        canViewFullDashboard={canViewFullDashboard}
      />
    </div>
  )
}
