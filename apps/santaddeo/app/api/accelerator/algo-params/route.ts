/**
 * REDIRECT - Old algo-params API redirects to new pricing-params
 * This file exists only for backwards compatibility.
 *
 * BUG FIX 30/04/2026: gli import di `getAuthUser` / `isDevAuthAsync` /
 * `validateHotelAccess` erano referenziati ma non importati. Ogni POST
 * con auth path tornava 500 (`isDevAuthAsync is not defined`). Risultato:
 * client legacy che chiamavano questa route fallivano in silenzio, e i
 * loro tentativi di salvare `pricing_algo_params` non si applicavano,
 * pero' il browser mostrava un errore generico. Aggiunti gli import e
 * il gate `validateHotelAccess` per parita' con `pricing-params/route.ts`.
 */
import { NextRequest, NextResponse } from "next/server"
import { createClient, getAuthUser } from "@/lib/supabase/server"
import { isDevAuthAsync } from "@/lib/env/dev-auth"
import { validateHotelAccess } from "@/lib/auth/validateHotelAccess"

export const dynamic = "force-dynamic"
export const maxDuration = 30

async function saveParams(
  supabase: Awaited<ReturnType<typeof createClient>>,
  hotelId: string,
  params: Array<{ param_key: string; date: string; value: unknown }>
): Promise<number> {
  console.log("[v0] ALGO-PARAMS REDIRECT V8 - saving", params.length, "params for hotel:", hotelId)
  
  // Group params by date
  const paramsByDate = new Map<string, typeof params>()
  for (const param of params) {
    if (param.param_key && param.date && param.value !== undefined) {
      const dateParams = paramsByDate.get(param.date) || []
      dateParams.push(param)
      paramsByDate.set(param.date, dateParams)
    }
  }
  
  let savedCount = 0
  
  // Process each date - DELETE then INSERT
  for (const [date, dateParams] of paramsByDate) {
    const paramKeys = dateParams.map(p => p.param_key)
    
    // DELETE existing params for this hotel/date/keys
    const { error: delErr } = await supabase
      .from("pricing_algo_params")
      .delete()
      .eq("hotel_id", hotelId)
      .eq("date", date)
      .in("param_key", paramKeys)
    
    if (delErr) {
      console.error("[v0] V8 delete error for", date, ":", delErr.message)
    }
    
    // INSERT new params
    const rows = dateParams.map(p => ({
      hotel_id: hotelId,
      param_key: p.param_key,
      date: p.date,
      param_value: String(p.value),
      updated_at: new Date().toISOString()
    }))
    
    const { error: insErr } = await supabase
      .from("pricing_algo_params")
      .insert(rows)
    
    if (insErr) {
      console.error("[v0] V8 insert error for", date, ":", insErr.message)
    } else {
      savedCount += dateParams.length
    }
  }
  
  console.log("[v0] V8 - saved", savedCount, "params total")
  return savedCount
}

export async function POST(request: NextRequest) {
  console.log("[v0] ========== ALGO-PARAMS REDIRECT API VERSION 8 ==========")
  
  try {
    const body = await request.json()
    console.log("[v0] V8 received body keys:", Object.keys(body))
    
    const { hotel_id, params, occupancy_bands } = body

    if (!hotel_id) {
      return NextResponse.json({ error: "hotel_id required" }, { status: 400 })
    }

    // BUG FIX 30/04/2026: hotel access gate (parita' con pricing-params).
    // Senza questo, qualunque utente autenticato poteva sovrascrivere i
    // pricing_algo_params di QUALSIASI hotel.
    const denied = await validateHotelAccess(hotel_id)
    if (denied) return denied

    // Auth check
    const isV0Preview = await isDevAuthAsync()
    let userId: string | null = null
    if (isV0Preview) {
      userId = "5de43b7b-e661-4e4e-8177-7943df06470c"
    } else {
      const userClient = await createClient()
      const user = await getAuthUser(userClient)
      userId = user?.id ?? null
    }

    const supabase = await createClient()
    
    // Save params using pricing_algo_params table
    let savedCount = 0
    if (params && Array.isArray(params) && params.length > 0) {
      savedCount = await saveParams(supabase, hotel_id, params)
    } else {
      console.log("[v0] V8 - no params in request")
    }
    
    // Save occupancy bands
    if (occupancy_bands && Array.isArray(occupancy_bands) && occupancy_bands.length > 0) {
      // Delete existing bands
      await supabase
        .from("occupancy_bands")
        .delete()
        .eq("hotel_id", hotel_id)
      
      // Insert new bands
      const bandsToInsert = occupancy_bands.map((band: { band_index: number; min_occ: number; max_occ: number; increment: number }) => ({
        hotel_id: hotel_id,
        band_index: band.band_index,
        min_occ: band.min_occ,
        max_occ: band.max_occ,
        increment: band.increment,
        created_at: new Date().toISOString()
      }))
      
      const { error: bandsErr } = await supabase
        .from("occupancy_bands")
        .insert(bandsToInsert)
      
      if (bandsErr) {
        console.error("[v0] V8 bands insert error:", bandsErr.message)
      } else {
        console.log("[v0] V8 - saved", bandsToInsert.length, "occupancy bands")
      }
    }
    
    const recalcId = crypto.randomUUID()
    console.log("[v0] V8 complete - recalc_id:", recalcId, "saved:", savedCount)

    return NextResponse.json({
      success: true,
      recalc_id: recalcId,
      saved_params: savedCount,
      message: "Parametri salvati. Ricalcolo prezzi in corso in background...",
    })
  } catch (error) {
    console.error("[v0] V8 error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Errore sconosciuto" },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    const hotelId = request.nextUrl.searchParams.get("hotel_id")
    const startDate = request.nextUrl.searchParams.get("start_date")
    const endDate = request.nextUrl.searchParams.get("end_date")
    
    if (!hotelId) {
      return NextResponse.json({ error: "hotel_id required" }, { status: 400 })
    }

    // Hotel access gate (vedi POST sopra).
    const denied = await validateHotelAccess(hotelId, null, { allowSeller: "full" })
    if (denied) return denied

    const supabase = await createClient()

    let query = supabase
      .from("pricing_algo_params")
      .select("*")
      .eq("hotel_id", hotelId)
    
    if (startDate) query = query.gte("date", startDate)
    if (endDate) query = query.lte("date", endDate)
    
    const { data, error } = await query.order("date")
    
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    
    return NextResponse.json({ params: data })
  } catch (error) {
    console.error("[v0] GET algo-params redirect error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}
