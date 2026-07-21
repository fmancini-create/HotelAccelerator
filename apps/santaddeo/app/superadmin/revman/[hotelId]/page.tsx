import { notFound } from "next/navigation"
import Link from "next/link"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { RevmanArea } from "@/components/revman/revman-area"
import { RevmanSalesAccessManager } from "@/components/revman/revman-sales-access-manager"
import { Button } from "@/components/ui/button"
import { ArrowLeft } from "lucide-react"

export const dynamic = "force-dynamic"

export default async function SuperAdminRevmanPage({
  params,
}: {
  params: Promise<{ hotelId: string }>
}) {
  const { hotelId } = await params
  const supabase = await createServiceRoleClient()
  const { data: hotel } = await supabase
    .from("hotels").select("id, name").eq("id", hotelId).maybeSingle()
  if (!hotel) notFound()

  return (
    <div className="container mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/superadmin?tab=subscriptions">
            <ArrowLeft className="h-4 w-4 mr-1" />
            Indietro
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-semibold">Area Revenue Manager</h1>
          <p className="text-sm text-muted-foreground">{hotel.name}</p>
        </div>
      </div>
      <RevmanSalesAccessManager hotelId={hotel.id} />
      <RevmanArea hotelId={hotel.id} isStaff />
    </div>
  )
}
