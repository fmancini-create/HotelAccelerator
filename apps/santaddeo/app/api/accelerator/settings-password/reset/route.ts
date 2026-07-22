import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

// Must match the simpleHash function used in the settings page frontend
function simpleHash(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const chr = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + chr
    hash |= 0
  }
  return String(hash)
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { token, new_password } = body
    
    if (!token || !new_password) {
      return NextResponse.json({ error: "Token e nuova password richiesti" }, { status: 400 })
    }
    
    if (new_password.length < 4) {
      return NextResponse.json({ error: "Password troppo corta (min 4 caratteri)" }, { status: 400 })
    }
    
    const supabase = await createClient()
    
    // Validate token
    const { data: tokenData, error: tokenError } = await supabase
      .from("settings_password_reset_tokens")
      .select("id, hotel_id, expires_at, used")
      .eq("token", token)
      .single()
    
    if (tokenError || !tokenData) {
      return NextResponse.json({ error: "Token non valido" }, { status: 404 })
    }
    
    if (tokenData.used) {
      return NextResponse.json({ error: "Token già utilizzato" }, { status: 400 })
    }
    
    if (new Date(tokenData.expires_at) < new Date()) {
      return NextResponse.json({ error: "Token scaduto" }, { status: 400 })
    }
    
    // Hash the new password (same algorithm as frontend simpleHash)
    const newPasswordHash = simpleHash(new_password)
    
    // Save the password hash in pricing_algo_params using sentinel date (same as settings-password/route.ts)
    const SENTINEL_DATE = "9999-12-31"
    const PARAM_KEY = "ref_password_hash"

    const { error: upsertError } = await supabase
      .from("pricing_algo_params")
      .upsert(
        {
          hotel_id: tokenData.hotel_id,
          param_key: PARAM_KEY,
          date: SENTINEL_DATE,
          param_value: newPasswordHash,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "hotel_id,param_key,date" }
      )

    if (upsertError) {
      console.error("[v0] Error saving password hash:", upsertError)
      return NextResponse.json({ error: "Errore nell'impostazione della password" }, { status: 500 })
    }

    // Clean up legacy per-day rows (except sentinel)
    await supabase
      .from("pricing_algo_params")
      .delete()
      .eq("hotel_id", tokenData.hotel_id)
      .eq("param_key", PARAM_KEY)
      .neq("date", SENTINEL_DATE)
    
    // Mark token as used
    await supabase
      .from("settings_password_reset_tokens")
      .update({ used: true, used_at: new Date().toISOString() })
      .eq("id", tokenData.id)
    
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("[v0] Error resetting password:", error)
    return NextResponse.json({ error: "Errore server" }, { status: 500 })
  }
}
