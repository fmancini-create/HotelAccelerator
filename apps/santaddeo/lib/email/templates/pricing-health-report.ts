/**
 * Email template for the daily pricing health report sent to superadmins.
 *
 * Triggered by /api/cron/pricing-health when at least one anomaly is found
 * in: coverage gaps, stalled queue items, permanent push failures, or
 * pending changes older than 6 hours.
 *
 * Style is intentionally similar to lib/pricing/autopilot-email.ts so the
 * brand identity is consistent and SpamAssassin score stays stable
 * (UPPERCASE rules, table-based layout, escapeHtml everywhere).
 */

import type { HotelCoverageReport } from "@/lib/pricing/coverage-report"

export interface PricingHealthAnomalies {
  /** Hotels with coverage_pct < 95% (warning or critical). */
  coverageIssues: HotelCoverageReport[]
  /** Pending pricing_recalc_queue items older than the threshold. */
  stalledQueueItems: Array<{
    hotel_id: string
    hotel_name: string | null
    age_hours: number
    pending_count: number
  }>
  /** Permanently failed pushes (retry_count >= 5 or next_retry_at NULL). */
  permanentFailures: Array<{
    hotel_id: string
    hotel_name: string | null
    failed_count: number
    last_error: string | null
  }>
  /** price_change_log rows still at action_taken='none' after 6 hours. */
  oldPendingChanges: Array<{
    hotel_id: string
    hotel_name: string | null
    pending_count: number
    oldest_age_hours: number
  }>
}

export interface PricingHealthEmailArgs {
  anomalies: PricingHealthAnomalies
  appUrl: string
  reportDateIso: string
}

export function buildPricingHealthEmail(args: PricingHealthEmailArgs): {
  subject: string
  html: string
  text: string
} {
  const { anomalies, appUrl, reportDateIso } = args
  const reportDate = new Date(reportDateIso).toLocaleDateString("it-IT", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  })

  const totalIssues =
    anomalies.coverageIssues.length +
    anomalies.stalledQueueItems.length +
    anomalies.permanentFailures.length +
    anomalies.oldPendingChanges.length

  const subject = `[Santaddeo] Pricing health: ${totalIssues} ${
    totalIssues === 1 ? "anomalia rilevata" : "anomalie rilevate"
  }`

  const sections: string[] = []

  // SECTION 1: Coverage issues
  if (anomalies.coverageIssues.length > 0) {
    const rows = anomalies.coverageIssues
      .map((r) => {
        const statusColor =
          r.health.status === "critical" ? "#dc2626" : "#f59e0b"
        const sample = r.missing.sample_dates.slice(0, 5).join(", ")
        return `<tr>
          <td style="padding:8px 12px;border-bottom:1px solid #eee">${escapeHtml(r.hotel.name)}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center;color:${statusColor};font-weight:600">${r.health.coverage_pct}%</td>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center">${r.missing.count}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #eee">${escapeHtml(r.autopilot.mode)}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;font-size:12px;color:#666">${escapeHtml(sample)}${r.missing.count > 5 ? "..." : ""}</td>
        </tr>`
      })
      .join("")

    sections.push(`
      <h2 style="color:#1e3a5f;margin:24px 0 8px;font-size:18px">Copertura insufficiente</h2>
      <p style="margin:0 0 12px;color:#475569">Hotel con percentuale di copertura prezzi inferiore al 95%. La coverage misura quante date future della pricing_grid sono state effettivamente inviate al PMS.</p>
      <table style="width:100%;border-collapse:collapse;background:white;border-radius:6px;overflow:hidden;border:1px solid #e2e8f0">
        <thead>
          <tr style="background:#f1f5f9">
            <th style="padding:8px 12px;text-align:left;font-size:13px;color:#1e3a5f">Hotel</th>
            <th style="padding:8px 12px;text-align:center;font-size:13px;color:#1e3a5f">Copertura</th>
            <th style="padding:8px 12px;text-align:center;font-size:13px;color:#1e3a5f">Date mancanti</th>
            <th style="padding:8px 12px;text-align:left;font-size:13px;color:#1e3a5f">Modalita</th>
            <th style="padding:8px 12px;text-align:left;font-size:13px;color:#1e3a5f">Esempio date</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `)
  }

  // SECTION 2: Stalled queue
  if (anomalies.stalledQueueItems.length > 0) {
    const rows = anomalies.stalledQueueItems
      .map(
        (i) => `<tr>
          <td style="padding:8px 12px;border-bottom:1px solid #eee">${escapeHtml(i.hotel_name || i.hotel_id)}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center">${i.pending_count}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center;color:#dc2626">${i.age_hours.toFixed(1)}h</td>
        </tr>`,
      )
      .join("")

    sections.push(`
      <h2 style="color:#1e3a5f;margin:24px 0 8px;font-size:18px">Coda ricalcoli in stallo</h2>
      <p style="margin:0 0 12px;color:#475569">Items in <code>pricing_recalc_queue</code> con status=<code>pending</code> da piu di 2 ore. Indica un cron che non sta drenando o errori bloccanti nel queue processor.</p>
      <table style="width:100%;border-collapse:collapse;background:white;border-radius:6px;overflow:hidden;border:1px solid #e2e8f0">
        <thead>
          <tr style="background:#f1f5f9">
            <th style="padding:8px 12px;text-align:left;font-size:13px;color:#1e3a5f">Hotel</th>
            <th style="padding:8px 12px;text-align:center;font-size:13px;color:#1e3a5f">Items pendenti</th>
            <th style="padding:8px 12px;text-align:center;font-size:13px;color:#1e3a5f">Ultima eta</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `)
  }

  // SECTION 3: Permanent failures
  if (anomalies.permanentFailures.length > 0) {
    const rows = anomalies.permanentFailures
      .map(
        (f) => `<tr>
          <td style="padding:8px 12px;border-bottom:1px solid #eee">${escapeHtml(f.hotel_name || f.hotel_id)}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center;color:#dc2626;font-weight:600">${f.failed_count}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;font-size:12px;color:#666;font-family:monospace">${escapeHtml((f.last_error || "—").slice(0, 120))}</td>
        </tr>`,
      )
      .join("")

    sections.push(`
      <h2 style="color:#1e3a5f;margin:24px 0 8px;font-size:18px">Push falliti permanentemente</h2>
      <p style="margin:0 0 12px;color:#475569">Righe in <code>price_change_log</code> con <code>action_taken=none</code> e budget retry esaurito (5 tentativi). Richiede investigazione manuale: tipicamente PMS irraggiungibile, credenziali scadute o mappature rotte.</p>
      <table style="width:100%;border-collapse:collapse;background:white;border-radius:6px;overflow:hidden;border:1px solid #e2e8f0">
        <thead>
          <tr style="background:#f1f5f9">
            <th style="padding:8px 12px;text-align:left;font-size:13px;color:#1e3a5f">Hotel</th>
            <th style="padding:8px 12px;text-align:center;font-size:13px;color:#1e3a5f">Righe fallite</th>
            <th style="padding:8px 12px;text-align:left;font-size:13px;color:#1e3a5f">Ultimo errore</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `)
  }

  // SECTION 4: Old pending changes (canary)
  if (anomalies.oldPendingChanges.length > 0) {
    const rows = anomalies.oldPendingChanges
      .map(
        (p) => `<tr>
          <td style="padding:8px 12px;border-bottom:1px solid #eee">${escapeHtml(p.hotel_name || p.hotel_id)}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center">${p.pending_count}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center">${p.oldest_age_hours.toFixed(1)}h</td>
        </tr>`,
      )
      .join("")

    sections.push(`
      <h2 style="color:#1e3a5f;margin:24px 0 8px;font-size:18px">Modifiche in attesa da molto tempo</h2>
      <p style="margin:0 0 12px;color:#475569">Variazioni in <code>price_change_log</code> ancora con <code>action_taken=none</code> dopo 6 ore. Possibile causa: trigger autopilot non scattato (es. mode=disabled), o filtro source che non matcha.</p>
      <table style="width:100%;border-collapse:collapse;background:white;border-radius:6px;overflow:hidden;border:1px solid #e2e8f0">
        <thead>
          <tr style="background:#f1f5f9">
            <th style="padding:8px 12px;text-align:left;font-size:13px;color:#1e3a5f">Hotel</th>
            <th style="padding:8px 12px;text-align:center;font-size:13px;color:#1e3a5f">Pendenti</th>
            <th style="padding:8px 12px;text-align:center;font-size:13px;color:#1e3a5f">Eta piu vecchia</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `)
  }

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Santaddeo - Pricing Health Report</title>
    </head>
    <body style="margin:0;padding:24px;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#0f172a">
      <div style="max-width:760px;margin:0 auto;background:white;border-radius:8px;padding:32px;box-shadow:0 1px 3px rgba(0,0,0,0.06)">
        <!-- Brand header: logo Santaddeo affiancato al titolo, separato
             dal contenuto da una linea navy come prima. -->
        <div style="border-bottom:2px solid #1e3a5f;padding-bottom:12px;margin-bottom:20px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
            <tr>
              <td style="vertical-align:middle;padding-right:16px;width:1%;white-space:nowrap">
                <img src="${appUrl}/logo-santaddeo.png" alt="Santaddeo" style="height:40px;width:auto;display:block" />
              </td>
              <td style="vertical-align:middle">
                <h1 style="color:#1e3a5f;margin:0;font-size:22px">Pricing Health Report</h1>
                <p style="color:#64748b;margin:4px 0 0;font-size:13px">${escapeHtml(reportDate)}</p>
              </td>
            </tr>
          </table>
        </div>

        <p style="margin:0 0 16px;font-size:15px">Sono state rilevate <strong>${totalIssues}</strong> ${
          totalIssues === 1 ? "anomalia" : "anomalie"
        } nel pipeline di pricing nelle ultime 24 ore. Dettaglio sotto.</p>

        ${sections.join("")}

        <div style="margin-top:32px;padding:16px;background:#f1f5f9;border-radius:6px;font-size:13px;color:#475569">
          <p style="margin:0 0 8px"><strong>Link rapidi</strong></p>
          <p style="margin:0">
            <a href="${appUrl}/superadmin/pricing-log" style="color:#1e3a5f">Pricing log</a> &nbsp;&middot;&nbsp;
            <a href="${appUrl}/superadmin/connectors-health" style="color:#1e3a5f">Connectors health</a> &nbsp;&middot;&nbsp;
            <a href="${appUrl}/superadmin/push-prices" style="color:#1e3a5f">Push prezzi range</a>
          </p>
        </div>

        <p style="margin:24px 0 0;font-size:11px;color:#94a3b8;text-align:center">
          Email automatica generata dal cron <code>/api/cron/pricing-health</code>. Frequenza: giornaliera, solo se ci sono anomalie.
        </p>
      </div>
    </body>
    </html>
  `

  // Plain-text fallback for clients that don't render HTML.
  const text = [
    `Santaddeo - Pricing Health Report (${reportDate})`,
    "",
    `Anomalie rilevate: ${totalIssues}`,
    "",
    anomalies.coverageIssues.length > 0
      ? `Copertura insufficiente: ${anomalies.coverageIssues.length} hotel`
      : null,
    anomalies.stalledQueueItems.length > 0
      ? `Coda ricalcoli in stallo: ${anomalies.stalledQueueItems.length} hotel`
      : null,
    anomalies.permanentFailures.length > 0
      ? `Push falliti permanentemente: ${anomalies.permanentFailures.length} hotel`
      : null,
    anomalies.oldPendingChanges.length > 0
      ? `Modifiche pendenti da >6h: ${anomalies.oldPendingChanges.length} hotel`
      : null,
    "",
    `Apri il pricing log: ${appUrl}/superadmin/pricing-log`,
  ]
    .filter(Boolean)
    .join("\n")

  return { subject, html, text }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;")
}
