import { createClient, createServiceRoleClient } from "@/lib/supabase/server"

export async function POST(req: Request) {
  const { pathname, question, aiAnswer, leadName, leadEmail } = await req.json()

  // Use service role for insert (works for authenticated and anonymous users)
  const supabaseAdmin = await createServiceRoleClient()

  // Try to get authenticated user
  let userId: string | null = null
  let hotelId: string | null = null

  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (user) {
      userId = user.id

      // Get user's hotel
      try {
        const { data: profile } = await supabase
          .from("profiles")
          .select("organization_id")
          .eq("id", user.id)
          .single()

        if (profile?.organization_id) {
          const { data: hotel } = await supabase
            .from("hotels")
            .select("id")
            .eq("organization_id", profile.organization_id)
            .limit(1)
            .single()

          hotelId = hotel?.id || null
        }
      } catch {}
    }
  } catch {}

  // Save the uncertain question
  const { error } = await supabaseAdmin.from("page_guide_questions").insert({
    user_id: userId || "00000000-0000-0000-0000-000000000000",
    hotel_id: hotelId,
    page_path: pathname,
    question: leadName ? `[${leadName} - ${leadEmail}] ${question}` : question,
    ai_answer: aiAnswer,
    is_uncertain: true,
  })

  if (error) {
    console.error("[page-guide/uncertain] Error:", error.message)
    return Response.json({ error: error.message }, { status: 500 })
  }

  return Response.json({ ok: true })
}
