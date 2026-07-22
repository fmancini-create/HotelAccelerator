/**
 * CRON — guardia integrità DISPONIBILITÀ (DB vs PMS), auto-riparante.
 *
 * Nasce dall'incidente 20/07/2026 (Villa I Barronci: Suite e Dependance vendute
 * mostrate LIBERE in dashboard per settimane). Causa: l'ETL availability non
 * riversava in `daily_availability` il dato grezzo — già fresco nel nostro DB —
 * lasciando la dashboard su valori vecchi `source='pms'`.
 *
 * Questa guardia NON chiama il PMS (costo zero, non tocca la quota BRiG/Slope):
 * confronta il grezzo già scaricato con le tabelle finali (vedi
 * lib/availability/integrity-check.ts). Per gli hotel Scidoo con backlog
 * near-term AUTO-RIPARA rilanciando l'AvailabilityProcessor (drain loop
 * near-term-first), poi avvisa i superadmin (email + banner che legge
 * `availability_integrity_alerts`).
 *
 * Schedule suggerito: ogni 30 min sfasato ("5,35 * * * *").
 * ?dry=1 esegue detect+persist senza email; ?repair=0 disabilita l'auto-repair.
 */

import { type NextRequest, NextResponse } from "next/server"
import { requireCronAuth } from "@/lib/cron-auth"
import {
  detectAvailabilityIssues,
  persistAvailabilityAlerts,
  markAvailabilityAlertsNotified,
  type AvailabilityIntegrityIssue,
} from "@/lib/availability/integrity-check"
import { AvailabilityProcessor } from "@/lib/etl/processors/availability-processor"
import { triggerPriceRecalculation } from "@/lib/pricing/auto-trigger"
import { getSuperAdminEmails } from "@/lib/email/get-superadmin-recipients"
import { sendEmail } from "@/lib/email"
import { buildAvailabilityIntegrityEmail } from "@/lib/email/templates/availability-integrity-alert"

export const dynamic = "force-dynamic"
export const maxDuration = 120

export async function GET(request: NextRequest) {
  const unauthorized = requireCronAuth(request)
  if (unauthorized) return unauthorized

  const url = new URL(request.url)
  const dryRun = url.searchParams.get("dry") === "1"
  const doRepair = url.searchParams.get("repair") !== "0"
  const nowIso = new Date().toISOString()

  console.log("[v0] [availability-integrity] start", { dryRun, doRepair })

  try {
    // 1) Rilevamento (solo DB, nessuna chiamata PMS).
    let issues = await detectAvailabilityIssues()
    console.log(`[v0] [availability-integrity] rilevati ${issues.length} issue`)

    // 2) Auto-repair per gli hotel Scidoo con backlog near-term: rilanciamo
    //    l'ETL availability (drain loop) che riversa il grezzo in
    //    daily_availability. Poi ri-verifichiamo per aggiornare gli issue.
    const repaired: Array<{ hotelId: string; kind: string; rowsReprocessed: number }> = []
    if (doRepair) {
      const scidooStale = issues.filter((i) => i.kind === "scidoo_stale_near_term")
      for (const issue of scidooStale) {
        try {
          const before = Number((issue.detail as any)?.unprocessedNearTerm || 0)
          const processor = new AvailabilityProcessor(
            issue.hotelId,
            `integrity-repair-${Date.now()}`,
          )
          await processor.process()
          repaired.push({ hotelId: issue.hotelId, kind: issue.kind, rowsReprocessed: before })
          console.log(
            `[v0] [availability-integrity] auto-repair ${issue.hotelName}: riprocessate ~${before} righe`,
          )
        } catch (err) {
          console.error(
            `[v0] [availability-integrity] auto-repair FALLITO per ${issue.hotelName}:`,
            err instanceof Error ? err.message : err,
          )
        }
      }
      // Ri-rileva dopo la riparazione: gli issue risolti spariscono.
      if (scidooStale.length > 0) {
        issues = await detectAvailabilityIssues()
        console.log(`[v0] [availability-integrity] dopo repair restano ${issues.length} issue`)
      }

      // AGGANCIO PRICING (21/07/2026): riparare la disponibilità NON basta.
      // Nel flusso ETL normale una variazione di disponibilità innesca
      // triggerPriceRecalculation() -> pricing_recalc_queue -> ricalcolo grid
      // -> autopilot push/email. La nostra auto-repair scriveva SOLO
      // daily_availability, lasciando la griglia prezzi indietro finché non
      // girava il prossimo cron ETL (incidente osservato: disponibilità
      // corretta ma ultimo push prezzi fermo alle 16:30). Qui propaghiamo il
      // cambiamento con lo STESSO meccanismo del flusso normale: dedup nella
      // coda, e il push parte solo se l'hotel ha autopilot attivo e il prezzo
      // è effettivamente cambiato. Deduplichiamo per hotel (un hotel può avere
      // più tipologie riparate).
      const repairedHotelIds = [...new Set(repaired.map((r) => r.hotelId))]
      for (const hotelId of repairedHotelIds) {
        try {
          const res = await triggerPriceRecalculation(hotelId, "availability_integrity_repair")
          const item = repaired.find((r) => r.hotelId === hotelId)
          if (item) (item as any).recalcQueued = res.queued
          console.log(
            `[v0] [availability-integrity] recalc prezzi per ${hotelId}: queued=${res.queued}${res.reason ? ` (${res.reason})` : ""}`,
          )
        } catch (err) {
          console.error(
            `[v0] [availability-integrity] trigger recalc FALLITO per ${hotelId}:`,
            err instanceof Error ? err.message : err,
          )
        }
      }
    }

    // 3) Persisti alert (upsert + auto-risoluzione di quelli rientrati).
    const { newDedupKeys } = await persistAvailabilityAlerts(issues)

    // 4) Email SOLO per alert NUOVI e ancora NON risolti.
    //    FIX 20/07/2026: prima la condizione includeva `|| repaired.length > 0`,
    //    ma il backlog Scidoo near-term si riforma a ogni sync e viene
    //    auto-riparato a OGNI giro (ogni 30 min). Ogni riparazione faceva
    //    partire un'email che, essendo `issues` già rientrato a 0 dopo il
    //    repair, riportava "0 disallineamenti" con tabella VUOTA -> spam
    //    fuorviante ogni 30 min, in contraddizione con la nota "parte solo per
    //    alert nuovi". Le auto-riparazioni di routine restano tracciate in DB
    //    (availability_integrity_alerts) e nel banner superadmin: nessuna email.
    //    L'email parte solo se resta un problema NUOVO che richiede attenzione
    //    umana (es. repair fallito, o firma non auto-riparabile come
    //    scidoo_fetch_stale/derived_missing_near_term).
    let emailSent = false
    const notifiable = issues.filter((i) => newDedupKeys.includes(i.dedupKey))
    const shouldEmail = notifiable.length > 0 && !dryRun
    if (shouldEmail) {
      const recipients = await getSuperAdminEmails()
      const appUrl =
        process.env.NEXT_PUBLIC_APP_URL ||
        (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://www.santaddeo.com")
      const { subject, html, text } = buildAvailabilityIntegrityEmail({
        issues: notifiable,
        repaired,
        appUrl,
        reportDateIso: nowIso,
      })
      const res = await sendEmail({
        to: recipients,
        subject,
        html,
        type: "availability_integrity_alert",
        metadata: { issues: issues.length, repaired: repaired.length, text_preview: text.slice(0, 200) },
      })
      emailSent = res.success
      if (res.success && newDedupKeys.length > 0) {
        await markAvailabilityAlertsNotified(newDedupKeys)
      }
    }

    console.log("[v0] [availability-integrity] done", {
      issues: issues.length,
      repaired: repaired.length,
      newAlerts: newDedupKeys.length,
      emailSent,
    })

    const recalcTriggered = repaired.filter((r) => (r as any).recalcQueued).length

    return NextResponse.json({
      success: true,
      timestamp: nowIso,
      issues: issues.length,
      repaired: repaired.length,
      recalc_triggered: recalcTriggered,
      new_alerts: newDedupKeys.length,
      email_sent: emailSent,
    })
  } catch (error) {
    console.error("[v0] [availability-integrity] error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    )
  }
}
