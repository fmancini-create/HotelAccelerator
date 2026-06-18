import { createClient } from "@/lib/supabase/server"
import { type NextRequest, NextResponse } from "next/server"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"
import { InboxWriteService } from "@/lib/platform-services"
import { starGmailThread, unstarGmailThread } from "@/lib/gmail-client"
import { handleServiceError } from "@/lib/errors"

export async function POST(request: NextRequest, { params }: { params: Promise<{ conversationId: string }> }) {
  try {
    // IMPORTANT: pass `request` so super_admin users resolve the active tenant
    // (via the ha_active_property_id cookie / ?property_id). Without it the
    // star never persisted for super_admins and reappeared unstarred on poll.
    const propertyId = await getAuthenticatedPropertyId(request)
    const { conversationId } = await params
    const body = await request.json()

    const { is_starred } = body

    if (typeof is_starred !== "boolean") {
      return NextResponse.json({ error: "is_starred must be a boolean", code: "VALIDATION_ERROR" }, { status: 400 })
    }

    const supabase = await createClient()
    const service = new InboxWriteService(supabase)

    const result = await service.toggleStar({
      conversationId,
      propertyId,
      isStarred: is_starred,
    })

    // Sync the star with Gmail for email conversations so the STARRED label
    // matches and survives the next Gmail->DB sync. Best-effort: a Gmail error
    // must not fail the local toggle (e.g. WhatsApp, or token issues).
    try {
      const { data: conv } = await supabase
        .from("conversations")
        .select("channel, channel_id, gmail_thread_id")
        .eq("id", conversationId)
        .eq("property_id", propertyId)
        .maybeSingle()

      if (conv?.channel === "email" && conv.channel_id && conv.gmail_thread_id) {
        const gmailResult = is_starred
          ? await starGmailThread(conv.channel_id, conv.gmail_thread_id)
          : await unstarGmailThread(conv.channel_id, conv.gmail_thread_id)
        if (!gmailResult.success) {
          console.log("[v0] toggle-star: Gmail sync failed (non-fatal):", gmailResult.error)
        }
      }
    } catch (gmailError) {
      console.log("[v0] toggle-star: Gmail sync threw (non-fatal):", gmailError)
    }

    return NextResponse.json({ conversation: result })
  } catch (error) {
    const { status, json } = handleServiceError(error)
    return NextResponse.json(json, { status })
  }
}
