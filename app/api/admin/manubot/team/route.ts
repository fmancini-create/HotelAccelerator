import { type NextRequest, NextResponse } from "next/server"
import { getManubotClient } from "@/lib/manubot"

export async function GET(_request: NextRequest) {
  try {
    const client = await getManubotClient({})
    const team = await client.getTeam()
    return NextResponse.json({ team })
  } catch (error: any) {
    return NextResponse.json({ error: error.message, team: [] }, { status: 500 })
  }
}
