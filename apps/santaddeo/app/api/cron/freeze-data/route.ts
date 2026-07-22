/**
 * Cron endpoint to freeze old data
 * Should be called daily via Vercel Cron
 */

import { type NextRequest, NextResponse } from "next/server"
import { DataFreezeService } from "@/lib/services/data-freeze-service"
import { requireCronAuth } from "@/lib/cron-auth"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: NextRequest) {
  try {
    // Verify cron secret
    const unauthorized = requireCronAuth(request)
    if (unauthorized) return unauthorized

    console.log("[Cron] Starting data freeze job")

    const result = await DataFreezeService.freezeOldData()

    if (!result.success) {
      return NextResponse.json({ error: result.error, ...result }, { status: 500 })
    }

    console.log("[Cron] Data freeze completed:", result)

    return NextResponse.json({
      message: "Data freeze completed successfully",
      ...result,
    })
  } catch (error) {
    console.error("[Cron] Error in freeze-data cron:", error)
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    )
  }
}
