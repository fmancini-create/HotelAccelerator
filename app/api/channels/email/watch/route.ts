import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

// Setup Gmail watch (Pub/Sub push notifications)
export async function POST(request: NextRequest) {
  try {
    const { channel_id } = await request.json()

    if (!channel_id) {
      return NextResponse.json({ error: "channel_id obbligatorio" }, { status: 400 })
    }

    const supabase = await createClient()

    // Get channel
    const { data: channel, error: channelError } = await supabase
      .from("email_channels")
      .select("*")
      .eq("id", channel_id)
      .single()

    if (channelError || !channel) {
      return NextResponse.json({ error: "Canale non trovato" }, { status: 404 })
    }

    if (channel.provider !== "gmail") {
      return NextResponse.json({ error: "Push notifications solo per Gmail" }, { status: 400 })
    }

    // Check if token needs refresh
    if (channel.oauth_expiry && new Date(channel.oauth_expiry) < new Date()) {
      const refreshResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/channels/email/oauth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel_id }),
      })

      if (!refreshResponse.ok) {
        return NextResponse.json({ error: "Token scaduto. Ricollegare l'account." }, { status: 401 })
      }

      // Re-fetch channel with new token
      const { data: refreshedChannel } = await supabase
        .from("email_channels")
        .select("oauth_access_token")
        .eq("id", channel_id)
        .single()

      channel.oauth_access_token = refreshedChannel?.oauth_access_token
    }

    // Setup Gmail watch
    const watchResponse = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/watch", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${channel.oauth_access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        topicName: process.env.GOOGLE_PUBSUB_TOPIC,
        labelIds: ["INBOX"],
        labelFilterBehavior: "INCLUDE",
      }),
    })

    if (!watchResponse.ok) {
      const errorData = await watchResponse.json()
      console.error("[v0] Gmail watch error:", errorData)
      return NextResponse.json(
        {
          error: "Errore configurazione notifiche push",
          details: errorData.error?.message,
        },
        { status: 500 },
      )
    }

    const watchData = await watchResponse.json()
    console.log("[v0] Gmail watch setup:", watchData)

    // watchData contains: { historyId, expiration }
    // expiration is Unix timestamp in milliseconds
    const expirationDate = new Date(Number.parseInt(watchData.expiration))

    // Update channel with watch info
    await supabase
      .from("email_channels")
      .update({
        push_enabled: true,
        gmail_watch_expiration: expirationDate.toISOString(),
        gmail_history_id: Number.parseInt(watchData.historyId),
        updated_at: new Date().toISOString(),
      })
      .eq("id", channel_id)

    return NextResponse.json({
      success: true,
      expiration: expirationDate.toISOString(),
      historyId: watchData.historyId,
    })
  } catch (error) {
    console.error("[v0] Watch setup error:", error)
    return NextResponse.json({ error: "Errore interno" }, { status: 500 })
  }
}

// Stop Gmail watch
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const channel_id = searchParams.get("channel_id")

    if (!channel_id) {
      return NextResponse.json({ error: "channel_id obbligatorio" }, { status: 400 })
    }

    const supabase = await createClient()

    const { data: channel } = await supabase.from("email_channels").select("*").eq("id", channel_id).single()

    if (!channel) {
      return NextResponse.json({ error: "Canale non trovato" }, { status: 404 })
    }

    // Stop watch
    await fetch("https://gmail.googleapis.com/gmail/v1/users/me/stop", {
      method: "POST",
      headers: { Authorization: `Bearer ${channel.oauth_access_token}` },
    })

    // Update channel
    await supabase
      .from("email_channels")
      .update({
        push_enabled: false,
        gmail_watch_expiration: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", channel_id)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[v0] Watch stop error:", error)
    return NextResponse.json({ error: "Errore interno" }, { status: 500 })
  }
}
