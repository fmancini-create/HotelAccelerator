import { getSettingsData } from "@/lib/settings/get-settings-data"
import { AppLayout } from "@/components/layout/app-layout"

export const dynamic = "force-dynamic"
export const revalidate = 0

export default async function AcceleratorLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const data = await getSettingsData()

  const layoutData = data.redirect ? {
    profile: null,
    organization: null,
    hotels: [],
    selectedHotel: null,
    isSuperAdmin: false,
  } : data
  
  return (
    <AppLayout initialData={layoutData}>
      {children}
    </AppLayout>
  )
}
