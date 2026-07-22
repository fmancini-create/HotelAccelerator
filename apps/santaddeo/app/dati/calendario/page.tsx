import { redirect } from "next/navigation"
import { cookies } from "next/headers"
import { createClient, createServiceRoleClient } from "@/lib/supabase/server"
import { isDevAuthAsync } from "@/lib/env/dev-auth"
import { BookingActivityCalendar } from "@/components/calendario/booking-activity-calendar"
import { ImpersonationBanner } from "@/components/superadmin/impersonation-banner"
import { PageHeader } from "@/components/layout/page-header"

export const dynamic = "force-dynamic"

export const metadata = {
  title: "Calendario Prenotazioni | Santaddeo",
  description: "Calendario annuale con attivita prenotazioni, cancellazioni e date ferme",
}

export default async function CalendarioPrenotazioniPage({
  searchParams,
}: {
  searchParams: Promise<{ hotel?: string }>
}) {
  const sp = await searchParams
  const queryHotelId = sp?.hotel || null
  const isV0Preview = await isDevAuthAsync()
  // FIX 30/05/2026: in preview (v0 chat / localhost) non esiste una sessione
  // Supabase autenticata, quindi il client anon (createClient) viene bloccato
  // da RLS sulla tabella `hotels` e restituisce 0 righe -> selectedHotel null
  // -> redirect("/dashboard"): la pagina calendario non si apriva. Stesso
  // pattern del dashboard (dashboard-content.tsx): usa il service role client
  // in preview per bypassare RLS, il client normale in produzione.
  const supabase = isV0Preview ? await createServiceRoleClient() : await createClient()

  // Build profile/auth context
  let profile: any = null
  let isSuperAdmin = false
  let impersonatedHotelId: string | null = null
  let isImpersonating = false

  if (isV0Preview) {
    profile = {
      id: "5de43b7b-e661-4e4e-8177-7943df06470c",
      email: "f.mancini@4bid.it",
      first_name: "Filippo",
      last_name: "Mancini",
      role: "super_admin",
    }
    isSuperAdmin = true
    const cookieStore = await cookies()
    impersonatedHotelId = cookieStore.get("impersonated_hotel_id")?.value || null
    isImpersonating = !!impersonatedHotelId
  } else {
    // In production, fetch from /api/ui/me
    const cookieStore = await cookies()
    const allCookies = cookieStore.getAll()
    const cookieHeader = allCookies.map((c) => `${c.name}=${c.value}`).join("; ")

    const appUrl = process.env.NEXT_PUBLIC_APP_URL
    const baseUrl = appUrl
      ? appUrl.startsWith("http") ? appUrl : `https://${appUrl}`
      : process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : "http://localhost:3000"

    try {
      const res = await fetch(`${baseUrl}/api/ui/me`, {
        headers: { Cookie: cookieHeader },
        cache: "no-store",
      })
      const contentType = res.headers.get("content-type") || ""
      if (!contentType.includes("application/json") || !res.ok) {
        redirect("/auth/login")
      }
      const data = await res.json()
      if (!data.profile) redirect("/auth/login")
      profile = data.profile
      isSuperAdmin = data.isSuperAdmin
      impersonatedHotelId = data.impersonatedHotelId
      isImpersonating = data.isImpersonating
    } catch {
      redirect("/auth/login")
    }
  }

  let selectedHotel = null

  // FIX 21/05/2026 — risoluzione hotel allineata a /api/ui/selected-hotel.
  // Priorita': ?hotel= (super-admin) > cookie impersonated_hotel_id > primo
  // hotel della propria org. Prima questa pagina ignorava il searchParam
  // (cambiato dal tenant switcher) e l'impersonation, prendendo sempre
  // hotelsData[0] = il piu' vecchio (Barronci), quindi il calendario di
  // Cavallino mostrava i dati di Barronci.
  const requestedHotelId = queryHotelId || impersonatedHotelId

  if (requestedHotelId) {
    let q = supabase.from("hotels").select("*").eq("id", requestedHotelId)
    if (!isSuperAdmin && profile?.organization_id) {
      q = q.eq("organization_id", profile.organization_id)
    }
    const { data: hotelData } = await q.maybeSingle()
    if (hotelData) selectedHotel = hotelData
  }

  if (!selectedHotel) {
    if (isSuperAdmin) {
      const { data: hotelsData } = await supabase.from("hotels").select("*").order("created_at", { ascending: true })
      selectedHotel = hotelsData && hotelsData.length > 0 ? hotelsData[0] : null
    } else if (profile?.organization_id) {
      const { data: hotelsData } = await supabase
        .from("hotels")
        .select("*")
        .eq("organization_id", profile.organization_id)
        .order("created_at", { ascending: true })
      selectedHotel = hotelsData && hotelsData.length > 0 ? hotelsData[0] : null
    }
  }

  if (!selectedHotel) {
    redirect("/dashboard")
  }

  let organizationName = null
  if (isImpersonating && selectedHotel?.organization_id) {
    organizationName = null
  }

  return (
    <div className="min-h-screen bg-background">
      <PageHeader
        title="Calendario Prenotazioni"
        description="Attivita prenotazioni per data di soggiorno: prenotazioni, cancellazioni e date ferme"
      />

      {isImpersonating && selectedHotel && (
        <ImpersonationBanner hotelName={selectedHotel.name} organizationName={organizationName} />
      )}

      <main className="p-6">
        <div className="mx-auto max-w-[1600px]">
          <BookingActivityCalendar hotelId={selectedHotel.id} />
        </div>
      </main>
    </div>
  )
}
