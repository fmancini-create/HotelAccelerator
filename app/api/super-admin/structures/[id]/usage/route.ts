import { type NextRequest, NextResponse } from "next/server"
import { SuperAdminService } from "@/lib/platform-services"
import { handleServiceError } from "@/lib/errors"
import { getAuthenticatedUserEmail } from "@/lib/auth-property"

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const actorEmail = await getAuthenticatedUserEmail(request)
    const service = new SuperAdminService()
    const usage = await service.getStructureUsageStats(id, actorEmail)

    return NextResponse.json({ usage })
  } catch (error) {
    return handleServiceError(error)
  }
}
