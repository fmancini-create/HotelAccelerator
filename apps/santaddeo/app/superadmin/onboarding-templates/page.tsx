import { redirect } from "next/navigation"
import { isDevAuthAsync } from "@/lib/env/dev-auth"
import { createClient } from "@/lib/supabase/server"
import { OnboardingTemplatesManager } from "@/components/superadmin/onboarding-templates-manager"
import { SuperAdminHeader } from "@/components/superadmin/superadmin-header"

export const dynamic = "force-dynamic"

export default async function OnboardingTemplatesPage() {
  const isDev = await isDevAuthAsync()
  if (!isDev) {
    const sb = await createClient()
    const { data: { user } } = await sb.auth.getUser()
    if (!user) redirect("/auth/login")
    const { data: profile } = await sb.from("profiles").select("role").eq("id", user.id).single()
    if (!profile || (profile.role !== "super_admin" && profile.role !== "superadmin")) {
      redirect("/dashboard")
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <SuperAdminHeader />
      <main className="container mx-auto px-6 py-8">
        <OnboardingTemplatesManager />
      </main>
    </div>
  )
}
