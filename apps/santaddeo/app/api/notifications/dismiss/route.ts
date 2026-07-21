import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

/** POST /api/notifications/dismiss - dismiss a notification for current user */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  // FIX 12/05/2026: il client (notifications-popup.tsx) invia `notificationId` (camelCase),
  // mentre prima qui leggevamo solo `notification_id` (snake_case) → payload undefined,
  // 400, NESSUN dismiss salvato. La notifica spariva via optimistic update ma il giorno
  // dopo ritornava "non letta". Accettiamo entrambe le chiavi per backward compatibility.
  const payload = await request.json().catch(() => ({}))
  const notificationId: string | undefined = payload?.notificationId ?? payload?.notification_id
  if (!notificationId) {
    return NextResponse.json({ error: "notificationId required" }, { status: 400 })
  }

  const { error } = await supabase
    .from("notification_dismissals")
    .upsert({
      notification_id: notificationId,
      user_id: user.id,
      dismissed_at: new Date().toISOString(),
    }, { onConflict: "notification_id,user_id" })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
