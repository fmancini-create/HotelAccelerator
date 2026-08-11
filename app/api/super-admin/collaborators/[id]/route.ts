import { NextResponse } from "next/server"
// Import from index barrel instead of direct file path
import { SuperAdminService } from "@/lib/platform-services"
import { handleServiceError } from "@/lib/errors"
import { getAuthenticatedUserEmail } from "@/lib/auth-property"

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const actorEmail = await getAuthenticatedUserEmail()
    const service = new SuperAdminService()
    const collaborator = await service.getCollaboratorDetails(id, actorEmail)

    return NextResponse.json(collaborator)
  } catch (error) {
    return handleServiceError(error)
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const actorEmail = await getAuthenticatedUserEmail()
    const updates = await request.json()
    const service = new SuperAdminService()
    // `id` per ultimo: il corpo della richiesta non deve poter cambiare quale
    // collaboratore viene modificato.
    const collaborator = await service.updateCollaborator({ ...updates, id }, actorEmail)

    return NextResponse.json(collaborator)
  } catch (error) {
    return handleServiceError(error)
  }
}
