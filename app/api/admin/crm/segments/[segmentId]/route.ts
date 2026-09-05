import { type NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { getCurrentProperty } from "@/lib/auth-property"
import { isAreaDenied, areaDeniedResponse } from "@/lib/auth/area-denied"
import { requireAreaApi } from "@/lib/auth/area-access"
import { normalizeSegmentConditions, validateSegmentConditions } from "@/lib/crm/segment-engine"
import {
  getSegmentForProperty,
  isSystemSegment,
  recomputeSegments,
  type ContactSegmentRow,
} from "@/lib/crm/segment-service"

type RouteContext = { params: Promise<{ segmentId: string }> }

export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    await requireAreaApi("crm", request)
    const { segmentId } = await params
    const propertyId = await getCurrentProperty(request)
    if (!propertyId) return NextResponse.json({ error: "Property not found" }, { status: 404 })

    const supabase = createServiceClient()
    const segment = await getSegmentForProperty(supabase, propertyId, segmentId)
    if (!segment) return NextResponse.json({ error: "Segmento non trovato." }, { status: 404 })

    return NextResponse.json(segment)
  } catch (error) {
    if (isAreaDenied(error)) return areaDeniedResponse(error)
    console.error("Error fetching segment:", error)
    return NextResponse.json({ error: "Failed to fetch segment" }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    await requireAreaApi("crm", request)
    const { segmentId } = await params
    const propertyId = await getCurrentProperty(request)
    if (!propertyId) return NextResponse.json({ error: "Property not found" }, { status: 404 })

    const supabase = createServiceClient()
    const existing = await getSegmentForProperty(supabase, propertyId, segmentId)
    if (!existing) return NextResponse.json({ error: "Segmento non trovato." }, { status: 404 })

    const body = await request.json()
    const name = typeof body.name === "string" ? body.name.trim() : existing.name
    const description =
      typeof body.description === "string" ? body.description.trim() : body.description === null ? null : existing.description
    const segmentType = isSystemSegment(existing)
      ? "dynamic"
      : body.segment_type === "static"
        ? "static"
        : body.segment_type === "dynamic"
          ? "dynamic"
          : existing.segment_type ?? "dynamic"

    const previousConditions = normalizeSegmentConditions(existing.conditions)
    const conditions = body.conditions === undefined ? previousConditions : normalizeSegmentConditions(body.conditions)
    if (previousConditions.preset) conditions.preset = previousConditions.preset
    else delete conditions.preset

    if (!name) return NextResponse.json({ error: "Il nome del segmento è obbligatorio." }, { status: 400 })
    if (name.length > 120) return NextResponse.json({ error: "Il nome del segmento è troppo lungo." }, { status: 400 })

    if (segmentType === "dynamic") {
      const validationErrors = validateSegmentConditions(conditions)
      if (validationErrors.length > 0) {
        return NextResponse.json({ error: validationErrors[0], details: validationErrors }, { status: 400 })
      }
    }

    const now = new Date().toISOString()
    const { data, error } = await supabase
      .from("contact_segments")
      .update({
        name,
        description,
        segment_type: segmentType,
        conditions,
        last_computed_at: null,
        updated_at: now,
      })
      .eq("id", segmentId)
      .eq("property_id", propertyId)
      .select("*")
      .single()

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json({ error: "Esiste già un segmento con questo nome." }, { status: 409 })
      }
      throw error
    }

    const [refreshed] = await recomputeSegments(supabase, propertyId, [data as ContactSegmentRow], { force: true })
    return NextResponse.json(refreshed)
  } catch (error) {
    if (isAreaDenied(error)) return areaDeniedResponse(error)
    console.error("Error updating segment:", error)
    return NextResponse.json({ error: "Failed to update segment" }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  try {
    await requireAreaApi("crm", request)
    const { segmentId } = await params
    const propertyId = await getCurrentProperty(request)
    if (!propertyId) return NextResponse.json({ error: "Property not found" }, { status: 404 })

    const supabase = createServiceClient()
    const existing = await getSegmentForProperty(supabase, propertyId, segmentId)
    if (!existing) return NextResponse.json({ error: "Segmento non trovato." }, { status: 404 })
    if (isSystemSegment(existing)) {
      return NextResponse.json(
        { error: "I segmenti di sistema non si eliminano: puoi modificarne nome, descrizione e regole." },
        { status: 409 },
      )
    }

    const { error: membersError } = await supabase.from("contact_segment_members").delete().eq("segment_id", segmentId)
    if (membersError) throw membersError

    const { error } = await supabase
      .from("contact_segments")
      .delete()
      .eq("id", segmentId)
      .eq("property_id", propertyId)
    if (error) throw error

    return NextResponse.json({ ok: true })
  } catch (error) {
    if (isAreaDenied(error)) return areaDeniedResponse(error)
    console.error("Error deleting segment:", error)
    return NextResponse.json({ error: "Failed to delete segment" }, { status: 500 })
  }
}
