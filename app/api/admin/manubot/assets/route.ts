import { type NextRequest, NextResponse } from "next/server"
import { getManubotClient } from "@/lib/manubot"

export async function GET(_request: NextRequest) {
  try {
    const client = await getManubotClient({})
    const assets = await client.getAssets()
    return NextResponse.json({ assets })
  } catch (error: any) {
    return NextResponse.json({ error: error.message, assets: [] }, { status: 500 })
  }
}
