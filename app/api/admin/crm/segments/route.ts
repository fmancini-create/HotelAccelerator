import { type NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { getCurrentProperty } from "@/lib/auth-property"
import { isAreaDenied, areaDeniedResponse } from "@/lib/auth/area-denied"
import { requireAreaApi } from "@/lib/auth/area-access"
import { normalizeSegmentConditions, validateSegmentConditions } from "@/lib/crm/segment-engine"
import {
  ensureSystemSegments,
  recomputeSegments,
  type ContactSegmentRow,
} from "@/lib/crm/segment-service"

export async function GET(request: NextRequest) {
  try {
    await requireAreaApi("crm", request)
    const propertyId = await getCurrentProperty(request)
    if (!propertyId) return NextResponse.json({ error: "Property not found" }, { status: 404 })

    const supabase = createServiceClient()
    const { data, error } = await supabase
      .from("contact_segments")
      .select("*")
      .eq("property_id", propertyId)
      .order("name")
    if (error) throw error

    const withSystemSegments = await ensureSystemSegments(supabase, propertyId, (data ?? []) as ContactSegmentRow[])
    const force = new URL(request.url).searchParams.get("refresh") === "1"
    const refreshed = await recomputeSegments(supabase, propertyId, withSystemSegments, { force })

    return NextResponse.json(refreshed.sort((a, b) => a.name.localeCompare(b.name, "it")))
  } catch (error) {
    if (isAreaDenied(error)) return areaDeniedResponse(error)
    console.error("Error fetching segments:", error)
    return NextResponse.json({ error: "Failed to fetch segments" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAreaApi("crm", request)
    const propertyId = await getCurrentProperty(request)
    if (!propertyId) return NextResponse.json({ error: "Property not found" }, { status: 404 })

    const body = await request.json()
    const name = typeof body.name === "string" ? body.name.trim() : ""
    const description = typeof body.description === "string" ? body.description.trim() : null
    const segmentType = body.segment_type === "static" ? "static" : "dynamic"
    const conditions = normalizeSegmentConditions(body.conditions)
    delete conditions.preset

    if (!name) return NextResponse.json({ error: "Il nome del segmento è obbligatorio." }, { status: 400 })
    if (name.length > 120) return NextResponse.json({ error: "Il nome del segmento è troppo lungo." }, { status: 400 })

    if (segmentType === "dynamic") {
      const validationErrors = validateSegmentConditions(conditions)
      if (validationErrors.length > 0) {
        return NextResponse.json({ error: validationErrors[0], details: validationErrors }, { status: 400 })
      }
    }

    const supabase = createServiceClient()
    const { data, error } = await supabase
      .from("contact_segments")
      .insert({
        property_id: propertyId,
        name,
        description,
        segment_type: segmentType,
        conditions,
        contact_count: 0,
        last_computed_at: null,
      })
      .select("*")
      .single()

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json({ error: "Esiste già un segmento con questo nome." }, { status: 409 })
      }
      throw error
    }

    const [refreshed] = await recomputeSegments(supabase, propertyId, [data as ContactSegmentRow], {
      force: true,
    })

    return NextResponse.json(refreshed, { status: 201 })
  } catch (error) {
    if (isAreaDenied(error)) return areaDeniedResponse(error)
    console.error("Error creating segment:", error)
    return NextResponse.json({ error: "Failed to create segment" }, { status: 500 })
  }
}
