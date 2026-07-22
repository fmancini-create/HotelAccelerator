import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const token = searchParams.get("token")
    
    if (!token) {
      return NextResponse.json({ valid: false, error: "Token mancante" }, { status: 400 })
    }
    
    const supabase = await createClient()
    
    // Find the token
    const { data: tokenData, error: tokenError } = await supabase
      .from("settings_password_reset_tokens")
      .select(`
        id,
        hotel_id,
        expires_at,
        used,
        hotels (name)
      `)
      .eq("token", token)
      .single()
    
    if (tokenError || !tokenData) {
      return NextResponse.json({ valid: false, error: "Token non valido" }, { status: 404 })
    }
    
    // Check if already used
    if (tokenData.used) {
      return NextResponse.json({ valid: false, error: "Token già utilizzato" }, { status: 400 })
    }
    
    // Check if expired
    if (new Date(tokenData.expires_at) < new Date()) {
      return NextResponse.json({ valid: false, error: "Token scaduto" }, { status: 400 })
    }
    
    return NextResponse.json({
      valid: true,
      hotel_id: tokenData.hotel_id,
      hotel_name: (tokenData.hotels as { name: string })?.name || "",
    })
  } catch (error) {
    console.error("[v0] Error validating reset token:", error)
    return NextResponse.json({ valid: false, error: "Errore server" }, { status: 500 })
  }
}
