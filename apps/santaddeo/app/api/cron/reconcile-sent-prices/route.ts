/**
 * CRON endpoint — riconciliazione DRIFT grid ↔ last_sent_prices.
 *
 * Schedule (vercel.json): "8,38 * * * *" — due volte l'ora, sfasato dagli
 * altri cron di pricing per non competere sul connettore PMS.
 *
 * Trova le celle dove `pricing_grid.price` differisce da
 * `last_sent_prices.last_price` (solo tariffe madri, solo celle gia' inviate,
 * date future) per gli hotel in mode='autopilot' e RIACCODA il push al PMS.
 * Risolve il caso in cui un push fallito dopo l'update grid lascia Scidoo su
 * un prezzo vecchio per sempre (il recalc confronta vs grid, non vs last_sent).
 *
 * Vedi `lib/pricing/reconcile-sent-prices.ts` per la logica e il razionale.
 *
 * Auth: Bearer CRON_SECRET. Supporta `?hotelId=<uuid>` per un giro mirato
 * (utile per il riallineamento one-off di un singolo hotel da superadmin/cron).
 */

import { type NextRequest, NextResponse } from "next/server"
import {
  reconcileSentPricesForAllAutopilotHotels,
  reconcileSentPricesForHotel,
} from "@/lib/pricing/reconcile-sent-prices"
import { isTransientError, logSupabaseError } from "@/lib/supabase/error-utils"

export const dynamic = "force-dynamic"
export const maxDuration = 300 // 5 min — il push al PMS puo' essere lento

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const hotelId = request.nextUrl.searchParams.get("hotelId")?.trim()

  try {
    if (hotelId) {
      console.log("[v0] [reconcile-sent] Targeted run for hotel:", hotelId)
      const result = await reconcileSentPricesForHotel(hotelId)
      return NextResponse.json({
        success: !result.error,
        timestamp: new Date().toISOString(),
        targeted: true,
        result,
      })
    }

    console.log("[v0] [reconcile-sent] Starting full autopilot reconciliation")
    const batch = await reconcileSentPricesForAllAutopilotHotels()
    console.log("[v0] [reconcile-sent] Done:", {
      hotelsScanned: batch.hotelsScanned,
      hotelsWithDrift: batch.hotelsWithDrift,
      totalDriftCells: batch.totalDriftCells,
      totalPushedCells: batch.totalPushedCells,
    })
    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      ...batch,
    })
  } catch (error) {
    // Durante un outage del gateway Supabase (Cloudflare 5xx: pagina HTML al
    // posto del JSON -> "Unexpected token '<'") le letture di autopilot_configs
    // ecc. falliscono. Non e' un bug applicativo: logghiamo in modo neutro e
    // rispondiamo 503 (transitorio, il cron riprovera' al giro dopo) invece di
    // un 500 rumoroso che stampa il blob HTML. Allineato a /api/pms/last-sync.
    if (isTransientError(error)) {
      logSupabaseError("reconcile-sent", error)
      return NextResponse.json(
        { success: false, transient: true, timestamp: new Date().toISOString() },
        { status: 503 },
      )
    }
    console.error("[v0] [reconcile-sent] Error:", error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      },
      { status: 500 },
    )
  }
}
