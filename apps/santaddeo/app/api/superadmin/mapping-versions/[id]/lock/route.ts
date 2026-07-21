import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { id } = await params

  try {
    // Get version info
    const { data: version, error: fetchError } = await supabase
      .from("pms_mapping_versions")
      .select("*")
      .eq("id", id)
      .single()

    if (fetchError || !version) {
      return NextResponse.json({ error: "Versione mappatura non trovata" }, { status: 404 })
    }

    if (version.status !== "VALIDATED") {
      return NextResponse.json({ error: "Solo le versioni VALIDATED possono essere bloccate" }, { status: 400 })
    }

    // Get user
    const {
      data: { user },
    } = await supabase.auth.getUser()

    // Update to LOCKED - this is IRREVERSIBLE
    const { error: updateError } = await supabase
      .from("pms_mapping_versions")
      .update({
        status: "LOCKED",
        locked_at: new Date().toISOString(),
        locked_by: user?.id,
      })
      .eq("id", id)

    if (updateError) {
      throw updateError
    }

    return NextResponse.json({ success: true, message: "Mappatura bloccata in modo permanente" })
  } catch (error: any) {
    console.error("Error locking version:", error)
    return NextResponse.json({ error: error.message || "Errore nel blocco" }, { status: 500 })
  }
}
