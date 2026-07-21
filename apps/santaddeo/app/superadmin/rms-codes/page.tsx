import { createClient } from "@/lib/supabase/server"
import { isDevAuthAsync } from "@/lib/env/dev-auth"
import { redirect } from "next/navigation"
import { RmsCodesViewer } from "@/components/superadmin/rms-codes-viewer"
import { BackNavigation } from "@/components/superadmin/back-navigation"
import { SuperAdminHeader } from "@/components/superadmin/superadmin-header"
import { AppFooter } from "@/components/layout/app-footer"

export const metadata = {
  title: "Codici RMS | SANTADDEO SuperAdmin",
  description: "Gestione codici RMS canonici della piattaforma SANTADDEO",
}

export default async function RmsCodesPage() {
  const isV0Preview = await isDevAuthAsync()
  
  if (!isV0Preview) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect("/login")
  }

  return (
    <div className="min-h-screen bg-background">
      <SuperAdminHeader />
      <BackNavigation />
      <RmsCodesViewer />
      <AppFooter />
    </div>
  )
}
