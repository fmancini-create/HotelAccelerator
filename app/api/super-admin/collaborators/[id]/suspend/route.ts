import { NextResponse } from "next/server"
import { SuperAdminService } from "@/lib/platform-services"
import { handleServiceError } from "@/lib/errors"
import { getAuthenticatedUserEmail } from "@/lib/auth-property"

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const actorEmail = await getAuthenticatedUserEmail()
    const service = new SuperAdminService()
    await service.suspendCollaborator(params.id, actorEmail)

    return NextResponse.json({ success: true })
  } catch (error) {
    return handleServiceError(error)
  }
}
