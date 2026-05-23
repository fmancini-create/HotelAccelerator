import { NextRequest, NextResponse } from "next/server"
import { SuperAdminService } from "@/lib/platform-services"
import { handleServiceError } from "@/lib/errors"
import { getAuthenticatedUserEmail } from "@/lib/auth-property"

export async function GET(request: NextRequest) {
  try {
    const actorEmail = await getAuthenticatedUserEmail(request)
    const service = new SuperAdminService()
    const structures = await service.listStructures(actorEmail)

    return NextResponse.json({ structures })
  } catch (error) {
    const { status, json } = handleServiceError(error)
    return NextResponse.json(json, { status })
  }
}

export async function POST(request: NextRequest) {
  try {
    const actorEmail = await getAuthenticatedUserEmail(request)
    const data = await request.json()

    const service = new SuperAdminService()
    const structure = await service.createStructure(data, actorEmail)

    return NextResponse.json(structure, { status: 201 })
  } catch (error) {
    const { status, json } = handleServiceError(error)
    return NextResponse.json(json, { status })
  }
}
