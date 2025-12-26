import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

// POST - Registra un'impressione (view, click, dismiss, convert)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { property_id, rule_id, session_id, impression_type = "view" } = body

    if (!property_id) {
      return NextResponse.json({ error: "property_id is required in request body" }, { status: 400 })
    }

    if (!rule_id || !session_id) {
      return NextResponse.json({ error: "rule_id and session_id required" }, { status: 400 })
    }

    const supabase = await createClient()

    // Inserisce impressione
    const { error: insertError } = await supabase.from("message_impressions").insert({
      property_id,
      rule_id,
      session_id,
      impression_type,
    })

    if (insertError) {
      console.error("Error inserting impression:", insertError)
      return NextResponse.json({ error: "Failed to record impression" }, { status: 500 })
    }

    // Aggiorna contatori sulla regola
    const counterField = impression_type === "click" ? "clicks_count" : "impressions_count"

    await supabase
      .rpc("increment_counter", {
        table_name: "message_rules",
        column_name: counterField,
        row_id: rule_id,
      })
      .catch(() => {
        // Se la funzione RPC non esiste, ignora
      })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error in messages/impression:", error)
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}
