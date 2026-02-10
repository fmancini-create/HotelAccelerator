import { NextResponse } from "next/server"
import { SuperAdminService } from "@/lib/platform-services"
import { handleServiceError } from "@/lib/errors"
import { getAuthenticatedUserEmail } from "@/lib/auth-property"

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    if (!id || id === "undefined") {
      return NextResponse.json({ error: "ID struttura mancante" }, { status: 400 })
    }
    const actorEmail = await getAuthenticatedUserEmail()
    const service = new SuperAdminService()
    const usage = await service.getStructureUsageStats(id, actorEmail)

    return NextResponse.json({ usage })
  } catch (error) {
    const { status, json } = handleServiceError(error)
    return NextResponse.json(json, { status })
  }
}
