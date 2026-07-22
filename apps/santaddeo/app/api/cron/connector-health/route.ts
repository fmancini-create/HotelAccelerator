/**
 * CRON endpoint for connector health monitoring
 * Runs every hour to check sync consistency between PMS raw data and RMS bookings
 * Also monitors fiscal connector health (0 records in 24h = BROKEN)
 * 
 * Schedule: 0 * * * * (every hour at minute 0)
 */

import { type NextRequest, NextResponse } from "next/server"
import { 
  runFullHealthCheck, 
  sendConnectorAlert 
} from "@/lib/services/connector-health-service"
import { emailService } from "@/lib/services/email-service"

export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function GET(request: NextRequest) {
  // Verify cron secret to prevent unauthorized access
  const authHeader = request.headers.get("authorization")
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  console.log("[ConnectorHealth CRON] Starting health check...")

  try {
    const result = await runFullHealthCheck()

    // Send console alerts if there are issues
    if (result.hasIssues) {
      await sendConnectorAlert(result)

      // Send throttled email alerts for each issue category
      const brokenBookings = result.bookings.filter(r => r.status === "critical")
      const brokenFiscal = result.fiscal.filter(r => r.status === "BROKEN")
      const staleSyncs = result.staleSyncs.filter(r => r.status !== "fresh")

      if (brokenBookings.length > 0) {
        await emailService.sendAlertIfNotRecent({
          alertType: "connector_booking_drift",
          hotelId: null,
          summary: `${brokenBookings.length} connettore/i booking con drift critico`,
          details: brokenBookings.map(b => `${b.hotelName}: ${b.details}`),
        })
      }

      if (brokenFiscal.length > 0) {
        await emailService.sendAlertIfNotRecent({
          alertType: "connector_fiscal_broken",
          hotelId: null,
          summary: `${brokenFiscal.length} connettore/i fiscali non funzionanti`,
          details: brokenFiscal.map(f => `${f.hotelName}: ultimo sync ${f.lastSyncAt ?? "mai"}`),
        })
      }

      if (staleSyncs.length > 0) {
        for (const s of staleSyncs) {
          const circuitInfo = s.circuitBreakerOpen ? " - Circuit breaker APERTO" : ""
          await emailService.sendAlertIfNotRecent({
            alertType: "sync_stale",
            hotelId: s.hotelId,
            hotelName: s.hotelName,
            summary: `Dati di sync obsoleti da ${s.minutesSinceSync} minuti${circuitInfo}`,
            details: [
              `Ultimo sync: ${s.lastSyncAt ?? "mai"}`,
              `Stato: ${s.status}`,
              s.circuitBreakerOpen ? "Il circuit breaker ha bloccato le chiamate al PMS" : "Il PMS potrebbe non rispondere",
            ],
          })
        }
      }
    }

    const bookingAlerts = result.bookings.filter(r => r.status !== "healthy").length
    const fiscalAlerts = result.fiscal.filter(r => r.status === "BROKEN").length
    const staleAlerts = result.staleSyncs.filter(r => r.status !== "fresh").length

    console.log("[ConnectorHealth CRON] Completed:", {
      bookingsChecked: result.bookings.length,
      fiscalChecked: result.fiscal.length,
      staleSyncsChecked: result.staleSyncs.length,
      bookingAlerts,
      fiscalAlerts,
      staleAlerts,
      hasIssues: result.hasIssues,
    })

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      summary: {
        bookingsChecked: result.bookings.length,
        fiscalChecked: result.fiscal.length,
        staleSyncsChecked: result.staleSyncs.length,
        bookingAlerts,
        fiscalAlerts,
        staleAlerts,
        hasIssues: result.hasIssues,
      },
      bookings: result.bookings.map((r) => ({
        hotel: r.hotelName,
        status: r.status,
        rawCount: r.rawCount,
        rmsCount: r.rmsCount,
        driftPct: r.driftPct,
        details: r.details,
      })),
      fiscal: result.fiscal.map((r) => ({
        hotel: r.hotelName,
        status: r.status,
        recordsLast24h: r.recordsLast24h,
        recordsLast7d: r.recordsLast7d,
        lastSyncAt: r.lastSyncAt,
      })),
      staleSyncs: result.staleSyncs.map((r) => ({
        hotel: r.hotelName,
        status: r.status,
        lastSyncAt: r.lastSyncAt,
        minutesSinceSync: r.minutesSinceSync,
        circuitBreakerOpen: r.circuitBreakerOpen,
      })),
    })
  } catch (error) {
    console.error("[ConnectorHealth CRON] Error:", error)
    return NextResponse.json(
      { 
        error: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    )
  }
}
