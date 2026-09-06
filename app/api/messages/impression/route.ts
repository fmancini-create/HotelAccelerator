import { type NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "private, no-store",
}

function response(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: CORS })
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}

// POST - Registra un'impressione (view, click, dismiss, convert)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { property_id, rule_id, session_id, impression_type = "view" } = body

    if (!property_id) {
      return response({ error: "property_id is required in request body" }, 400)
    }

    if (!rule_id || !session_id) {
      return response({ error: "rule_id and session_id required" }, 400)
    }

    const supabase = createServiceClient()

    // La regola deve appartenere alla stessa property dichiarata dal browser.
    // Essendo un endpoint pubblico, non accettiamo un rule_id arbitrario.
    const { data: rule } = await supabase
      .from("message_rules")
      .select("id")
      .eq("id", rule_id)
      .eq("property_id", property_id)
      .maybeSingle()
    if (!rule?.id) return response({ error: "rule_not_found" }, 404)

    const { error: insertError } = await supabase.from("message_impressions").insert({
      property_id,
      rule_id,
      session_id,
      impression_type,
    })

    if (insertError) {
      console.error("Error inserting impression:", insertError)
      return response({ error: "Failed to record impression" }, 500)
    }

    const counterField = impression_type === "click" ? "clicks_count" : "impressions_count"
    const { error: counterError } = await supabase.rpc("increment_counter", {
      table_name: "message_rules",
      column_name: counterField,
      row_id: rule_id,
    })
    if (counterError) console.warn("Counter RPC unavailable:", counterError.message)

    return response({ success: true })
  } catch (error) {
    console.error("Error in messages/impression:", error)
    return response({ error: "Internal error" }, 500)
  }
}
