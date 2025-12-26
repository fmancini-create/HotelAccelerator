import { NextResponse } from "next/server"
import { SuperAdminService } from "@/lib/platform-services"
import { handleServiceError } from "@/lib/errors"
import { getAuthenticatedUserEmail } from "@/lib/auth-property"

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const actorEmail = await getAuthenticatedUserEmail()
    const service = new SuperAdminService()
    const activity = await service.getCollaboratorActivity(params.id, actorEmail)

    return NextResponse.json(activity)
  } catch (error) {
    return handleServiceError(error)
  }
}
