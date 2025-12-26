import { NextResponse } from "next/server"
// Import from index barrel instead of direct file path
import { SuperAdminService } from "@/lib/platform-services"
import { handleServiceError } from "@/lib/errors"
import { getAuthenticatedUserEmail } from "@/lib/auth-property"

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const actorEmail = await getAuthenticatedUserEmail()
    const service = new SuperAdminService()
    const collaborator = await service.getCollaboratorDetails(params.id, actorEmail)

    return NextResponse.json(collaborator)
  } catch (error) {
    return handleServiceError(error)
  }
}

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  try {
    const actorEmail = await getAuthenticatedUserEmail()
    const updates = await request.json()
    const service = new SuperAdminService()
    const collaborator = await service.updateCollaborator({ id: params.id, ...updates }, actorEmail)

    return NextResponse.json(collaborator)
  } catch (error) {
    return handleServiceError(error)
  }
}
