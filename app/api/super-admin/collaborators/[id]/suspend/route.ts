import { NextResponse } from "next/server"
import { SuperAdminService } from "@/lib/platform-services"
import { handleServiceError } from "@/lib/errors"
import { getAuthenticatedUserEmail } from "@/lib/auth-property"

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const actorEmail = await getAuthenticatedUserEmail(request as any)
    const service = new SuperAdminService()
    const collaborator = await service.getCollaboratorDetails(id, actorEmail)

    if (collaborator.email.toLowerCase() === actorEmail.toLowerCase()) {
      return NextResponse.json({ error: "Non puoi sospendere il tuo accesso SuperAdmin" }, { status: 409 })
    }

    await service.suspendCollaborator(id, actorEmail)
    return NextResponse.json({ success: true })
  } catch (error) {
    return handleServiceError(error)
  }
}
