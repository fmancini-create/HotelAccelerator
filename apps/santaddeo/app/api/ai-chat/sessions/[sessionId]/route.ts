import { createClient, getAuthUser } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

// GET - Get messages for a session
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params
    const authClient = await createClient()
    const user = await getAuthUser(authClient)

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const supabase = await createClient()

    // Verify access
    const { data: session } = await supabase
      .from("chat_sessions")
      .select("user_id, hotel_id, tier, status, title")
      .eq("id", sessionId)
      .single()

    if (!session) {
      return NextResponse.json({ error: "Sessione non trovata" }, { status: 404 })
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single()

    // FIX 03/05/2026: role canonico in profiles e' "super_admin", non
    // "system_admin". Bug duplicato in tutto il dominio /api/ai-chat: il
    // GET messaggi falliva con 403 e la POST "reply" superadmin non poteva
    // mai inviare risposte.
    const isSuperAdmin = profile?.role === "super_admin"

    if (session.user_id !== user.id && !isSuperAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const { data: messages, error } = await supabase
      .from("chat_messages")
      .select("id, role, content, metadata, created_at")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ session, messages: messages || [] })
  } catch (error) {
    console.error("Error fetching messages:", error)
    return NextResponse.json({ error: "Errore nel recupero messaggi" }, { status: 500 })
  }
}

// POST - Forward session to expert (Advanced tier)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params
    const authClient = await createClient()
    const user = await getAuthUser(authClient)

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const supabase = await createClient()
    const body = await request.json()
    const { action, expertEmail, content } = body

    // Verify superadmin for reply action
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, first_name, last_name")
      .eq("id", user.id)
      .single()

    // FIX 03/05/2026: role canonico in profiles e' "super_admin", non
    // "system_admin". Bug duplicato in tutto il dominio /api/ai-chat: il
    // GET messaggi falliva con 403 e la POST "reply" superadmin non poteva
    // mai inviare risposte.
    const isSuperAdmin = profile?.role === "super_admin"
    const adminDisplayName = [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || "SuperAdmin"

    // SuperAdmin reply to a chat
    if (action === "reply") {
      if (!isSuperAdmin) {
        return NextResponse.json({ error: "Solo il SuperAdmin puo rispondere nelle chat" }, { status: 403 })
      }
      if (!content || !content.trim()) {
        return NextResponse.json({ error: "Il messaggio non puo essere vuoto" }, { status: 400 })
      }

      await supabase.from("chat_messages").insert({
        session_id: sessionId,
        role: "assistant",
        content: content.trim(),
        metadata: { from_superadmin: true, admin_name: adminDisplayName },
      })

      await supabase
        .from("chat_sessions")
        .update({ updated_at: new Date().toISOString() })
        .eq("id", sessionId)

      return NextResponse.json({ success: true })
    }

    if (action === "forward") {
      const { data: session } = await supabase
        .from("chat_sessions")
        .select("tier, status")
        .eq("id", sessionId)
        .single()

      if (!session || session.tier !== "advanced") {
        return NextResponse.json(
          { error: "L'inoltro e disponibile solo per il livello Advanced" },
          { status: 403 }
        )
      }

      // Update session status
      await supabase
        .from("chat_sessions")
        .update({
          status: "forwarded",
          forwarded_at: new Date().toISOString(),
          forwarded_to: expertEmail || "expert@santaddeo.com",
          updated_at: new Date().toISOString(),
        })
        .eq("id", sessionId)

      // Add system message
      await supabase.from("chat_messages").insert({
        session_id: sessionId,
        role: "system",
        content: `Conversazione inoltrata a un esperto di Revenue Management (${expertEmail || "expert@santaddeo.com"}).`,
      })

      // Send email notification to expert
      try {
        const { sendEmail } = await import("@/lib/email-smtp")

        // Get session messages for context
        const { data: messages } = await supabase
          .from("chat_messages")
          .select("role, content, created_at")
          .eq("session_id", sessionId)
          .order("created_at", { ascending: true })

        const { data: sessionData } = await supabase
          .from("chat_sessions")
          .select("title, hotel_id")
          .eq("id", sessionId)
          .single()

        const { data: hotel } = sessionData?.hotel_id
          ? await supabase.from("hotels").select("name").eq("id", sessionData.hotel_id).single()
          : { data: null }

        const { data: userProfile } = await supabase
          .from("profiles")
          .select("first_name, last_name, email")
          .eq("id", user.id)
          .single()

        const userDisplayName = [userProfile?.first_name, userProfile?.last_name].filter(Boolean).join(" ") || userProfile?.email || "N/D"

        const conversationHtml = (messages || [])
          .map((m) => `<p><strong>${m.role === "user" ? "Cliente" : "IA"}:</strong> ${m.content}</p>`)
          .join("")

        await sendEmail({
          to: expertEmail || "expert@santaddeo.com",
          subject: `[Santaddeo] Richiesta consulenza RM - ${hotel?.name || "Struttura"} - ${sessionData?.title || "Chat"}`,
          html: `
            <h2>Nuova richiesta di consulenza Revenue Management</h2>
            <p><strong>Struttura:</strong> ${hotel?.name || "N/D"}</p>
            <p><strong>Cliente:</strong> ${userDisplayName}</p>
            <h3>Conversazione:</h3>
            ${conversationHtml}
            <hr/>
            <p><em>Rispondi a questa email o accedi alla piattaforma per gestire la richiesta.</em></p>
          `,
          replyTo: userProfile?.email,
        })
      } catch (emailError) {
        console.error("Error sending forward email:", emailError)
      }

      return NextResponse.json({ success: true, status: "forwarded" })
    }

    return NextResponse.json({ error: "Azione non valida" }, { status: 400 })
  } catch (error) {
    console.error("Error in session action:", error)
    return NextResponse.json({ error: "Errore nell'operazione" }, { status: 500 })
  }
}
