import { NextResponse } from "next/server"
import { SuperAdminService } from "@/lib/platform-services"
import { handleServiceError } from "@/lib/errors"
import { getAuthenticatedUserEmail } from "@/lib/auth-property"

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    if (!id || id === "undefined") {
      return NextResponse.json({ error: "ID collaboratore mancante" }, { status: 400 })
    }
    const actorEmail = await getAuthenticatedUserEmail()
    const service = new SuperAdminService()
    const collaborator = await service.getCollaboratorDetails(id, actorEmail)

    return NextResponse.json(collaborator)
  } catch (error) {
    const { status, json } = handleServiceError(error)
    return NextResponse.json(json, { status })
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    if (!id || id === "undefined") {
      return NextResponse.json({ error: "ID collaboratore mancante" }, { status: 400 })
    }
    const actorEmail = await getAuthenticatedUserEmail()
    const updates = await request.json()
    const service = new SuperAdminService()
    const collaborator = await service.updateCollaborator({ id, ...updates }, actorEmail)

    return NextResponse.json(collaborator)
  } catch (error) {
    const { status, json } = handleServiceError(error)
    return NextResponse.json(json, { status })
  }
}
