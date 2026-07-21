import { NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function POST(req: Request) {
  try {
    const { name, email, pathname, messages } = await req.json()

    if (!name || !email) {
      return NextResponse.json({ error: "Nome e email richiesti" }, { status: 400 })
    }

    const supabase = await createClient()

    await supabase.from("guide_leads").insert({
      name,
      email,
      page_path: pathname || "/",
      conversation: messages || [],
    })

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    console.error("[page-guide/lead] Error:", e.message)
    return NextResponse.json({ error: "Internal error" }, { status: 500 })
  }
}
