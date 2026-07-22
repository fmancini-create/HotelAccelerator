import { redirect } from "next/navigation"
import { getSettingsData } from "@/lib/settings/get-settings-data"
import { NotificationSettings } from "@/components/settings/notification-settings"
import { TabsContent } from "@/components/ui/tabs"

export const dynamic = "force-dynamic"

export default async function NotificationsSettingsPage() {
  const data = await getSettingsData()

  if (data.redirect) {
    redirect(data.redirect)
  }

  if (!data.selectedHotel) {
    redirect("/onboarding")
  }

  return (
    <TabsContent value="notifications" className="space-y-6">
      <NotificationSettings
        hotelId={data.selectedHotel.id}
        roomTypes={data.roomTypes || []}
      />
    </TabsContent>
  )
}
