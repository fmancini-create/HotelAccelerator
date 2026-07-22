import { redirect } from "next/navigation"
import { getSettingsData } from "@/lib/settings/get-settings-data"
import { AppLayout } from "@/components/layout/app-layout"

export const dynamic = "force-dynamic"
export const revalidate = 0

export default async function UpgradeLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const data = await getSettingsData()

  // Handle redirect cases
  if (data.redirect) {
    redirect(data.redirect)
  }

  // Ensure all required fields are present
  const layoutData = {
    profile: data.profile || null,
    organization: data.organization || null,
    hotels: data.hotels || [],
    selectedHotel: data.selectedHotel || null,
    isSuperAdmin: data.isSuperAdmin || false,
    isDeveloper: data.isDeveloper || false,
    isImpersonating: data.isImpersonating || false,
    pmsIntegration: data.pmsIntegration || null,
    subscription: data.subscription || null,
    roomTypes: data.roomTypes || [],
    hasMappings: data.hasMappings || false,
    allHotels: data.allHotels || data.hotels || [],
  }
  
  return (
    <AppLayout initialData={layoutData}>
      {children}
    </AppLayout>
  )
}
