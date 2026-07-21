import { redirect } from "next/navigation"
import { getAuthUserOrDev } from "@/lib/auth/getAuthUserOrDev"
import { DashboardLabClient } from "./dashboard-lab-client"

export const dynamic = "force-dynamic"
export const metadata = { title: "Dashboard Lab - SuperAdmin" }

export default async function DashboardLabPage() {
  const { user, supabase } = await getAuthUserOrDev()
  if (!user) redirect("/auth/login")

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle()
  if (profile?.role !== "super_admin") {
    redirect("/dashboard")
  }

  return <DashboardLabClient />
}
