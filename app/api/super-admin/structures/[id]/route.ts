import { type NextRequest, NextResponse } from "next/server"
import { SuperAdminService } from "@/lib/platform-services"
import { handleServiceError } from "@/lib/errors"
import { getAuthenticatedUserEmail } from "@/lib/auth-property"

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    // Next.js 16: params is async and must be awaited. Reading params.id
    // synchronously yields undefined, which made every lookup return
    // "Structure not found".
    const { id } = await params
    const actorEmail = await getAuthenticatedUserEmail(request)
    const service = new SuperAdminService()
    const structure = await service.getStructureDetails(id, actorEmail)

    return NextResponse.json({ structure })
  } catch (error) {
    return handleServiceError(error)
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const actorEmail = await getAuthenticatedUserEmail(request)
    const updates = await request.json()
    const service = new SuperAdminService()
    const structure = await service.updateStructure({ id, ...updates }, actorEmail)

    return NextResponse.json({ structure })
  } catch (error) {
    return handleServiceError(error)
  }
}
