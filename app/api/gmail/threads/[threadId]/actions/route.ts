import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import {
  markGmailThreadAsRead,
  markGmailThreadAsUnread,
  starGmailThread,
  unstarGmailThread,
  archiveGmailThread,
  trashGmailThread,
  spamGmailThread,
  unspamGmailThread,
} from "@/lib/gmail-client"

const API_VERSION = "v745"

async function getEmailChannelForUser(supabase: any, userId: string) {
  // Check if user is super_admin
  const { data: adminUser } = await supabase.from("admin_users").select("id, role").eq("id", userId).single()

  if (adminUser?.role === "super_admin") {
    // Super admin: get first active Gmail channel
    const { data: channel } = await supabase
      .from("email_channels")
      .select("id, oauth_access_token, oauth_refresh_token, email_address")
      .eq("provider", "gmail")
      .eq("is_active", true)
      .limit(1)
      .single()
    return channel
  }

  // Check user_channel_permissions
  const { data: permission } = await supabase
    .from("user_channel_permissions")
    .select("channel_id, email_channels(id, oauth_access_token, oauth_refresh_token, email_address)")
    .eq("user_id", userId)
    .limit(1)
    .single()

  if (permission?.email_channels) {
    return permission.email_channels
  }

  // Check email_channel_assignments
  const { data: assignment } = await supabase
    .from("email_channel_assignments")
    .select("channel_id, email_channels(id, oauth_access_token, oauth_refresh_token, email_address)")
    .eq("user_id", userId)
    .limit(1)
    .single()

  return assignment?.email_channels || null
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ threadId: string }> }) {
  console.log(`[v0] GMAIL THREAD ACTIONS API ${API_VERSION} HIT`)

  try {
    const { threadId } = await params
    const body = await request.json()
    const { action } = body

    console.log(`[v0] Action: ${action}, threadId: ${threadId}`)

    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      console.log("[v0] Auth error:", authError)
      return NextResponse.json({ error: "Non autenticato", debugVersion: API_VERSION }, { status: 401 })
    }

    const channel = await getEmailChannelForUser(supabase, user.id)

    if (!channel) {
      console.log("[v0] No email channel found for user")
      return NextResponse.json({ error: "Canale email non configurato", debugVersion: API_VERSION }, { status: 400 })
    }

    console.log(`[v0] Using channel: ${channel.email_address}`)

    let result: { success: boolean; error?: string }

    switch (action) {
      case "markAsRead":
        result = await markGmailThreadAsRead(channel.id, threadId)
        break
      case "markAsUnread":
        result = await markGmailThreadAsUnread(channel.id, threadId)
        break
      case "star":
        result = await starGmailThread(channel.id, threadId)
        break
      case "unstar":
        result = await unstarGmailThread(channel.id, threadId)
        break
      case "archive":
        result = await archiveGmailThread(channel.id, threadId)
        break
      case "trash":
        result = await trashGmailThread(channel.id, threadId)
        break
      case "spam":
        result = await spamGmailThread(channel.id, threadId)
        break
      case "unspam":
        result = await unspamGmailThread(channel.id, threadId)
        break
      default:
        return NextResponse.json({ error: "Azione non valida", debugVersion: API_VERSION }, { status: 400 })
    }

    if (!result.success) {
      console.log(`[v0] Gmail action failed: ${result.error}`)
      return NextResponse.json({ error: result.error, debugVersion: API_VERSION }, { status: 500 })
    }

    console.log(`[v0] Gmail thread action ${action} successful`)

    return NextResponse.json({ success: true, debugVersion: API_VERSION })
  } catch (error) {
    console.error("[v0] Gmail thread action error:", error)
    return NextResponse.json({ error: "Errore interno", debugVersion: API_VERSION }, { status: 500 })
  }
}
