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
        assets: [
          { id: "asset-1", name: "Caldaia centrale", location: "Piano interrato" },
          { id: "asset-2", name: "Ascensore principale", location: "Corpo A" },
          { id: "asset-3", name: "Impianto climatizzazione", location: "Tetto" },
          { id: "asset-4", name: "Piscina", location: "Piano terra - Esterno" },
          { id: "asset-5", name: "Generatore emergenza", location: "Piano interrato" },
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
      return NextResponse.json({ assets: [], error: "Manubot non configurato" })
    }

    const assets = await client.getAssets()
    return NextResponse.json({ assets })
  } catch (error: any) {
    return NextResponse.json({ error: error.message, assets: [] }, { status: 500 })
  }
}
