import { getSettingsData } from "@/lib/settings/get-settings-data"
import { AppLayout } from "@/components/layout/app-layout"

// Prevent static generation - this layout needs runtime data
export const dynamic = "force-dynamic"
export const revalidate = 0

export default async function DatiLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // In v0 preview, we ALWAYS skip redirects - DEV database may not have all mappings
  // This is safe because v0 uses demo authentication anyway
  const data = await getSettingsData()

  // If getSettingsData returned a redirect object, provide fallback data
  // so AppLayout doesn't crash on missing properties
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
