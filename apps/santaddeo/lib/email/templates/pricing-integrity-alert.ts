/**
 * Email template per l'ALLERTA di integrita' pricing (cron pricing-integrity).
 *
 * Distinta dal "pricing health report" giornaliero: questa parte in QUASI
 * tempo reale quando viene rilevato un evento GRAVE che fa sparire i prezzi:
 *   - MASS DELETE: cancellazione di massa di parametri (firma del wipe).
 *   - HORIZON GAP: buco nell'orizzonte della tariffa di partenza.
 *
 * Stile allineato a pricing-health-report.ts (layout a tabella, escapeHtml,
 * header brand) per coerenza e deliverability.
 */

import type {
  MassDeleteFinding,
  HorizonGapFinding,
} from "@/lib/pricing/integrity-check"

export interface PricingIntegrityEmailArgs {
  massDeletes: MassDeleteFinding[]
  horizonGaps: HorizonGapFinding[]
  appUrl: string
  reportDateIso: string
}

export function buildPricingIntegrityEmail(args: PricingIntegrityEmailArgs): {
  subject: string
  html: string
  text: string
} {
  const { massDeletes, horizonGaps, appUrl, reportDateIso } = args
  const when = new Date(reportDateIso).toLocaleString("it-IT", {
    dateStyle: "medium",
    timeStyle: "short",
  })

  const total = massDeletes.length + horizonGaps.length
  const subject = `[Santaddeo] ALLERTA pricing: ${total} ${
    total === 1 ? "anomalia critica" : "anomalie critiche"
  } sui prezzi`

  const sections: string[] = []

  if (massDeletes.length > 0) {
    const rows = massDeletes
      .map(
        (m) => `<tr>
          <td style="padding:8px 12px;border-bottom:1px solid #eee">${escapeHtml(m.hotelName || m.hotelId || "?")}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center;color:#dc2626;font-weight:700">${m.deletedRows}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center">${m.distinctKeys}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;font-size:12px;color:#666">${escapeHtml(m.dateRange.min || "?")} &rarr; ${escapeHtml(m.dateRange.max || "?")}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;font-size:12px;color:#666">${escapeHtml(m.applicationName || "?")}${m.clientAddr ? " / " + escapeHtml(m.clientAddr) : ""}</td>
        </tr>`,
      )
      .join("")

    sections.push(`
      <h2 style="color:#991b1b;margin:24px 0 8px;font-size:18px">Cancellazione di massa parametri (perdita dati confermata)</h2>
      <p style="margin:0 0 12px;color:#475569">Una o piu' transazioni hanno cancellato decine di parametri di pricing e i dati risultano <strong>ancora mancanti</strong> (perdita netta). E' la firma del bug "wipe" della griglia. Reinserire i parametri o ripristinare dall'audit log.</p>
      <table style="width:100%;border-collapse:collapse;background:white;border-radius:6px;overflow:hidden;border:1px solid #e2e8f0">
        <thead><tr style="background:#fef2f2">
          <th style="padding:8px 12px;text-align:left;font-size:13px;color:#991b1b">Hotel</th>
          <th style="padding:8px 12px;text-align:center;font-size:13px;color:#991b1b">Righe cancellate</th>
          <th style="padding:8px 12px;text-align:center;font-size:13px;color:#991b1b">Chiavi</th>
          <th style="padding:8px 12px;text-align:left;font-size:13px;color:#991b1b">Periodo</th>
          <th style="padding:8px 12px;text-align:left;font-size:13px;color:#991b1b">Origine</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `)
  }

  if (horizonGaps.length > 0) {
    const rows = horizonGaps
      .map((g) => {
        const ranges = g.missingRanges
          .map((r) => (r.from === r.to ? r.from : `${r.from}&rarr;${r.to}`))
          .join(", ")
        return `<tr>
          <td style="padding:8px 12px;border-bottom:1px solid #eee">${escapeHtml(g.hotelName || g.hotelId)}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center;color:#dc2626;font-weight:700">${g.missingDays}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center">${g.presentDays}/${g.expectedDays}</td>
          <td style="padding:8px 12px;border-bottom:1px solid #eee;font-size:12px;color:#666">${escapeHtml(ranges)}</td>
        </tr>`
      })
      .join("")

    sections.push(`
      <h2 style="color:#991b1b;margin:24px 0 8px;font-size:18px">Buchi nella tariffa di partenza</h2>
      <p style="margin:0 0 12px;color:#475569">Hotel con la tariffa di partenza (base_rate) compilata fino a una data lontana ma con giorni MANCANTI in mezzo. Su quei giorni il motore non calcola e non pusha prezzi.</p>
      <table style="width:100%;border-collapse:collapse;background:white;border-radius:6px;overflow:hidden;border:1px solid #e2e8f0">
        <thead><tr style="background:#fef2f2">
          <th style="padding:8px 12px;text-align:left;font-size:13px;color:#991b1b">Hotel</th>
          <th style="padding:8px 12px;text-align:center;font-size:13px;color:#991b1b">Giorni mancanti</th>
          <th style="padding:8px 12px;text-align:center;font-size:13px;color:#991b1b">Copertura</th>
          <th style="padding:8px 12px;text-align:left;font-size:13px;color:#991b1b">Intervalli vuoti</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    `)
  }

  const html = `
    <!DOCTYPE html>
    <html><head><meta charset="utf-8"><title>Santaddeo - Allerta Pricing</title></head>
    <body style="margin:0;padding:24px;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#0f172a">
      <div style="max-width:760px;margin:0 auto;background:white;border-radius:8px;padding:32px;box-shadow:0 1px 3px rgba(0,0,0,0.06)">
        <div style="border-bottom:3px solid #dc2626;padding-bottom:12px;margin-bottom:20px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr>
            <td style="vertical-align:middle;padding-right:16px;width:1%;white-space:nowrap">
              <img src="${appUrl}/logo-santaddeo.png" alt="Santaddeo" style="height:40px;width:auto;display:block" />
            </td>
            <td style="vertical-align:middle">
              <h1 style="color:#991b1b;margin:0;font-size:22px">Allerta integrita' pricing</h1>
              <p style="color:#64748b;margin:4px 0 0;font-size:13px">${escapeHtml(when)}</p>
            </td>
          </tr></table>
        </div>
        <p style="margin:0 0 16px;font-size:15px">Rilevate <strong>${total}</strong> ${
          total === 1 ? "anomalia critica" : "anomalie critiche"
        } che stanno facendo sparire prezzi/parametri. Intervenire il prima possibile.</p>
        ${sections.join("")}
        <div style="margin-top:32px;padding:16px;background:#f1f5f9;border-radius:6px;font-size:13px;color:#475569">
          <p style="margin:0 0 8px"><strong>Link rapidi</strong></p>
          <p style="margin:0">
            <a href="${appUrl}/superadmin/pricing-params-audit" style="color:#1e3a5f">Audit parametri</a> &nbsp;&middot;&nbsp;
            <a href="${appUrl}/superadmin/pricing-log" style="color:#1e3a5f">Pricing log</a> &nbsp;&middot;&nbsp;
            <a href="${appUrl}/superadmin" style="color:#1e3a5f">Dashboard</a>
          </p>
        </div>
        <p style="margin:24px 0 0;font-size:11px;color:#94a3b8;text-align:center">
          Allerta automatica dal cron <code>/api/cron/pricing-integrity</code>. Inviata solo quando c'e' una perdita dati confermata.
        </p>
      </div>
    </body></html>
  `

  const text = [
    `Santaddeo - ALLERTA integrita' pricing (${when})`,
    "",
    `Anomalie critiche: ${total}`,
    massDeletes.length > 0
      ? `Cancellazioni di massa (perdita netta): ${massDeletes.length} — ${massDeletes.map((m) => m.hotelName || m.hotelId).join(", ")}`
      : null,
    horizonGaps.length > 0
      ? `Buchi tariffa di partenza: ${horizonGaps.length} — ${horizonGaps.map((g) => `${g.hotelName || g.hotelId} (${g.missingDays}gg)`).join(", ")}`
      : null,
    "",
    `Audit parametri: ${appUrl}/superadmin/pricing-params-audit`,
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
