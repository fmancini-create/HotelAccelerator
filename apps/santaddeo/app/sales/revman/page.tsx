import Link from "next/link"
import { redirect } from "next/navigation"
import { getAuthUserOrDev } from "@/lib/auth/getAuthUserOrDev"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { getSellerRevmanHotels } from "@/lib/sales/revman-access"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Eye } from "lucide-react"

export const dynamic = "force-dynamic"

export default async function SalesRevmanIndexPage() {
  const { user } = await getAuthUserOrDev()
  if (!user) redirect("/auth/login")

  const supabase = await createServiceRoleClient()
  // Unione grant espliciti + strutture associate (vedi lib/sales/revman-access).
  const access = await getSellerRevmanHotels(supabase, user.id)

  const hotels = access.map((h) => ({
    id: h.hotel_id,
    name: h.hotel_name,
    granted_at: h.granted_at,
  }))

  return (
    <div className="container mx-auto max-w-5xl px-6 py-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Area Revenue Manager</h1>
        <p className="text-sm text-muted-foreground">
          Hotel a cui hai accesso in sola lettura. Puoi consultare note,
          attivit&agrave; e file condivisi tra l&apos;hotel e il revenue
          manager.
        </p>
      </div>

      {hotels.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-sm text-muted-foreground">
            Non hai ancora accesso a nessuna Area Revenue Manager. Il
            SuperAdmin pu&ograve; concederti l&apos;accesso a singoli
            hotel.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {hotels.map((h) => (
            <Link key={h.id} href={`/sales/revman/${h.id}`}>
              <Card className="hover:border-primary transition-colors h-full">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Eye className="h-4 w-4 text-muted-foreground" />
                    {h.name}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground">
                    {h.granted_at
                      ? `Accesso dal ${new Date(h.granted_at).toLocaleDateString("it-IT")}`
                      : "Struttura associata"}
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
