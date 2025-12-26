import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getCurrentProperty } from "@/lib/auth-property"

export async function GET(request: NextRequest) {
  try {
    const property = await getCurrentProperty()
    if (!property) {
      return NextResponse.json({ error: "Property not found" }, { status: 404 })
    }

    const supabase = await createClient()
    const { searchParams } = new URL(request.url)

    const segment = searchParams.get("segment")
    const vip = searchParams.get("vip")
    const search = searchParams.get("search")
    const limit = Number.parseInt(searchParams.get("limit") || "50")
    const offset = Number.parseInt(searchParams.get("offset") || "0")

    let query = supabase
      .from("contacts")
      .select("*")
      .eq("property_id", property.id)
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

    return NextResponse.json(data || [])
  } catch (error) {
    console.error("Error fetching contacts:", error)
    return NextResponse.json({ error: "Failed to fetch contacts" }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const property = await getCurrentProperty()
    if (!property) {
      return NextResponse.json({ error: "Property not found" }, { status: 404 })
    }

    const supabase = await createClient()
    const body = await request.json()

    const { data, error } = await supabase
      .from("contacts")
      .insert({
        ...body,
        property_id: property.id,
        source: body.source || "manual",
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json(data)
  } catch (error) {
    console.error("Error creating contact:", error)
    return NextResponse.json({ error: "Failed to create contact" }, { status: 500 })
  }
}
