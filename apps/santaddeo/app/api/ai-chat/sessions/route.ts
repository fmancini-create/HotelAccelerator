import { createClient, getAuthUser } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

// GET - List chat sessions for a hotel (or all for superadmin)
export async function GET(request: NextRequest) {
  try {
    const authClient = await createClient()
    const user = await getAuthUser(authClient)

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const supabase = await createClient()
    const searchParams = request.nextUrl.searchParams
    const hotelId = searchParams.get("hotelId")
    const allHotels = searchParams.get("all") === "true"

    // Check if superadmin
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single()

    // FIX 03/05/2026: role canonico in profiles e' "super_admin", non
    // "system_admin". Stesso bug di tier-config: con l'old check tutti i
    // superadmin venivano trattati come utenti normali → tab "Conversazioni"
    // mostrava solo le proprie sessioni invece di tutte.
    const isSuperAdmin = profile?.role === "super_admin"

    let query = supabase
      .from("chat_sessions")
      .select(`
        id, title, tier, status, created_at, updated_at,
        forwarded_at, forwarded_to, user_id, hotel_id
      `)
      .order("updated_at", { ascending: false })

    if (allHotels && isSuperAdmin) {
      // SuperAdmin sees all
    } else if (hotelId) {
      query = query.eq("hotel_id", hotelId)
      if (!isSuperAdmin) {
        query = query.eq("user_id", user.id)
      }
    } else {
      if (!isSuperAdmin) {
        query = query.eq("user_id", user.id)
      }
    }

    const { data: sessions, error } = await query.limit(50)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Get hotel names and user emails for display
    const hotelIds = [...new Set((sessions || []).map((s) => s.hotel_id))]
    const userIds = [...new Set((sessions || []).map((s) => s.user_id))]

    const { data: hotels } = await supabase
      .from("hotels")
      .select("id, name")
      .in("id", hotelIds.length ? hotelIds : ["00000000-0000-0000-0000-000000000000"])

    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, first_name, last_name, email")
      .in("id", userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"])

    const hotelMap = Object.fromEntries((hotels || []).map((h) => [h.id, h.name]))
    const profileMap = Object.fromEntries(
      (profiles || []).map((p) => [p.id, { name: [p.first_name, p.last_name].filter(Boolean).join(" "), email: p.email }])
    )

    const enriched = (sessions || []).map((s) => ({
      ...s,
      hotel_name: hotelMap[s.hotel_id] || "Sconosciuto",
      user_name: profileMap[s.user_id]?.name || profileMap[s.user_id]?.email || "Sconosciuto",
    }))

    return NextResponse.json({ sessions: enriched })
  } catch (error) {
    console.error("Error fetching chat sessions:", error)
    return NextResponse.json({ error: "Errore nel recupero sessioni" }, { status: 500 })
  }
}

// DELETE - Delete a chat session
export async function DELETE(request: NextRequest) {
  try {
    const authClient = await createClient()
    const user = await getAuthUser(authClient)

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const supabase = await createClient()
    const { sessionId } = await request.json()

    if (!sessionId) {
      return NextResponse.json({ error: "sessionId required" }, { status: 400 })
    }

    // Verify ownership or superadmin
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single()

    // FIX 03/05/2026: role canonico in profiles e' "super_admin", non
    // "system_admin". Stesso bug di tier-config: con l'old check tutti i
    // superadmin venivano trattati come utenti normali → tab "Conversazioni"
    // mostrava solo le proprie sessioni invece di tutte.
    const isSuperAdmin = profile?.role === "super_admin"

    if (!isSuperAdmin) {
      const { data: session } = await supabase
        .from("chat_sessions")
        .select("user_id")
        .eq("id", sessionId)
        .single()

      if (session?.user_id !== user.id) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 })
      }
    }

    await supabase.from("chat_messages").delete().eq("session_id", sessionId)
    await supabase.from("chat_sessions").delete().eq("id", sessionId)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting chat session:", error)
    return NextResponse.json({ error: "Errore nell'eliminazione" }, { status: 500 })
  }
}
