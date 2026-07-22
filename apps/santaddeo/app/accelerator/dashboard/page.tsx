import { redirect } from "next/navigation"
import { cookies } from "next/headers"
import { AcceleratorDashboard } from "@/components/accelerator/dashboard"
import { AppFooter } from "@/components/layout/app-footer"

export const dynamic = "force-dynamic"

async function getAcceleratorData() {
  const cookieStore = await cookies()
  const allCookies = cookieStore.getAll()
  const cookieHeader = allCookies.map((c) => `${c.name}=${c.value}`).join("; ")

  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  const baseUrl = appUrl
    ? appUrl.startsWith("http") ? appUrl : `https://${appUrl}`
    : process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000"

  const res = await fetch(`${baseUrl}/api/ui/accelerator/dashboard`, {
    headers: { Cookie: cookieHeader },
    cache: "no-store",
  })

  return res.json()
}

export default async function AcceleratorDashboardPage() {
  const data = await getAcceleratorData()

  if (data.redirect) {
    redirect(data.redirect)
  }

  return (
    <div className="flex min-h-screen flex-col">
      <div className="flex-1">
        <AcceleratorDashboard subscriptions={data.subscriptions} />
      </div>
      <AppFooter />
    </div>
  )
}
