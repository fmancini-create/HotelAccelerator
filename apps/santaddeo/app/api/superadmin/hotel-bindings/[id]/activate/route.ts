import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { id } = await params

  try {
    // Check current status
    const { data: binding, error: fetchError } = await supabase.from("hotel_bindings").select("*").eq("id", id).single()

    if (fetchError || !binding) {
      return NextResponse.json({ error: "Binding non trovato" }, { status: 404 })
    }

    if (binding.status !== "COMPLETE") {
      return NextResponse.json(
        { error: "Il binding deve essere COMPLETE prima di poter essere attivato" },
        { status: 400 },
      )
    }

    // Check if PMS mapping version is VALIDATED or LOCKED
    const { data: mappingVersion, error: mvError } = await supabase
      .from("pms_mapping_versions")
      .select("id, status")
      .eq("pms_provider_id", binding.pms_provider_id)
      .in("status", ["VALIDATED", "LOCKED"])
      .order("version_number", { ascending: false })
      .limit(1)
      .single()

    if (mvError || !mappingVersion) {
      return NextResponse.json(
        { error: "Impossibile attivare: la mappatura PMS deve essere VALIDATA o BLOCCATA prima" },
        { status: 400 },
      )
    }

    // Activate binding.
    // IMPORTANT: we MUST persist mapping_version_id here. The RLS policy on
    // pms_mapping_versions grants a property_admin read access via the join
    //   pms_mapping_versions.id = hotel_bindings.mapping_version_id
    //   AND user_property_map.user_id = auth.uid()
    // so if we leave mapping_version_id NULL, invited users see the
    // "Configurazione in Corso" gate in the dashboard even though the hotel
    // is actually fully configured.
    const { error: updateError } = await supabase
      .from("hotel_bindings")
      .update({
        status: "ACTIVE",
        activated_at: new Date().toISOString(),
        mapping_version_id: mappingVersion.id,
      })
      .eq("id", id)

    if (updateError) {
      throw updateError
    }

    return NextResponse.json({ success: true, message: "Binding attivato con successo" })
  } catch (error: any) {
    console.error("Error activating binding:", error)
    return NextResponse.json({ error: error.message || "Errore nell'attivazione" }, { status: 500 })
  }
}
