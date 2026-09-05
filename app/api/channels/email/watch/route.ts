import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"
import { getChannelAccess, canAccessEmailChannel } from "@/lib/channel-access"
import { decryptChannelSecrets } from "@/lib/email/channel-secrets"
import { renewGmailWatch } from "@/lib/email/gmail-watch"

export async function POST(request: NextRequest) {
  try {
    const { channel_id } = await request.json()
    if (!channel_id) return NextResponse.json({ error: "channel_id obbligatorio" }, { status: 400 })

    const propertyId = await getAuthenticatedPropertyId(request)
    const access = await getChannelAccess(request)
    if (!(await canAccessEmailChannel(access, propertyId, channel_id, "manage"))) {
      return NextResponse.json({ error: "Accesso negato" }, { status: 403 })
    }

    const supabase = await createClient()
    const result = await renewGmailWatch(supabase, channel_id)

    if (!result.success) {
      const status = result.error?.includes("Token scaduto")
        ? 401
        : result.error === "Canale non trovato"
          ? 404
          : 500
      return NextResponse.json({ error: result.error, details: result.error }, { status })
    }

    return NextResponse.json({ success: true, expiration: result.expiration, historyId: result.historyId })
  } catch (error) {
    console.error("[v0] Watch setup error:", error)
    return NextResponse.json({ error: "Errore interno" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const channel_id = searchParams.get("channel_id")
    if (!channel_id) return NextResponse.json({ error: "channel_id obbligatorio" }, { status: 400 })

    const propertyId = await getAuthenticatedPropertyId(request)
    const access = await getChannelAccess(request)
    if (!(await canAccessEmailChannel(access, propertyId, channel_id, "manage"))) {
      return NextResponse.json({ error: "Accesso negato" }, { status: 403 })
    }

    const supabase = await createClient()
    const { data: rawChannel } = await supabase
      .from("email_channels")
      .select("*")
      .eq("id", channel_id)
      .eq("property_id", propertyId)
      .single()

    if (!rawChannel) return NextResponse.json({ error: "Canale non trovato" }, { status: 404 })

    const channel = decryptChannelSecrets(rawChannel)
    await fetch("https://gmail.googleapis.com/gmail/v1/users/me/stop", {
      method: "POST",
      headers: { Authorization: `Bearer ${channel.oauth_access_token}` },
    })

    await supabase
      .from("email_channels")
      .update({ push_enabled: false, gmail_watch_expiration: null, updated_at: new Date().toISOString() })
      .eq("id", channel_id)
      .eq("property_id", propertyId)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[v0] Watch stop error:", error)
    return NextResponse.json({ error: "Errore interno" }, { status: 500 })
  }
}
