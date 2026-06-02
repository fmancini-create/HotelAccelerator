import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { listAccessibleGmailChannels } from "@/lib/gmail-channel-resolver"

/**
 * GET /api/gmail/channels
 * Returns the list of Gmail mailboxes the current user can operate on,
 * so the UI can render a mailbox switcher. Tenant-safe (per resolver rules).
 */
export async function GET(_request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ channels: [], error: "Non autenticato" }, { status: 401 })
    }

    const channels = await listAccessibleGmailChannels(supabase, user.id)
    return NextResponse.json({ channels })
  } catch (error) {
    console.error("[v0] /api/gmail/channels error:", error)
    return NextResponse.json({ channels: [], error: "Errore interno" }, { status: 500 })
  }
}
