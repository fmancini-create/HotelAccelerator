import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"
import { checkModuleEnabledForProperty } from "@/lib/module-guard"

// GET /api/admin/channel-settings?channel=whatsapp
export async function GET(request: NextRequest) {
  try {
    const propertyId = await getAuthenticatedPropertyId(request)
    const guard = await checkModuleEnabledForProperty(propertyId, "inbox_enabled")
    if (guard) return guard

    const { searchParams } = new URL(request.url)
    const channel = searchParams.get("channel")

    const supabase = await createClient()

    if (channel) {
      // Get specific channel settings
      const { data, error } = await supabase
        .from("channel_settings")
        .select("*")
        .eq("property_id", propertyId)
        .eq("channel", channel)
        .single()

      if (error && error.code !== "PGRST116") {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      return NextResponse.json({ settings: data || null })
    }

    // Get all channel settings for this property
    const { data, error } = await supabase
      .from("channel_settings")
      .select("*")
      .eq("property_id", propertyId)
      .order("channel")

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ settings: data || [] })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Errore"
    return NextResponse.json({ error: message }, { status: 401 })
  }
}

// POST /api/admin/channel-settings - Create or update channel settings (upsert)
export async function POST(request: NextRequest) {
  try {
    const propertyId = await getAuthenticatedPropertyId(request)
    const guard = await checkModuleEnabledForProperty(propertyId, "inbox_enabled")
    if (guard) return guard

    const body = await request.json()
    const { channel, is_enabled, settings } = body

    if (!channel) {
      return NextResponse.json({ error: "Il campo 'channel' e' obbligatorio" }, { status: 400 })
    }

    const validChannels = ["whatsapp", "telegram", "chat", "phone", "social"]
    if (!validChannels.includes(channel)) {
      return NextResponse.json({ error: `Canale non valido. Valori accettati: ${validChannels.join(", ")}` }, { status: 400 })
    }

    const supabase = await createClient()

    // Check if exists
    const { data: existing } = await supabase
      .from("channel_settings")
      .select("id")
      .eq("property_id", propertyId)
      .eq("channel", channel)
      .single()

    if (existing) {
      // Update
      const { data, error } = await supabase
        .from("channel_settings")
        .update({
          is_enabled: is_enabled ?? true,
          settings: settings || {},
          updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id)
        .select()
        .single()

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }

      return NextResponse.json({ settings: data })
    }

    // Insert
    const { data, error } = await supabase
      .from("channel_settings")
      .insert({
        property_id: propertyId,
        channel,
        is_enabled: is_enabled ?? false,
        settings: settings || {},
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ settings: data }, { status: 201 })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Errore"
    return NextResponse.json({ error: message }, { status: 401 })
  }
}
