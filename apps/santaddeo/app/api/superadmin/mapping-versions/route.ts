import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { requireSuperAdmin } from "@/lib/auth/requireSuperAdmin"

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { searchParams } = new URL(request.url)
  const providerId = searchParams.get("provider_id")

  try {
    let query = supabase.from("pms_mapping_versions").select(`
        *,
        pms_providers!inner(id, name, code)
      `)

    if (providerId) {
      query = query.eq("pms_provider_id", providerId)
    }

    const { data, error } = await query.order("version_number", { ascending: false })

    if (error) {
      console.error("Error fetching mapping versions:", error)
      return NextResponse.json({ versions: [] })
    }

    // Get mappings count for each version
    const versions = await Promise.all(
      (data || []).map(async (v) => {
        const { count } = await supabase
          .from("pms_rms_mappings")
          .select("*", { count: "exact", head: true })
          .eq("mapping_version_id", v.id)

        // Parse completeness from checklist_status JSONB
        const checklistStatus = v.checklist_status || {}
        const completenessScore = checklistStatus.completeness_percentage || 0

        return {
          id: v.id,
          pms_provider_id: v.pms_provider_id,
          pms_name: v.pms_providers?.name || "Unknown",
          version_number: v.version_number,
          status: v.status,
          completeness_score: completenessScore,
          mappings_count: count || 0,
          created_at: v.created_at,
          validated_at: v.validated_at,
          locked_at: v.locked_at,
          valid_from: v.valid_from,
          notes: v.change_notes || v.notes,
          checklist_status: checklistStatus,
        }
      }),
    )

    return NextResponse.json({ versions })
  } catch (error) {
    console.error("Error in mapping-versions API:", error)
    return NextResponse.json({ versions: [] })
  }
}

/**
 * POST /api/superadmin/mapping-versions
 * Crea una nuova versione DRAFT per il provider indicato.
 *
 * Bug 20/05/2026: questo endpoint non esisteva. La UI di
 * /superadmin/connectors-mapping (tab "Binding & Versioni") aveva GET,
 * Validate e Lock ma non Create, quindi per qualsiasi provider per cui non
 * esistesse gia' una riga in `pms_mapping_versions` (es. BRiG), il super
 * admin non aveva alcun modo di completare il flusso "Crea -> Valida ->
 * Blocca -> attiva binding". Le versioni di Scidoo presenti in DB erano
 * arrivate dallo script seed 030_mapping_architecture_schema.sql.
 *
 * Riusiamo la function SQL `create_mapping_version(p_pms_provider_id,
 * p_notes)` gia' esistente in DB, che incrementa version_number e
 * deprecata eventuali draft precedenti dello stesso provider.
 */
export async function POST(request: NextRequest) {
  const denied = await requireSuperAdmin()
  if (denied) return denied

  const supabase = await createClient()
  let body: { pms_provider_id?: string; notes?: string | null } = {}
  try {
    body = await request.json()
  } catch {
    // body vuoto = ok, useremo solo provider obbligatorio
  }

  const providerId = body.pms_provider_id
  if (!providerId) {
    return NextResponse.json({ error: "pms_provider_id richiesto" }, { status: 400 })
  }

  try {
    const { data: newVersionId, error: rpcError } = await supabase.rpc("create_mapping_version", {
      p_pms_provider_id: providerId,
      p_notes: body.notes ?? null,
    })

    if (rpcError) {
      console.error("[mapping-versions POST] create_mapping_version RPC failed:", rpcError)
      return NextResponse.json(
        { error: rpcError.message || "Errore nella creazione della versione" },
        { status: 500 },
      )
    }

    // Carico la riga appena creata per restituirla come la GET la formatterebbe
    const { data: created } = await supabase
      .from("pms_mapping_versions")
      .select("id, version_number, status, created_at, pms_provider_id")
      .eq("id", newVersionId)
      .single()

    return NextResponse.json({ success: true, version: created || { id: newVersionId } })
  } catch (error: any) {
    console.error("[mapping-versions POST] unexpected error:", error)
    return NextResponse.json(
      { error: error?.message || "Errore nella creazione della versione" },
      { status: 500 },
    )
  }
}
