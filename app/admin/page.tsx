import { redirect } from "next/navigation"
import { headers } from "next/headers"
import AdminLoginClient from "@/components/admin-login-client"

export default async function AdminPage() {
  // Check if we're in dev/preview environment
  const headersList = await headers()
  const host = headersList.get("x-forwarded-host") || headersList.get("host") || ""
  
  const isDevOrPreview = host.includes("vercel.run") || 
                         host.includes("localhost") || 
                         host.includes("127.0.0.1")

  // In dev/preview, bypass auth and go directly to users page
  if (isDevOrPreview) {
    console.log("[v0] DEV/PREVIEW MODE (/admin): Auto-redirecting to /admin/users, host:", host)
    redirect("/admin/users")
  }

  // In production, show login
  return <AdminLoginClient />
}

