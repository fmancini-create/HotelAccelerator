// Pushes an app-side conversation state change to Gmail (app -> Gmail direction).
//
// This is the write-through half of the bidirectional Gmail sync. The read-back
// half (Gmail -> app) lives in lib/email/incremental-sync.ts and runs on the
// poll cron. Both halves agree on the same label mapping:
//
//   read / unread   <-> UNREAD label
//   resolved        <-> archived (no INBOX, no SPAM, no TRASH)
//   spam            <-> SPAM label
//   deleted         <-> TRASH
//   open / pending  <-> back in INBOX (remove SPAM)
//   is_starred      <-> STARRED label (handled by the toggle-star route)
//
// All operations are best-effort: a Gmail failure never breaks the app action.

import {
  markGmailThreadAsRead,
  markGmailThreadAsUnread,
  archiveGmailThread,
  spamGmailThread,
  trashGmailThread,
  modifyGmailThread,
} from "@/lib/gmail-client"

export interface ConversationStateChange {
  // true = mark read, false = mark unread, undefined = leave unchanged
  read?: boolean
  // app conversation status to mirror to Gmail, undefined = leave unchanged
  status?: string
}

/**
 * Mirrors a conversation state change to Gmail for email conversations.
 * No-ops for non-email channels (WhatsApp, etc.) or conversations without a
 * linked Gmail thread/channel.
 */
export async function pushConversationStateToGmail(
  supabase: any,
  conversationId: string,
  propertyId: string,
  change: ConversationStateChange,
): Promise<void> {
  try {
    const { data: conv } = await supabase
      .from("conversations")
      .select("id, channel, channel_id, gmail_thread_id")
      .eq("id", conversationId)
      .eq("property_id", propertyId)
      .single()

    if (!conv || conv.channel !== "email" || !conv.channel_id || !conv.gmail_thread_id) {
      return
    }

    const channelId = conv.channel_id as string
    const threadId = conv.gmail_thread_id as string

    if (change.read === true) {
      await markGmailThreadAsRead(channelId, threadId)
    } else if (change.read === false) {
      await markGmailThreadAsUnread(channelId, threadId)
    }

    if (change.status) {
      switch (change.status) {
        case "resolved":
        case "archived":
          await archiveGmailThread(channelId, threadId)
          break
        case "spam":
          await spamGmailThread(channelId, threadId)
          break
        case "deleted":
          await trashGmailThread(channelId, threadId)
          break
        case "open":
        case "pending":
          // Restore to inbox: re-add INBOX, drop SPAM (TRASH cannot be undone
          // via labels — a trashed thread must be untrashed separately).
          await modifyGmailThread(channelId, threadId, ["INBOX"], ["SPAM"])
          break
        default:
          break
      }
    }
  } catch (e) {
    console.error("[v0][gmail-state-sync] push error:", e)
  }
}
