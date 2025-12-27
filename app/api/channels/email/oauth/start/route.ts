import { type NextRequest, NextResponse } from "next/server"
import { buildOAuthUrl, type OAuthProvider } from "@/lib/oauth-config"

function toBase64Url(str: string): string {
  return Buffer.from(str).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "")
}

// Start OAuth flow for Gmail or Outlook
export async function POST(request: NextRequest) {
  try {
    const { provider, property_id } = await request.json()

    if (!provider || !property_id) {
      return NextResponse.json({ error: "Provider e property_id sono obbligatori" }, { status: 400 })
    }

    if (provider !== "gmail" && provider !== "outlook") {
      return NextResponse.json({ error: "Provider non supportato. Usa gmail o outlook." }, { status: 400 })
    }

    // Get client ID based on provider
    const clientId = provider === "gmail" ? process.env.GOOGLE_CLIENT_ID : process.env.MICROSOFT_CLIENT_ID

    if (!clientId) {
      return NextResponse.json(
        { error: `Configurazione ${provider} mancante. Contatta l'amministratore.` },
        { status: 500 },
      )
    }

    const state = toBase64Url(
      JSON.stringify({
        property_id,
        provider,
        timestamp: Date.now(),
      }),
    )

    // Build OAuth URL
    const authUrl = buildOAuthUrl(provider as OAuthProvider, state, clientId)

    return NextResponse.json({ authUrl })
  } catch (error) {
    console.error("OAuth start error:", error)
    return NextResponse.json({ error: "Errore durante l'avvio OAuth" }, { status: 500 })
  }
}
