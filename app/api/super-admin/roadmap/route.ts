import { NextRequest, NextResponse } from "next/server"
import { getAuthenticatedUserEmail } from "@/lib/auth-property"
import { SuperAdminService } from "@/lib/platform-services"
import { createServiceClient } from "@/lib/supabase/server"
import { handleServiceError } from "@/lib/errors"

async function requireSuperAdmin(request: NextRequest) {
  const actorEmail = await getAuthenticatedUserEmail(request)
  await new SuperAdminService().verifySuperAdmin(actorEmail)
  return actorEmail
}

export async function GET(request: NextRequest) {
  try {
    await requireSuperAdmin(request)
    const supabase = createServiceClient()
    const { data, error } = await supabase
      .from("platform_product_roadmap")
      .select("roadmap_key, area, capability, code_ready, online_ready, note, sort_order, updated_by_email, updated_at")
      .order("sort_order", { ascending: true })

    if (error) throw error
    return NextResponse.json({ items: data ?? [] })
  } catch (error) {
    return handleServiceError(error)
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const actorEmail = await requireSuperAdmin(request)
    const body = await request.json()
    const roadmapKey = typeof body?.roadmapKey === "string" ? body.roadmapKey.trim() : ""
    const field = body?.field === "code" || body?.field === "online" ? body.field : null
    const value = typeof body?.value === "boolean" ? body.value : null

    if (!roadmapKey || !field || value === null) {
      return NextResponse.json({ error: "roadmapKey, field e value sono obbligatori" }, { status: 400 })
    }

    const supabase = createServiceClient()
    const { data: current, error: readError } = await supabase
      .from("platform_product_roadmap")
      .select("roadmap_key, code_ready, online_ready")
      .eq("roadmap_key", roadmapKey)
      .maybeSingle()

    if (readError) throw readError
    if (!current) return NextResponse.json({ error: "Funzione roadmap non trovata" }, { status: 404 })

    const nextCode = field === "code" ? value : current.code_ready
    const nextOnline = field === "online" ? value : current.online_ready

    if (nextOnline && !nextCode) {
      return NextResponse.json({ error: "Una funzione non puo essere Online se Codice non e attivo" }, { status: 400 })
    }

    // The database trigger writes the matching audit row in the same transaction.
    // If audit insertion fails, this update fails too: roadmap state cannot drift from its audit trail.
    const { data: updated, error: updateError } = await supabase
      .from("platform_product_roadmap")
      .update({
        code_ready: nextCode,
        online_ready: nextOnline,
        updated_by_email: actorEmail,
        updated_at: new Date().toISOString(),
      })
      .eq("roadmap_key", roadmapKey)
      .select("roadmap_key, area, capability, code_ready, online_ready, note, sort_order, updated_by_email, updated_at")
      .single()

    if (updateError) throw updateError
    return NextResponse.json({ item: updated })
  } catch (error) {
    return handleServiceError(error)
  }
}
