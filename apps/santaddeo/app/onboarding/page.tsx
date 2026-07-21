import { redirect } from "next/navigation"
import { cookies } from "next/headers"
import { OnboardingForm } from "@/components/onboarding/onboarding-form"
import { safeFetch } from "@/lib/utils/safe-fetch"

export const dynamic = "force-dynamic"

async function getOnboardingData() {
  const cookieStore = await cookies()
  const allCookies = cookieStore.getAll()
  const cookieHeader = allCookies.map((c) => `${c.name}=${c.value}`).join("; ")

  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  const baseUrl = appUrl
    ? appUrl.startsWith("http") ? appUrl : `https://${appUrl}`
    : process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000"

  const { data, error } = await safeFetch<any>(`${baseUrl}/api/ui/onboarding`, {
    headers: { Cookie: cookieHeader },
    cache: "no-store",
  })

  if (error || !data) {
    return { redirect: "/auth/login" }
  }
  return data
}

export default async function OnboardingPage() {
  const data = await getOnboardingData()

  if (data.redirect) {
    redirect(data.redirect)
  }

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-gradient-to-br from-blue-50 via-white to-blue-50 p-6">
      <div className="w-full max-w-2xl">
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-bold text-blue-900">SANTADDEO</h1>
          <p className="mt-2 text-muted-foreground">Configura la tua struttura</p>
        </div>

        <OnboardingForm user={data.user} profile={data.profile} />
      </div>
    </div>
  )
}
