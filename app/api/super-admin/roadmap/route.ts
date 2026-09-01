import { NextRequest, NextResponse } from "next/server"
import { getAuthenticatedUserEmail } from "@/lib/auth-property"
import { SuperAdminService } from "@/lib/platform-services"
import { createServiceClient } from "@/lib/supabase/server"
import { handleServiceError } from "@/lib/errors"

const DEVELOPMENT_STATUSES = ["planned", "in_progress", "blocked", "abandoned", "completed"] as const
type DevelopmentStatus = (typeof DEVELOPMENT_STATUSES)[number]

async function requireSuperAdmin(request: NextRequest) {
  const actorEmail = await getAuthenticatedUserEmail(request)
  await new SuperAdminService().verifySuperAdmin(actorEmail)
  return actorEmail
}

const roadmapSelect = [
  "roadmap_key",
  "area",
  "capability",
  "code_ready",
  "online_ready",
  "development_status",
  "branch_name",
  "pr_number",
  "started_at",
  "completed_at",
  "note",
  "sort_order",
  "updated_by_email",
  "updated_at",
].join(", ")

export async function GET(request: NextRequest) {
  try {
    await requireSuperAdmin(request)
    const supabase = createServiceClient()
    const { data, error } = await supabase
      .from("platform_product_roadmap")
      .select(roadmapSelect)
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
    const field = body?.field === "status" || body?.field === "code" || body?.field === "online" ? body.field : null

    if (!roadmapKey || !field) {
      return NextResponse.json({ error: "roadmapKey e field sono obbligatori" }, { status: 400 })
    }

    const supabase = createServiceClient()
    const { data: current, error: readError } = await supabase
      .from("platform_product_roadmap")
      .select("roadmap_key, code_ready, online_ready, development_status, started_at")
      .eq("roadmap_key", roadmapKey)
      .maybeSingle()

    if (readError) throw readError
    if (!current) return NextResponse.json({ error: "Funzione roadmap non trovata" }, { status: 404 })

    if (field === "status") {
      const status = typeof body?.value === "string" && DEVELOPMENT_STATUSES.includes(body.value as DevelopmentStatus)
        ? (body.value as DevelopmentStatus)
        : null

      if (!status) return NextResponse.json({ error: "Stato sviluppo non valido" }, { status: 400 })
      if (status === "completed") {
        return NextResponse.json(
          { error: "Online viene assegnato solo dopo merge in main e deploy produzione verificato." },
          { status: 400 },
        )
      }
      if (current.online_ready) {
        return NextResponse.json(
          { error: "Una funzione gia online non puo essere rimessa manualmente in lavorazione dalla roadmap." },
          { status: 409 },
        )
      }

      const now = new Date().toISOString()
      const { data: updated, error: updateError } = await supabase
        .from("platform_product_roadmap")
        .update({
          development_status: status,
          started_at:
            (status === "in_progress" || status === "blocked") && !current.started_at
              ? now
              : current.started_at,
          completed_at: null,
          updated_by_email: actorEmail,
          updated_at: now,
        })
        .eq("roadmap_key", roadmapKey)
        .select(roadmapSelect)
        .single()

      if (updateError) throw updateError
      return NextResponse.json({ item: updated })
    }

    const value = typeof body?.value === "boolean" ? body.value : null
    if (value === null) {
      return NextResponse.json({ error: "value booleano obbligatorio" }, { status: 400 })
    }

    if (field === "online" && value) {
      return NextResponse.json(
        { error: "Il flag produzione viene attivato solo dal processo di chiusura dopo merge e deploy verificato." },
        { status: 400 },
      )
    }

    const nextCode = field === "code" ? value : current.code_ready
    const nextOnline = field === "online" ? value : current.online_ready

    if (nextOnline && !nextCode) {
      return NextResponse.json({ error: "Una funzione non puo essere in produzione senza codice in main" }, { status: 400 })
    }

    const nextDevelopmentStatus = !nextOnline && current.development_status === "completed"
      ? "in_progress"
      : current.development_status

    const { data: updated, error: updateError } = await supabase
      .from("platform_product_roadmap")
      .update({
        code_ready: nextCode,
        online_ready: nextOnline,
        development_status: nextDevelopmentStatus,
        completed_at: nextOnline ? current.completed_at : null,
        updated_by_email: actorEmail,
        updated_at: new Date().toISOString(),
      })
      .eq("roadmap_key", roadmapKey)
      .select(roadmapSelect)
      .single()

    if (updateError) throw updateError
    return NextResponse.json({ item: updated })
  } catch (error) {
    return handleServiceError(error)
  }
}
