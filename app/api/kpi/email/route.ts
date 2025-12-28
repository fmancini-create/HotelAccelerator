import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"

// Soglia default: 60 minuti
const DEFAULT_OVERDUE_MINUTES = 60

export async function GET(request: NextRequest) {
  try {
    const propertyId = await getAuthenticatedPropertyId(request)
    if (!propertyId) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 })
    }

    const supabase = await createClient()

    // Soglia configurabile (query param o default)
    const overdueMinutes = Number.parseInt(
      request.nextUrl.searchParams.get("overdue_minutes") || String(DEFAULT_OVERDUE_MINUTES),
    )

    // 1. Email non lette (status = 'received', sender_type = 'customer')
    const { count: unreadCount } = await supabase
      .from("messages")
      .select("*", { count: "exact", head: true })
      .eq("property_id", propertyId)
      .eq("status", "received")
      .eq("sender_type", "customer")

    // 2. Email lette ma non risposte (status = 'read', sender_type = 'customer')
    const { count: readUnrepliedCount } = await supabase
      .from("messages")
      .select("*", { count: "exact", head: true })
      .eq("property_id", propertyId)
      .eq("status", "read")
      .eq("sender_type", "customer")

    // 3. Email non risposte da più di X minuti
    const overdueThreshold = new Date(Date.now() - overdueMinutes * 60 * 1000).toISOString()
    const { count: overdueCount } = await supabase
      .from("messages")
      .select("*", { count: "exact", head: true })
      .eq("property_id", propertyId)
      .eq("sender_type", "customer")
      .in("status", ["received", "read"])
      .lt("received_at", overdueThreshold)

    // 4. Tempo medio di risposta (ultime 50 conversazioni con risposta)
    const { data: repliedMessages } = await supabase
      .from("messages")
      .select("conversation_id, received_at, created_at, sender_type, status")
      .eq("property_id", propertyId)
      .eq("status", "replied")
      .eq("sender_type", "customer")
      .order("created_at", { ascending: false })
      .limit(50)

    let avgResponseTimeMinutes: number | null = null

    if (repliedMessages && repliedMessages.length > 0) {
      // Per ogni messaggio replied, trova la prima risposta agent nella stessa conversazione
      const responseTimes: number[] = []

      for (const msg of repliedMessages) {
        if (!msg.received_at) continue

        // Trova la prima risposta agent dopo questo messaggio
        const { data: agentReply } = await supabase
          .from("messages")
          .select("created_at")
          .eq("conversation_id", msg.conversation_id)
          .eq("sender_type", "agent")
          .gt("created_at", msg.received_at)
          .order("created_at", { ascending: true })
          .limit(1)
          .single()

        if (agentReply?.created_at && msg.received_at) {
          const responseTime = new Date(agentReply.created_at).getTime() - new Date(msg.received_at).getTime()
          responseTimes.push(responseTime / (1000 * 60)) // in minuti
        }
      }

      if (responseTimes.length > 0) {
        avgResponseTimeMinutes = Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length)
      }
    }

    return NextResponse.json({
      unread_count: unreadCount || 0,
      read_unreplied_count: readUnrepliedCount || 0,
      overdue_count: overdueCount || 0,
      avg_response_time_minutes: avgResponseTimeMinutes,
      overdue_threshold_minutes: overdueMinutes,
    })
  } catch (error) {
    console.error("KPI email error:", error)
    return NextResponse.json({ error: "Errore calcolo KPI" }, { status: 500 })
  }
}
