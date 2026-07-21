import { redirect } from "next/navigation"
import { cookies } from "next/headers"
import { TeamManager } from "@/components/team/team-manager"

export const dynamic = "force-dynamic"

async function getTeamData() {
  const cookieStore = await cookies()
  const allCookies = cookieStore.getAll()
  const cookieHeader = allCookies.map((c) => `${c.name}=${c.value}`).join("; ")

  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  const baseUrl = appUrl
    ? appUrl.startsWith("http") ? appUrl : `https://${appUrl}`
    : process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000"

  const res = await fetch(`${baseUrl}/api/ui/team`, {
    headers: { Cookie: cookieHeader },
    cache: "no-store",
  })

  return res.json()
}

export default async function TeamPage() {
  const data = await getTeamData()

  if (data.redirect) {
    redirect(data.redirect)
  }

  return (
    <div className="container mx-auto py-8">
      <TeamManager
        organizationId={data.profile.organization_id}
        currentUserRole={data.profile.role}
        teamMembers={data.teamMembers}
        onRefresh={() => {}}
      />
    </div>
  )
}
