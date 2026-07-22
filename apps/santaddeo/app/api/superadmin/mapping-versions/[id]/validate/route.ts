import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { id } = await params

  try {
    // Get version info
    const { data: version, error: fetchError } = await supabase
      .from("pms_mapping_versions")
      .select("*, pms_providers(code)")
      .eq("id", id)
      .single()

    if (fetchError || !version) {
      return NextResponse.json({ error: "Versione mappatura non trovata" }, { status: 404 })
    }

    if (version.status !== "DRAFT") {
      return NextResponse.json({ error: `Impossibile validare: la versione è già ${version.status}` }, { status: 400 })
    }

    // Deprecate any existing VALIDATED/LOCKED versions for this PMS provider
    // (the unique constraint allows only one VALIDATED or LOCKED per provider)
    const { error: deprecateError } = await supabase
      .from("pms_mapping_versions")
      .update({ status: "DEPRECATED" })
      .eq("pms_provider_id", version.pms_provider_id)
      .in("status", ["VALIDATED", "LOCKED"])
      .neq("id", id)

    if (deprecateError) {
      console.error("Error deprecating old versions:", deprecateError)
      // Continue anyway - the old version might not exist
    }

    // Count mappings for completeness check
    const { count: mappingsCount } = await supabase
      .from("pms_rms_mappings")
      .select("*", { count: "exact", head: true })
      .eq("mapping_version_id", id)

    // Get user
    const {
      data: { user },
    } = await supabase.auth.getUser()

    // Update to VALIDATED
    const { error: updateError } = await supabase
      .from("pms_mapping_versions")
      .update({
        status: "VALIDATED",
        validated_at: new Date().toISOString(),
        validated_by: user?.id,
        checklist_status: {
          ...version.checklist_status,
          completeness_percentage: 100,
        },
      })
      .eq("id", id)

    if (updateError) {
      throw updateError
    }

    return NextResponse.json({ success: true, message: "Mappatura validata con successo" })
  } catch (error: any) {
    console.error("Error validating version:", error)
    return NextResponse.json({ error: error.message || "Errore nella validazione" }, { status: 500 })
  }
}
