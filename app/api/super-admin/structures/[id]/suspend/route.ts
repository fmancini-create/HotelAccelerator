import { type NextRequest, NextResponse } from "next/server"
import { SuperAdminService } from "@/lib/platform-services"
import { handleServiceError } from "@/lib/errors"
import { getAuthenticatedUserEmail } from "@/lib/auth-property"

// Client calls this with POST (see structure detail page handleStatusChange).
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const actorEmail = await getAuthenticatedUserEmail(request)
    const service = new SuperAdminService()
    const structure = await service.suspendStructure(id, actorEmail)

    return NextResponse.json(structure)
  } catch (error) {
    return handleServiceError(error)
  }
}
