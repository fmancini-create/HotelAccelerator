/**
 * Cron mensile: safety-net per il reconcile commissioni venditori.
 *
 * Gli hook applicativi sui route invoices (POST/PATCH/DELETE/bulk) chiamano
 * reconcileCommissionsForInvoice ad ogni mutazione. Questo cron gira ogni
 * giorno alle 04:00 e ri-processa le fatture degli ultimi 2 mesi per
 * recuperare eventuali eventi persi (timeout, sandbox down, errori transient).
 *
 * E' idempotente: il vincolo UNIQUE (agent, hotel, year, month) + l'upsert
 * dell'engine garantiscono che non si creino duplicati.
 *
 * Schedule in vercel.json: "0 4 * * *"
 * Auth: Bearer CRON_SECRET (controllato qui), ma il path e' anche whitelistato
 * in PUBLIC_ROUTES di session-handler.ts (vedi memoria 06/05 cron-pricing 401).
 */

import { NextRequest, NextResponse } from "next/server"
import { reconcileMonthSweep } from "@/lib/sales/commissions-engine"

export const dynamic = "force-dynamic"
export const maxDuration = 300

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization") || ""
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const now = new Date()
  const curY = now.getUTCFullYear()
  const curM = now.getUTCMonth() + 1
  // Mese precedente
  const prevDate = new Date(Date.UTC(curY, curM - 2, 1))
  const prevY = prevDate.getUTCFullYear()
  const prevM = prevDate.getUTCMonth() + 1

  console.log("[v0][cron-commissions] sweep start", { curY, curM, prevY, prevM })

  const [current, previous] = await Promise.all([
    reconcileMonthSweep(curY, curM),
    reconcileMonthSweep(prevY, prevM),
  ])

  console.log("[v0][cron-commissions] sweep done", { current, previous })

  return NextResponse.json({
    ok: true,
    current_month: { year: curY, month: curM, ...current },
    previous_month: { year: prevY, month: prevM, ...previous },
  })
}
