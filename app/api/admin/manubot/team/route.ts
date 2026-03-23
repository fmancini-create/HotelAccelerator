import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"
import { getManubotClient } from "@/lib/manubot"

function isDevMode(request: NextRequest): boolean {
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || ""
  return host.includes("vusercontent.net") || host.includes("vercel.run") || host.includes("localhost")
}

export async function GET(request: NextRequest) {
  try {
    if (isDevMode(request)) {
      return NextResponse.json({
        team: [
          { id: "tech-1", full_name: "Marco Ferretti", email: "marco@manubot.it", role: "maintainer" },
          { id: "tech-2", full_name: "Sara Bianchi", email: "sara@manubot.it", role: "maintainer" },
          { id: "tech-3", full_name: "Luca Ricci", email: "luca@manubot.it", role: "maintainer" },
        ],
      })
    }

    const propertyId = await getAuthenticatedPropertyId(request)
    const supabase = await createClient()

    const { data: property } = await supabase
      .from("properties")
      .select("manubot_email, manubot_password, manubot_supabase_url")
      .eq("id", propertyId)
      .single()

    const client = property ? await getManubotClient(property) : null
    if (!client) {
      return NextResponse.json({ team: [], error: "Manubot non configurato" })
    }

    const team = await client.getTeam()
    return NextResponse.json({ team })
  } catch (error: any) {
    return NextResponse.json({ error: error.message, team: [] }, { status: 500 })
  }
}
