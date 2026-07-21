import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  const organizationId = request.nextUrl.searchParams.get("organization_id")
  
  try {
    const supabase = await createClient()
    
    let query = supabase
      .from("hotels")
      .select("id, name, organization_id")
      .order("name")
    
    if (organizationId) {
      query = query.eq("organization_id", organizationId)
    }
    
    const { data, error } = await query
    
    if (error) {
      console.error("[v0] Error fetching hotels:", error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    
    return NextResponse.json({ hotels: data || [] })
  } catch (error) {
    console.error("[v0] Error in hotels API:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
