import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"
import { EmailChannelService } from "@/lib/platform-services"
import { handleServiceError } from "@/lib/errors"
import { checkModuleEnabledForProperty } from "@/lib/module-guard"

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const propertyId = await getAuthenticatedPropertyId(request)
    const guard = await checkModuleEnabledForProperty(propertyId, "inbox_enabled")
    if (guard) return guard

    const service = new EmailChannelService(supabase)
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
    const supabase = await createClient()
    const propertyId = await getAuthenticatedPropertyId(request)
    const putGuard = await checkModuleEnabledForProperty(propertyId, "inbox_enabled")
    if (putGuard) return putGuard

    const body = await request.json()
    const { email_address, display_name, is_active, assigned_users } = body

    const service = new EmailChannelService(supabase)
    const channel = await service.updateChannel(id, propertyId, {
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

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const propertyId = await getAuthenticatedPropertyId(request)
    const delGuard = await checkModuleEnabledForProperty(propertyId, "inbox_enabled")
    if (delGuard) return delGuard

    const service = new EmailChannelService(supabase)
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
    const supabase = await createClient()
    const propertyId = await getAuthenticatedPropertyId(request)
    const patchGuard = await checkModuleEnabledForProperty(propertyId, "inbox_enabled")
    if (patchGuard) return patchGuard

    const service = new EmailChannelService(supabase)
    const channel = await service.toggleChannelStatus(id, propertyId)

    return NextResponse.json({ channel })
  } catch (error) {
    const { status, json } = handleServiceError(error)
    return NextResponse.json(json, { status })
  }
}
