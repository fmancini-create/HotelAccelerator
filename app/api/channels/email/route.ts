import { type NextRequest, NextResponse } from "next/server"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"
import { getChannelAccess, getAccessibleChannelIds } from "@/lib/channel-access"
import { EmailChannelService } from "@/lib/platform-services"
import { handleServiceError } from "@/lib/errors"

/**
 * SECURITY: i segreti del canale email (token OAuth, password SMTP) non devono
 * MAI raggiungere il client. Questo serializer rimuove i campi sensibili dalla
 * response e li sostituisce con booleani indicatori, sul modello di WhatsApp.
 * NB: confinamento di response, non cifratura at-rest.
 */
const EMAIL_CHANNEL_SECRET_KEYS = [
  "oauth_access_token",
  "oauth_refresh_token",
  "access_token",
  "refresh_token",
  "smtp_password",
  "smtp_pass",
  "imap_password",
  "password",
] as const

function serializeEmailChannel<T extends Record<string, any> | null | undefined>(channel: T) {
  if (!channel) return channel
  const safe: Record<string, any> = {}
  for (const [key, value] of Object.entries(channel)) {
    if ((EMAIL_CHANNEL_SECRET_KEYS as readonly string[]).includes(key)) continue
    safe[key] = value
  }
  safe.has_oauth = Boolean(channel.oauth_access_token || channel.oauth_refresh_token)
  safe.has_smtp_password = Boolean(channel.smtp_password)
  return safe
}

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
      return NextResponse.json({
        channels: (channels || []).filter((c: { id: string }) => allowed.has(c.id)).map(serializeEmailChannel),
      })
    }

    return NextResponse.json({ channels: (channels || []).map(serializeEmailChannel) })
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

    return NextResponse.json({ channel: serializeEmailChannel(channel) })
  } catch (error) {
    const { status, json } = handleServiceError(error)
    return NextResponse.json(json, { status })
  }
}
