import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"

// GET - Carica impostazioni canale email
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: channelId } = await params
    const propertyId = await getAuthenticatedPropertyId(request)

    const supabase = await createClient()

    const { data, error } = await supabase
      .from("email_channels")
      .select("sync_enabled, push_enabled, is_default")
      .eq("id", channelId)
      .eq("property_id", propertyId)
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    // Carica anche le impostazioni aggiuntive da channel_settings
    const { data: channelSettings } = await supabase
      .from("channel_settings")
      .select("settings")
      .eq("channel", "email")
      .eq("property_id", propertyId)
      .maybeSingle()

    return NextResponse.json({
      sync_enabled: data?.sync_enabled ?? true,
      push_enabled: data?.push_enabled ?? false,
      is_default: data?.is_default ?? false,
      notifications_enabled: channelSettings?.settings?.notifications_enabled ?? true,
      auto_create_contacts: channelSettings?.settings?.auto_create_contacts ?? true,
      save_attachments: channelSettings?.settings?.save_attachments ?? false,
    })
  } catch (error) {
    console.error("Error loading email settings:", error)
    return NextResponse.json({ error: "Errore nel caricamento delle impostazioni" }, { status: 500 })
  }
}

// PATCH - Aggiorna impostazioni canale email
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: channelId } = await params
    const propertyId = await getAuthenticatedPropertyId(request)
    const body = await request.json()

    const supabase = await createClient()

    // Aggiorna le impostazioni nel canale email
    const emailChannelUpdates: Record<string, boolean> = {}
    if (body.sync_enabled !== undefined) emailChannelUpdates.sync_enabled = body.sync_enabled
    if (body.push_enabled !== undefined) emailChannelUpdates.push_enabled = body.push_enabled
    if (body.is_default !== undefined) emailChannelUpdates.is_default = body.is_default

    if (Object.keys(emailChannelUpdates).length > 0) {
      const { error } = await supabase
        .from("email_channels")
        .update(emailChannelUpdates)
        .eq("id", channelId)
        .eq("property_id", propertyId)

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 })
      }
    }

    // Aggiorna le impostazioni aggiuntive in channel_settings
    const additionalSettings: Record<string, boolean> = {}
    if (body.notifications_enabled !== undefined) additionalSettings.notifications_enabled = body.notifications_enabled
    if (body.auto_create_contacts !== undefined) additionalSettings.auto_create_contacts = body.auto_create_contacts
    if (body.save_attachments !== undefined) additionalSettings.save_attachments = body.save_attachments

    if (Object.keys(additionalSettings).length > 0) {
      // Upsert channel_settings
      const { data: existing } = await supabase
        .from("channel_settings")
        .select("id, settings")
        .eq("channel", "email")
        .eq("property_id", propertyId)
        .maybeSingle()

      if (existing) {
        await supabase
          .from("channel_settings")
          .update({
            settings: { ...existing.settings, ...additionalSettings },
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id)
      } else {
        await supabase.from("channel_settings").insert({
          channel: "email",
          property_id: propertyId,
          is_enabled: true,
          settings: additionalSettings,
        })
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error updating email settings:", error)
    return NextResponse.json({ error: "Errore nell'aggiornamento delle impostazioni" }, { status: 500 })
  }
}
