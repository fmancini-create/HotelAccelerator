import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { OAUTH_PROVIDERS, type OAuthProvider } from "@/lib/oauth-config"

// Refresh OAuth token for a channel
export async function POST(request: NextRequest) {
  try {
    const { channel_id } = await request.json()

    if (!channel_id) {
      return NextResponse.json({ error: "channel_id obbligatorio" }, { status: 400 })
    }

    const supabase = await createClient()

    // Get channel with refresh token
    const { data: channel, error: fetchError } = await supabase
      .from("email_channels")
      .select("id, provider, oauth_refresh_token, property_id")
      .eq("id", channel_id)
      .single()

    if (fetchError || !channel) {
      return NextResponse.json({ error: "Canale non trovato" }, { status: 404 })
    }

    if (!channel.oauth_refresh_token || !channel.provider) {
      return NextResponse.json({ error: "Canale non configurato con OAuth" }, { status: 400 })
    }

    const provider = channel.provider as OAuthProvider
    const config = OAUTH_PROVIDERS[provider]

    const clientId = provider === "gmail" ? process.env.GOOGLE_CLIENT_ID : process.env.MICROSOFT_CLIENT_ID
    const clientSecret = provider === "gmail" ? process.env.GOOGLE_CLIENT_SECRET : process.env.MICROSOFT_CLIENT_SECRET

    if (!clientId || !clientSecret) {
      return NextResponse.json({ error: "Configurazione OAuth mancante" }, { status: 500 })
    }

    // Refresh the token
    const tokenResponse = await fetch(config.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: channel.oauth_refresh_token,
        grant_type: "refresh_token",
      }),
    })

    if (!tokenResponse.ok) {
      return NextResponse.json({ error: "Refresh token fallito. Ricollegare l'account." }, { status: 401 })
    }

    const tokens = await tokenResponse.json()
    const oauth_expiry = new Date(Date.now() + tokens.expires_in * 1000).toISOString()

    // Update channel with new access token
    const { error: updateError } = await supabase
      .from("email_channels")
      .update({
        oauth_access_token: tokens.access_token,
        oauth_expiry,
        // Some providers return new refresh token
        ...(tokens.refresh_token && { oauth_refresh_token: tokens.refresh_token }),
        updated_at: new Date().toISOString(),
      })
      .eq("id", channel_id)

    if (updateError) throw updateError

    return NextResponse.json({
      success: true,
      expires_at: oauth_expiry,
    })
  } catch (error) {
    console.error("Token refresh error:", error)
    return NextResponse.json({ error: "Errore durante il refresh del token" }, { status: 500 })
  }
}
