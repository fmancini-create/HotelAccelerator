import { NextResponse } from "next/server"
import { createClient, createServiceRoleClient } from "@/lib/supabase/server"
import { backfillBookingsFromRaw } from "@/lib/services/scidoo-sync-service"

export const maxDuration = 300 // 5 minutes max

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: "Non autenticato" }, { status: 401 })
    }

    const serviceClient = await createServiceRoleClient()
    const { data: profile } = await serviceClient
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single()

    if (profile?.role !== "super_admin" && profile?.role !== "superadmin") {
      return NextResponse.json({ error: "Solo super admin" }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const hotelId = body.hotelId || undefined

    console.log("[Backfill] Starting backfill...", hotelId ? `for hotel ${hotelId}` : "for ALL hotels")
    const results = await backfillBookingsFromRaw(serviceClient, hotelId)

    return NextResponse.json({
      success: true,
      results,
      summary: {
        hotelsProcessed: results.length,
        totalImported: results.reduce((s, r) => s + r.imported, 0),
        totalErrors: results.reduce((s, r) => s + r.errors.length, 0),
      }
    })
  } catch (error: any) {
    console.error("[Backfill] Error:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
