import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

/**
 * PUBLIC API - Chat Widget Config
 * Returns widget config (colors, messages, etc) for a property
 * No auth required
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const propertyId = searchParams.get("property_id")

    if (!propertyId) {
      return NextResponse.json(
        { error: "property_id obbligatorio" },
        { status: 400 }
      )
    }

    const supabase = await createClient()

    const { data: widget } = await supabase
      .from("embed_scripts")
      .select("config, is_active")
      .eq("property_id", propertyId)
      .eq("script_type", "chat")
      .single()

    if (!widget || !widget.is_active) {
      return NextResponse.json(
        { error: "Chat non attiva" },
        { status: 404 }
      )
    }

    // Return only safe public config (no internal data)
    const config = widget.config || {}
    return NextResponse.json({
      primaryColor: config.primaryColor || "#8b7355",
      position: config.position || "bottom-right",
      welcomeMessage: config.welcomeMessage || "Ciao! Come possiamo aiutarti?",
      placeholder: config.placeholder || "Scrivi un messaggio...",
      offlineMessage: config.offlineMessage || "Siamo offline. Lascia un messaggio.",
      aiEnabled: config.aiEnabled || false,
      aiGreeting: config.aiGreeting || "",
      collectEmail: config.collectEmail || false,
    })
  } catch (error) {
    return NextResponse.json(
      { error: "Errore interno" },
      { status: 500 }
    )
  }
}
