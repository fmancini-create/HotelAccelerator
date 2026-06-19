import { type NextRequest, NextResponse } from "next/server"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"
import { getChannelAccess, canAccessEmailChannel } from "@/lib/channel-access"
import { EmailChannelService } from "@/lib/platform-services"
import { handleServiceError } from "@/lib/errors"

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const propertyId = await getAuthenticatedPropertyId(request)
    const access = await getChannelAccess(request)

    if (!(await canAccessEmailChannel(access, propertyId, id))) {
      return NextResponse.json({ error: "Accesso negato", code: "FORBIDDEN" }, { status: 403 })
    }

    const service = new EmailChannelService(access.supabase)
    const channel = await service.getChannel(id, propertyId)

    if (!channel) {
      return NextResponse.json({ error: "Channel not found", code: "NOT_FOUND" }, { status: 404 })
    }

    return NextResponse.json({ channel })
  } catch (error) {
    const { status, json } = handleServiceError(error)
    return NextResponse.json(json, { status })
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const propertyId = await getAuthenticatedPropertyId(request)
    const access = await getChannelAccess(request)

    if (!(await canAccessEmailChannel(access, propertyId, id))) {
      return NextResponse.json({ error: "Accesso negato", code: "FORBIDDEN" }, { status: 403 })
    }

    const body = await request.json()
    const { email_address, display_name, is_active, assigned_users, color } = body

    // Non-admins cannot reassign their mailbox to other users: keep self only.
    let resolvedAssignedUsers: string[] = assigned_users || []
    if (!access.isAdmin) {
      resolvedAssignedUsers = access.adminUserId ? [access.adminUserId] : []
    }

    const service = new EmailChannelService(access.supabase)
    const channel = await service.updateChannel(id, propertyId, {
      email_address,
      display_name: display_name || null,
      is_active: is_active ?? true,
      assigned_users: resolvedAssignedUsers,
      color: color === undefined ? undefined : color || null,
    })

    return NextResponse.json({ channel })
  } catch (error) {
    const { status, json } = handleServiceError(error)
    return NextResponse.json(json, { status })
  }
}

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const propertyId = await getAuthenticatedPropertyId(request)
    const access = await getChannelAccess(request)

    if (!(await canAccessEmailChannel(access, propertyId, id))) {
      return NextResponse.json({ error: "Accesso negato", code: "FORBIDDEN" }, { status: 403 })
    }

    const service = new EmailChannelService(access.supabase)
    await service.deleteChannel(id, propertyId)

    return NextResponse.json({ success: true })
  } catch (error) {
    const { status, json } = handleServiceError(error)
    return NextResponse.json(json, { status })
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const propertyId = await getAuthenticatedPropertyId(request)
    const access = await getChannelAccess(request)

    if (!(await canAccessEmailChannel(access, propertyId, id))) {
      return NextResponse.json({ error: "Accesso negato", code: "FORBIDDEN" }, { status: 403 })
    }

    const service = new EmailChannelService(access.supabase)
    const channel = await service.toggleChannelStatus(id, propertyId)

    return NextResponse.json({ channel })
  } catch (error) {
    const { status, json } = handleServiceError(error)
    return NextResponse.json(json, { status })
  }
}
