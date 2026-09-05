import { type NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { getCurrentProperty } from "@/lib/auth-property"
import { adminUserIdPerDatabase, getCallerIdentity } from "@/lib/auth/admin-access"
import { areaDeniedResponse, isAreaDenied } from "@/lib/auth/area-denied"
import { requireAreaApi } from "@/lib/auth/area-access"

export async function GET(request: NextRequest) {
  try {
    await requireAreaApi("crm", request)
    const propertyId = await getCurrentProperty(request)
    const identity = await getCallerIdentity(request)
    if (!identity) return NextResponse.json({ error: "Non autenticato" }, { status: 401 })

    const userId = adminUserIdPerDatabase(identity.adminUserId)
    if (!userId) {
      return NextResponse.json({ currentUserId: null, prospects: [], summary: { assigned: 0, due: 0 } })
    }

    const db = createServiceClient()
    const { data: prospects, error } = await db
      .from("crm_apollo_prospects")
      .select("id,full_name,job_title,organization_name,city,country,email,status,lead_score,sales_stage,next_action,next_action_at,outreach_paused,assigned_at")
      .eq("property_id", propertyId)
      .eq("assigned_to_user_id", userId)
      .neq("status", "dismissed")
      .order("updated_at", { ascending: false })
      .limit(200)
    if (error) throw error

    const now = Date.now()
    const rows = prospects ?? []
    return NextResponse.json({
      currentUserId: userId,
      prospects: rows,
      summary: {
        assigned: rows.length,
        due: rows.filter((row: any) => row.next_action_at && new Date(row.next_action_at).getTime() <= now).length,
      },
    })
  } catch (error) {
    if (isAreaDenied(error)) return areaDeniedResponse(error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Impossibile leggere i prospect assegnati." },
      { status: 500 },
    )
  }
}
