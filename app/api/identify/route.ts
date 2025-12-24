import { createClient } from "@/lib/supabase/server"
import { type NextRequest, NextResponse } from "next/server"
import { v4 as uuidv4 } from "uuid"

interface IdentifyPayload {
  tenant_id: string
  session_id?: string
  utm_source?: string
  utm_medium?: string
  utm_campaign?: string
  utm_content?: string
  utm_term?: string
}

export async function POST(request: NextRequest) {
  try {
    const body: IdentifyPayload = await request.json()

    if (!body.tenant_id) {
      return NextResponse.json({ error: "Missing required field: tenant_id" }, { status: 400 })
    }

    // Generate or use existing session ID
    const session_id = body.session_id || uuidv4()

    // Get client info
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown"
    const userAgent = request.headers.get("user-agent") || "unknown"

    const supabase = await createClient()

    // Track session_start event with UTM data
    await supabase.from("events").insert({
      property_id: body.tenant_id,
      session_id: session_id,
      event_type: "session_start",
      event_category: "session",
      payload: {
        utm_source: body.utm_source,
        utm_medium: body.utm_medium,
        utm_campaign: body.utm_campaign,
        utm_content: body.utm_content,
        utm_term: body.utm_term,
      },
      ip_address: ip,
      user_agent: userAgent,
      referrer: request.headers.get("referer"),
    })

    return NextResponse.json({
      success: true,
      session_id: session_id,
      tenant_id: body.tenant_id,
    })
  } catch (error) {
    console.error("[Identify API] Unexpected error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
