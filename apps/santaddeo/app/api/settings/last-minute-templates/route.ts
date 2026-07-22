import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const templateName = searchParams.get("template")

    if (!templateName) {
      return NextResponse.json({ error: "Template name required" }, { status: 400 })
    }

    const supabase = await createClient()

    // Recupera il template dalla tabella
    const { data, error } = await supabase
      .from("last_minute_level_templates")
      .select("*")
      .eq("template_name", templateName)
      .single()

    if (error || !data) {
      return NextResponse.json({ error: `Template non trovato: ${templateName}` }, { status: 404 })
    }

    // Restituisce i livelli dal JSON stored
    return NextResponse.json({
      template_name: data.template_name,
      description: data.description,
      levels: data.levels || [],
    })
  } catch (err: any) {
    console.error("[LAST-MINUTE-TEMPLATES]", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
