import { NextResponse } from "next/server"
import { SuperAdminService } from "@/lib/platform-services"
import { handleServiceError } from "@/lib/errors"
import { getAuthenticatedUserEmail } from "@/lib/auth-property"

export async function GET(request: Request) {
  try {
    const actorEmail = await getAuthenticatedUserEmail()
    const service = new SuperAdminService()
    const collaborators = await service.listCollaborators(actorEmail)

    return NextResponse.json(collaborators)
  } catch (error) {
    return handleServiceError(error)
  }
}

export async function POST(request: Request) {
  try {
    const actorEmail = await getAuthenticatedUserEmail()
    const data = await request.json()
    const service = new SuperAdminService()
    const collaborator = await service.createCollaborator(data, actorEmail)

    return NextResponse.json(collaborator, { status: 201 })
  } catch (error) {
    return handleServiceError(error)
  }
}
