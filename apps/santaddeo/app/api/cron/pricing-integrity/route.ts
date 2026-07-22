/**
 * CRON — controllo integrita' pricing in QUASI tempo reale.
 *
 * Schedule: ogni 30 minuti ("15,45 * * * *", sfasato dal cron k-values).
 *
 * Nasce dall'incidente 15/07/2026 (wipe parametri Barronci set-dic): nessun
 * controllo esistente intercettava la sparizione di prezzi/parametri. Qui
 * rileviamo due sintomi e avvisiamo i superadmin (email + banner in dashboard,
 * che legge la tabella `pricing_integrity_alerts`):
 *
 *   A. MASS DELETE con PERDITA NETTA — una transazione ha cancellato decine di
 *      param_key e la tariffa di partenza (base_rate) risulta ANCORA mancante
 *      nel periodo colpito. Il filtro "perdita netta" evita i falsi positivi
 *      del pattern normale delete+reinsert.
 *   B. HORIZON GAP — buco nella base_rate compilata (dati fino a data lontana
 *      ma con giorni vuoti in mezzo).
 *
 * Dedup: una riga per `dedup_key`. Gli alert si AUTO-RISOLVONO quando il
 * problema rientra (es. dopo un ripristino), cosi' il banner sparisce da solo.
 * L'email parte SOLO per alert nuovi o riaperti.
 */

import { type NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { getSuperAdminEmails } from "@/lib/email/get-superadmin-recipients"
import { requireCronAuth } from "@/lib/cron-auth"
import { sendEmail } from "@/lib/email"
import {
  detectMassDeletes,
  detectHorizonGaps,
  type MassDeleteFinding,
  type HorizonGapFinding,
} from "@/lib/pricing/integrity-check"
import { buildPricingIntegrityEmail } from "@/lib/email/templates/pricing-integrity-alert"

export const dynamic = "force-dynamic"
export const maxDuration = 120

/** Finestra di look-back sull'audit (ore). Leggermente > della frequenza cron
 *  per non perdere eventi ai bordi. Override con ?hours= per test manuali. */
const DEFAULT_LOOKBACK_HOURS = 6

function isoDate(d: Date): string {
  return d.toISOString().split("T")[0]
}

/**
 * Conta i giorni con base_rate presente per un hotel in [min,max] e calcola i
 * mancanti. Serve al filtro "perdita netta" dei mass delete.
 */
async function missingBaseRateInRange(
  supabase: any,
  hotelId: string,
  minDate: string,
  maxDate: string,
): Promise<number> {
  const present = new Set<string>()
  let offset = 0
  const pageSize = 1000
  for (;;) {
    const { data, error } = await supabase
      .from("pricing_algo_params")
      .select("date")
      .eq("hotel_id", hotelId)
      .eq("param_key", "base_rate")
      .gte("date", minDate)
      .lte("date", maxDate)
      .order("date", { ascending: true })
      .range(offset, offset + pageSize - 1)
    if (error) throw new Error(`base_rate range read failed: ${error.message}`)
    const chunk = (data || []) as Array<{ date: string }>
    for (const c of chunk) present.add(c.date)
    if (chunk.length < pageSize) break
    offset += pageSize
  }
  const start = new Date(minDate)
  const end = new Date(maxDate)
  let expected = 0
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) expected++
  return Math.max(0, expected - present.size)
}

export async function GET(request: NextRequest) {
  const unauthorized = requireCronAuth(request)
  if (unauthorized) return unauthorized

  console.log("[v0] [pricing-integrity] Starting integrity check")

  try {
    const supabase = await createServiceRoleClient()

    const url = new URL(request.url)
    const hoursParam = Number(url.searchParams.get("hours"))
    const lookbackHours =
      Number.isFinite(hoursParam) && hoursParam > 0 ? hoursParam : DEFAULT_LOOKBACK_HOURS
    const sinceIso = new Date(Date.now() - lookbackHours * 3_600_000).toISOString()
    // ?dry=1: esegue rilevamento + persistenza alert ma NON invia email.
    // Serve per verifiche manuali senza spammare i superadmin.
    const dryRun = url.searchParams.get("dry") === "1"

    // ── Rilevamento ────────────────────────────────────────────────────
    const [rawMassDeletes, horizonGaps] = await Promise.all([
      detectMassDeletes(supabase, sinceIso),
      detectHorizonGaps(supabase),
    ])

    // Risolvi i nomi hotel per i mass delete + filtra per PERDITA NETTA.
    const hotelIds = Array.from(
      new Set(rawMassDeletes.map((m) => m.hotelId).filter((x): x is string => !!x)),
    )
    const nameMap = new Map<string, string>()
    if (hotelIds.length > 0) {
      const { data: hotels } = await supabase
        .from("hotels")
        .select("id, name")
        .in("id", hotelIds)
      for (const h of (hotels || []) as Array<{ id: string; name: string }>) {
        nameMap.set(h.id, h.name)
      }
    }

    const massDeletes: MassDeleteFinding[] = []
    for (const m of rawMassDeletes) {
      m.hotelName = m.hotelId ? nameMap.get(m.hotelId) ?? null : null
      // Filtro perdita netta: base_rate ancora mancante nel periodo colpito.
      if (m.hotelId && m.dateRange.min && m.dateRange.max) {
        const missing = await missingBaseRateInRange(
          supabase,
          m.hotelId,
          m.dateRange.min,
          m.dateRange.max,
        )
        if (missing > 0) massDeletes.push(m)
      }
    }

    // ── Costruisci i dedup_key correnti ─────────────────────────────────
    const dedupKey = (kind: string, hid: string | null, extra: string) =>
      `${kind}:${hid ?? "null"}:${extra}`

    type PendingAlert = {
      dedup_key: string
      kind: "mass_delete" | "horizon_gap"
      hotel_id: string | null
      hotel_name: string | null
      detail: Record<string, unknown>
    }

    const pending: PendingAlert[] = []
    for (const m of massDeletes) {
      pending.push({
        dedup_key: dedupKey("mass_delete", m.hotelId, m.txid),
        kind: "mass_delete",
        hotel_id: m.hotelId,
        hotel_name: m.hotelName,
        detail: {
          txid: m.txid,
          deletedRows: m.deletedRows,
          distinctKeys: m.distinctKeys,
          sampleKeys: m.sampleKeys,
          dateRange: m.dateRange,
          ts: m.ts,
          sessionUser: m.sessionUser,
          applicationName: m.applicationName,
          clientAddr: m.clientAddr,
        },
      })
    }
    for (const g of horizonGaps) {
      pending.push({
        dedup_key: dedupKey("horizon_gap", g.hotelId, "base_rate"),
        kind: "horizon_gap",
        hotel_id: g.hotelId,
        hotel_name: g.hotelName,
        detail: {
          maxDate: g.maxDate,
          presentDays: g.presentDays,
          expectedDays: g.expectedDays,
          missingDays: g.missingDays,
          missingRanges: g.missingRanges,
        },
      })
    }

    const currentKeys = new Set(pending.map((p) => p.dedup_key))

    // ── Stato esistente (open + resolved) per le chiavi correnti ────────
    const { data: existingRows } = await supabase
      .from("pricing_integrity_alerts")
      .select("id, dedup_key, resolved_at")
      .in(
        "dedup_key",
        pending.length > 0 ? pending.map((p) => p.dedup_key) : ["__none__"],
      )
    const existingByKey = new Map<string, { id: string; resolved_at: string | null }>()
    for (const r of (existingRows || []) as Array<{
      id: string
      dedup_key: string
      resolved_at: string | null
    }>) {
      existingByKey.set(r.dedup_key, { id: r.id, resolved_at: r.resolved_at })
    }

    const nowIso = new Date().toISOString()
    const newMassDeletes: MassDeleteFinding[] = []
    const newHorizonGaps: HorizonGapFinding[] = []

    // ── Upsert / reopen ─────────────────────────────────────────────────
    for (const p of pending) {
      const existing = existingByKey.get(p.dedup_key)
      const isNew = !existing || existing.resolved_at !== null
      if (!existing) {
        await supabase.from("pricing_integrity_alerts").insert({
          dedup_key: p.dedup_key,
          kind: p.kind,
          hotel_id: p.hotel_id,
          hotel_name: p.hotel_name,
          severity: "critical",
          detail: p.detail,
          detected_at: nowIso,
          updated_at: nowIso,
        })
      } else {
        await supabase
          .from("pricing_integrity_alerts")
          .update({
            hotel_name: p.hotel_name,
            detail: p.detail,
            updated_at: nowIso,
            ...(existing.resolved_at !== null
              ? { resolved_at: null, resolved_by: null, detected_at: nowIso }
              : {}),
          })
          .eq("id", existing.id)
      }
      if (isNew) {
        if (p.kind === "mass_delete") {
          const f = massDeletes.find((m) => dedupKey("mass_delete", m.hotelId, m.txid) === p.dedup_key)
          if (f) newMassDeletes.push(f)
        } else {
          const f = horizonGaps.find((g) => dedupKey("horizon_gap", g.hotelId, "base_rate") === p.dedup_key)
          if (f) newHorizonGaps.push(f)
        }
      }
    }

    // ── Auto-risoluzione: alert aperti non piu' presenti tra i findings ──
    const { data: openRows } = await supabase
      .from("pricing_integrity_alerts")
      .select("id, dedup_key")
      .is("resolved_at", null)
    let autoResolved = 0
    for (const r of (openRows || []) as Array<{ id: string; dedup_key: string }>) {
      if (!currentKeys.has(r.dedup_key)) {
        await supabase
          .from("pricing_integrity_alerts")
          .update({ resolved_at: nowIso, resolved_by: "auto", updated_at: nowIso })
          .eq("id", r.id)
        autoResolved++
      }
    }

    // ── Email (solo per alert nuovi o riaperti) ─────────────────────────
    const newTotal = newMassDeletes.length + newHorizonGaps.length
    let emailSent = false
    if (newTotal > 0 && !dryRun) {
      const recipients = await getSuperAdminEmails()
      const appUrl =
        process.env.NEXT_PUBLIC_APP_URL ||
        (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "https://www.santaddeo.com")
      const { subject, html, text } = buildPricingIntegrityEmail({
        massDeletes: newMassDeletes,
        horizonGaps: newHorizonGaps,
        appUrl,
        reportDateIso: nowIso,
      })
      const sendResult = await sendEmail({
        to: recipients,
        subject,
        html,
        type: "pricing_integrity_alert",
        metadata: {
          mass_deletes: newMassDeletes.length,
          horizon_gaps: newHorizonGaps.length,
          text_preview: text.slice(0, 200),
        },
      })
      emailSent = sendResult.success
      // Marca notified_at sugli alert nuovi.
      if (sendResult.success) {
        const notifiedKeys = [
          ...newMassDeletes.map((m) => dedupKey("mass_delete", m.hotelId, m.txid)),
          ...newHorizonGaps.map((g) => dedupKey("horizon_gap", g.hotelId, "base_rate")),
        ]
        await supabase
          .from("pricing_integrity_alerts")
          .update({ notified_at: nowIso })
          .in("dedup_key", notifiedKeys)
      }
    }

    console.log("[v0] [pricing-integrity] Done:", {
      massDeletes: massDeletes.length,
      horizonGaps: horizonGaps.length,
      newAlerts: newTotal,
      autoResolved,
      emailSent,
    })

    return NextResponse.json({
      success: true,
      timestamp: nowIso,
      lookback_hours: lookbackHours,
      mass_deletes: massDeletes.length,
      horizon_gaps: horizonGaps.length,
      new_alerts: newTotal,
      auto_resolved: autoResolved,
      email_sent: emailSent,
    })
  } catch (error) {
    console.error("[v0] [pricing-integrity] Error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 },
    )
  }
}
