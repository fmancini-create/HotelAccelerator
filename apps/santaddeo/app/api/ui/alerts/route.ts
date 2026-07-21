import { getAuthUserOrDev } from "@/lib/auth/getAuthUserOrDev"
import { type NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  const { user, supabase } = await getAuthUserOrDev()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const hotelId = searchParams.get("hotelId")

  if (!hotelId) {
    return NextResponse.json({ error: "hotelId required" }, { status: 400 })
  }

  const { data: alerts, error } = await supabase
    .from("alerts")
    .select("*")
    .eq("hotel_id", hotelId)
    .eq("is_dismissed", false)
    .order("created_at", { ascending: false })
    .limit(10)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ alerts: alerts || [] })
}

export async function PATCH(request: NextRequest) {
  const { user, supabase } = await getAuthUserOrDev()

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await request.json()
  const { id, is_read, is_dismissed } = body

  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 })
  }

  const updateData: any = {}
  if (typeof is_read === "boolean") updateData.is_read = is_read
  if (typeof is_dismissed === "boolean") updateData.is_dismissed = is_dismissed

  const { error } = await supabase.from("alerts").update(updateData).eq("id", id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
