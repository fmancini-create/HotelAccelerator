import { createClient } from "@/lib/supabase/server"
import { type NextRequest, NextResponse } from "next/server"

// Event types supported by the platform
type EventType =
  | "page_view"
  | "search_dates"
  | "room_interest"
  | "booking_start"
  | "form_submit"
  | "chat_open"
  | "chat_message"
  | "cta_click"
  | "scroll_depth"
  | "session_start"
  | "session_end"

interface TrackEventPayload {
  tenant_id: string
  session_id: string
  event_type: EventType
  event_category?: string
  payload?: Record<string, unknown>
  page_url?: string
  referrer?: string
}

export async function POST(request: NextRequest) {
  try {
    const body: TrackEventPayload = await request.json()

    // Validate required fields
    if (!body.tenant_id || !body.session_id || !body.event_type) {
      return NextResponse.json({ error: "Missing required fields: tenant_id, session_id, event_type" }, { status: 400 })
    }

    // Get client info from headers
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0] || request.headers.get("x-real-ip") || "unknown"
    const userAgent = request.headers.get("user-agent") || "unknown"

    const supabase = await createClient()

    // Insert event
    const { data, error } = await supabase
      .from("events")
      .insert({
        property_id: body.tenant_id,
        session_id: body.session_id,
        event_type: body.event_type,
        event_category: body.event_category || categorizeEvent(body.event_type),
        payload: body.payload || {},
        page_url: body.page_url,
        referrer: body.referrer,
        ip_address: ip,
        user_agent: userAgent,
      })
      .select("id")
      .single()

    if (error) {
      console.error("[Track API] Error inserting event:", error)
      return NextResponse.json({ error: "Failed to track event" }, { status: 500 })
    }

    return NextResponse.json({ success: true, event_id: data.id })
  } catch (error) {
    console.error("[Track API] Unexpected error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

// GET endpoint for pixel tracking (1x1 gif)
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)

  const tenant_id = searchParams.get("t")
  const session_id = searchParams.get("s")
  const event_type = searchParams.get("e") as EventType
  const page_url = searchParams.get("u")
  const referrer = searchParams.get("r")

  if (tenant_id && session_id && event_type) {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown"
    const userAgent = request.headers.get("user-agent") || "unknown"

    const supabase = await createClient()

    await supabase.from("events").insert({
      property_id: tenant_id,
      session_id: session_id,
      event_type: event_type,
      event_category: categorizeEvent(event_type),
      payload: {},
      page_url: page_url,
      referrer: referrer,
      ip_address: ip,
      user_agent: userAgent,
    })
  }

  // Return 1x1 transparent GIF
  const gif = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64")

  return new NextResponse(gif, {
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  })
}

function categorizeEvent(eventType: EventType): string {
  const categories: Record<EventType, string> = {
    page_view: "navigation",
    search_dates: "booking",
    room_interest: "booking",
    booking_start: "booking",
    form_submit: "engagement",
    chat_open: "engagement",
    chat_message: "engagement",
    cta_click: "engagement",
    scroll_depth: "navigation",
    session_start: "session",
    session_end: "session",
  }
  return categories[eventType] || "other"
}
