import { type NextRequest, NextResponse } from "next/server"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"
import { getChannelAccess, getAccessibleChannelIds } from "@/lib/channel-access"
import { EmailChannelService } from "@/lib/platform-services"
import { handleServiceError } from "@/lib/errors"

export async function GET(request: NextRequest) {
  try {
    const propertyId = await getAuthenticatedPropertyId(request)
    const access = await getChannelAccess(request)
    const supabase = access.supabase

    const service = new EmailChannelService(supabase)
    const channels = await service.listChannels(propertyId)

    // A non-admin member only sees the mailboxes assigned to them.
    if (!access.isAdmin) {
      if (!access.adminUserId) return NextResponse.json({ channels: [] })
      const { emailChannelIds } = await getAccessibleChannelIds(supabase, propertyId, access.adminUserId)
      const allowed = new Set(emailChannelIds)
      return NextResponse.json({ channels: (channels || []).filter((c: { id: string }) => allowed.has(c.id)) })
    }

    return NextResponse.json({ channels })
  } catch (error) {
    const { status, json } = handleServiceError(error)
    return NextResponse.json(json, { status })
  }
}

export async function POST(request: NextRequest) {
  try {
    const propertyId = await getAuthenticatedPropertyId(request)
    const access = await getChannelAccess(request)
    const supabase = access.supabase

    const body = await request.json()
    const { email_address, display_name, is_active, assigned_users, color } = body

    // A non-admin can connect their OWN mailbox only: force the assignment to
    // themselves so they can't grant access to other users.
    let resolvedAssignedUsers: string[] = assigned_users || []
    if (!access.isAdmin) {
      if (!access.adminUserId) {
        return NextResponse.json({ error: "Accesso negato" }, { status: 403 })
      }
      resolvedAssignedUsers = [access.adminUserId]
    }

    const service = new EmailChannelService(supabase)
    const channel = await service.createChannel(propertyId, {
      email_address,
      display_name: display_name || null,
      is_active: is_active ?? true,
      assigned_users: resolvedAssignedUsers,
      color: color || null,
    })

    return NextResponse.json({ channel })
  } catch (error) {
    const { status, json } = handleServiceError(error)
    return NextResponse.json(json, { status })
  }
}
