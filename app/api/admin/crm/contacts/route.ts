import { type NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { getCurrentProperty } from "@/lib/auth-property"
import { isAreaDenied, areaDeniedResponse } from "@/lib/auth/area-denied"
import { requireAreaApi } from "@/lib/auth/area-access"

function whiteLabelSource<T extends Record<string, unknown>>(contact: T): T {
  if (String(contact.source ?? "").toLowerCase() !== "apollo") return contact
  return { ...contact, source: "scout" }
}

export async function GET(request: NextRequest) {
  try {
    await requireAreaApi("crm", request)
    const propertyId = await getCurrentProperty(request)
    if (!propertyId) {
      return NextResponse.json({ error: "Property not found" }, { status: 404 })
    }

    const supabase = createServiceClient()
    const { searchParams } = new URL(request.url)

    const segment = searchParams.get("segment")
    const vip = searchParams.get("vip")

    if (segment && segment !== "all") {
      return NextResponse.json(
        { error: "Filtro per segmento non ancora supportato: i segmenti dinamici non sono valutati." },
        { status: 400 },
      )
    }
    const search = searchParams.get("search")
    const limit = Number.parseInt(searchParams.get("limit") || "50")
    const offset = Number.parseInt(searchParams.get("offset") || "0")

    let query = supabase
      .from("contacts")
      .select("*")
      .eq("property_id", propertyId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1)

    if (vip && vip !== "all") {
      query = query.eq("vip_level", vip)
    }

    if (search) {
      query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%,company.ilike.%${search}%`)
    }

    const { data, error } = await query

    if (error) throw error

    return NextResponse.json(
      (data || []).map((contact: Record<string, unknown>) => whiteLabelSource(contact)),
    )
  } catch (error) {
    if (isAreaDenied(error)) return areaDeniedResponse(error)
    console.error("Error fetching contacts:", error)
    return NextResponse.json({ error: "Failed to fetch contacts" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAreaApi("crm", request)
    const propertyId = await getCurrentProperty(request)
    if (!propertyId) {
      return NextResponse.json({ error: "Property not found" }, { status: 404 })
    }

    const supabase = createServiceClient()
    const body = await request.json()

    const requestedSource = String(body.source || "manual").toLowerCase()
    const source = requestedSource === "apollo" ? "scout" : requestedSource

    const { data, error } = await supabase
      .from("contacts")
      .insert({
        ...body,
        property_id: propertyId,
        source,
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json(whiteLabelSource(data))
  } catch (error) {
    if (isAreaDenied(error)) return areaDeniedResponse(error)
    console.error("Error creating contact:", error)
    return NextResponse.json({ error: "Failed to create contact" }, { status: 500 })
  }
}
