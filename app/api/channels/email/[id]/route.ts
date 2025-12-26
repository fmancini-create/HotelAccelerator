import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"
import { EmailChannelService } from "@/lib/platform-services"
import { handleServiceError } from "@/lib/errors"

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = await createClient()
    const propertyId = await getAuthenticatedPropertyId(request)

    const service = new EmailChannelService(supabase)
    const channel = await service.getChannel(params.id, propertyId)

    if (!channel) {
      return NextResponse.json({ error: "Channel not found", code: "NOT_FOUND" }, { status: 404 })
    }

    return NextResponse.json({ channel })
  } catch (error) {
    const { status, json } = handleServiceError(error)
    return NextResponse.json(json, { status })
  }
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = await createClient()
    const propertyId = await getAuthenticatedPropertyId(request)

    const body = await request.json()
    const { email_address, display_name, is_active, assigned_users } = body

    const service = new EmailChannelService(supabase)
    const channel = await service.updateChannel(params.id, propertyId, {
      email_address,
      display_name: display_name || null,
      is_active: is_active ?? true,
      assigned_users: assigned_users || [],
    })

    return NextResponse.json({ channel })
  } catch (error) {
    const { status, json } = handleServiceError(error)
    return NextResponse.json(json, { status })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = await createClient()
    const propertyId = await getAuthenticatedPropertyId(request)

    const service = new EmailChannelService(supabase)
    await service.deleteChannel(params.id, propertyId)

    return NextResponse.json({ success: true })
  } catch (error) {
    const { status, json } = handleServiceError(error)
    return NextResponse.json(json, { status })
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = await createClient()
    const propertyId = await getAuthenticatedPropertyId(request)

    const service = new EmailChannelService(supabase)
    const channel = await service.toggleChannelStatus(params.id, propertyId)

    return NextResponse.json({ channel })
  } catch (error) {
    const { status, json } = handleServiceError(error)
    return NextResponse.json(json, { status })
  }
}
