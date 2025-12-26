import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"
import { EmailChannelService } from "@/lib/platform-services"
import { handleServiceError } from "@/lib/errors"

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const propertyId = await getAuthenticatedPropertyId(request)

    const service = new EmailChannelService(supabase)
    const channels = await service.listChannels(propertyId)

    return NextResponse.json({ channels })
  } catch (error) {
    const { status, json } = handleServiceError(error)
    return NextResponse.json(json, { status })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const propertyId = await getAuthenticatedPropertyId(request)

    const body = await request.json()
    const { email_address, display_name, is_active, assigned_users } = body

    const service = new EmailChannelService(supabase)
    const channel = await service.createChannel(propertyId, {
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
