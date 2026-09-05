import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { GET as providerGet, POST as providerPost } from "../apollo/route"
import { createServiceClient } from "@/lib/supabase/server"
import { getCurrentProperty } from "@/lib/auth-property"
import { accessErrorStatus, adminUserIdPerDatabase, isAccessError } from "@/lib/auth/admin-access"
import { areaDeniedResponse, isAreaDenied } from "@/lib/auth/area-denied"
import { requireAreaApi } from "@/lib/auth/area-access"
import { recordScoutUsage, requireScoutAccess } from "@/lib/crm/scout-access"

function sanitizeText(value: string) {
  return value
    .replace(/Apollo\.io/gi, "HotelAccelerator Scout")
    .replace(/Apollo/gi, "Scout")
    .replace(/APOLLO_API_KEY/g, "configurazione Scout")
}

function sanitizeValue(value: unknown): unknown {
  if (typeof value === "string") return sanitizeText(value)
  if (Array.isArray(value)) return value.map(sanitizeValue)
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, sanitizeValue(item)]),
    )
  }
  return value
}

async function sanitizeResponse(response: Response) {
  const contentType = response.headers.get("content-type") || ""
  if (!contentType.includes("application/json")) return response

  const payload = await response.json().catch(() => null)
  const headers = new Headers(response.headers)
  headers.delete("content-length")

  return NextResponse.json(sanitizeValue(payload), {
    status: response.status,
    headers,
  })
}

function reportedCreditCost(action: string, payload: any) {
  if (action !== "enrich") return 0
  const value = Number(payload?.creditCost ?? 0)
  return Number.isFinite(value) && value > 0 ? value : 0
}

export async function GET(request: NextRequest) {
  try {
    await requireAreaApi("crm", request)
    const propertyId = await getCurrentProperty(request)
    await requireScoutAccess(request, propertyId)
    return sanitizeResponse(await providerGet(request))
  } catch (error) {
    if (isAreaDenied(error)) return areaDeniedResponse(error)
    const status = isAccessError(error) ? accessErrorStatus(error) : 500
    return NextResponse.json(
      { error: sanitizeText(error instanceof Error ? error.message : "Scout non disponibile.") },
      { status },
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAreaApi("crm", request)
    const propertyId = await getCurrentProperty(request)
    const access = await requireScoutAccess(request, propertyId)
    const db = createServiceClient()
    const body = await request.clone().json().catch(() => ({})) as Record<string, any>

    const response = await providerPost(request)
    const payload = await response.clone().json().catch(() => null) as any
    const action = String(body?.action || "")
    const auditable = new Set(["search", "save", "enrich", "import", "dismiss"])

    if (response.ok && action === "save" && payload?.prospect?.id && access.userId) {
      const prospectId = String(payload.prospect.id)
      const actorId = adminUserIdPerDatabase(access.userId)
      if (actorId) {
        // Preserve the original creator when an existing Scout result is saved again.
        await db
          .from("crm_apollo_prospects")
          .update({ created_by: actorId })
          .eq("property_id", propertyId)
          .eq("id", prospectId)
          .is("created_by", null)

        // A normal enabled user works the prospect they selected. Admins and
        // group leads instead leave it unassigned so they can distribute it.
        if (!access.canAssign) {
          const now = new Date().toISOString()
          await db
            .from("crm_apollo_prospects")
            .update({
              assigned_to_user_id: actorId,
              assigned_by_user_id: actorId,
              assigned_at: now,
              updated_at: now,
            })
            .eq("property_id", propertyId)
            .eq("id", prospectId)
            .is("assigned_to_user_id", null)
        }
      }
    }

    if (auditable.has(action)) {
      const prospectId = String(body?.prospectId || payload?.prospect?.id || "") || null
      const creditsUsed = reportedCreditCost(action, payload)
      await recordScoutUsage(db, {
        propertyId,
        access,
        action: action as "search" | "save" | "enrich" | "import" | "dismiss",
        success: response.ok,
        creditsUsed,
        prospectId,
        errorMessage: response.ok ? null : String(payload?.error || "Operazione Scout non completata"),
        metadata:
          action === "search"
            ? {
                keywords: body?.keywords || null,
                titles: Array.isArray(body?.titles) ? body.titles : [],
                organizationLocations: Array.isArray(body?.organizationLocations) ? body.organizationLocations : [],
                resultCount: Array.isArray(payload?.people) ? payload.people.length : null,
              }
            : action === "enrich"
              ? {
                  providerReportedCredits: creditsUsed,
                  reused: payload?.reused === true,
                  outcome: payload?.outcome || null,
                }
              : {},
      })
    }

    return sanitizeResponse(response)
  } catch (error) {
    if (isAreaDenied(error)) return areaDeniedResponse(error)
    const status = isAccessError(error) ? accessErrorStatus(error) : 500
    return NextResponse.json(
      { error: sanitizeText(error instanceof Error ? error.message : "Operazione Scout non completata.") },
      { status },
    )
  }
}
