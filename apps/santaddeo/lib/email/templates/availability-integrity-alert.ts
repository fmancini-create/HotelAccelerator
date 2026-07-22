// Template email per gli alert di integrità DISPONIBILITÀ (DB vs PMS).
// Speculare a pricing-integrity-alert, adattato alla disponibilità.

import type { AvailabilityIntegrityIssue } from "@/lib/availability/integrity-check"

const KIND_LABEL: Record<string, string> = {
  scidoo_stale_near_term: "Disponibilità Scidoo non aggiornata (backlog near-term)",
  derived_missing_near_term: "Disponibilità mancante oggi su tipologia venduta",
  scidoo_fetch_stale: "Fetch Scidoo fermo (rate-limit 429?) — disponibilità NON aggiornata",
}

export function buildAvailabilityIntegrityEmail(params: {
  issues: AvailabilityIntegrityIssue[]
  repaired: Array<{ hotelId: string; kind: string; rowsReprocessed: number }>
  appUrl: string
  reportDateIso: string
}): { subject: string; html: string; text: string } {
  const { issues, repaired, appUrl, reportDateIso } = params
  const date = new Date(reportDateIso).toLocaleString("it-IT", { timeZone: "Europe/Rome" })
  const repairedByHotel = new Map(repaired.map((r) => [`${r.hotelId}:${r.kind}`, r.rowsReprocessed]))

  const subject = `[Santaddeo] Allerta disponibilità: ${issues.length} disallineamento/i DB vs PMS`

  const rows = issues
    .map((i) => {
      const fixed = repairedByHotel.get(`${i.hotelId}:${i.kind}`)
      const fixedTxt =
        fixed != null
          ? `<span style="color:#15803d">auto-riparato (${fixed} righe riprocessate)</span>`
          : `<span style="color:#b91c1c">richiede verifica</span>`
      return `<tr>
        <td style="padding:8px;border-bottom:1px solid #eee">${i.hotelName}</td>
        <td style="padding:8px;border-bottom:1px solid #eee">${KIND_LABEL[i.kind] || i.kind}</td>
        <td style="padding:8px;border-bottom:1px solid #eee">${fixedTxt}</td>
      </tr>`
    })
    .join("")

  const html = `
  <div style="font-family:system-ui,-apple-system,sans-serif;max-width:640px;margin:0 auto">
    <h2 style="color:#111">Allerta integrità disponibilità</h2>
    <p style="color:#444">Rilevati <strong>${issues.length}</strong> disallineamenti tra la
    disponibilità mostrata in dashboard e il dato reale del PMS (${date}).</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px">
      <thead><tr>
        <th style="text-align:left;padding:8px;border-bottom:2px solid #ddd">Struttura</th>
        <th style="text-align:left;padding:8px;border-bottom:2px solid #ddd">Problema</th>
        <th style="text-align:left;padding:8px;border-bottom:2px solid #ddd">Stato</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <p style="margin-top:16px">
      <a href="${appUrl}/superadmin/connectors-health"
         style="background:#111;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">
        Apri Connectors Health
      </a>
    </p>
    <p style="color:#888;font-size:12px">Gli alert auto-riparati si risolvono da soli quando il
    dato rientra. Questa email parte solo per alert nuovi.</p>
  </div>`

  const text =
    `Allerta integrità disponibilità (${date})\n` +
    `${issues.length} disallineamenti DB vs PMS:\n` +
    issues
      .map((i) => {
        const fixed = repairedByHotel.get(`${i.hotelId}:${i.kind}`)
        return `- ${i.hotelName}: ${KIND_LABEL[i.kind] || i.kind} ${fixed != null ? `(auto-riparato, ${fixed} righe)` : "(richiede verifica)"}`
      })
      .join("\n") +
    `\n\nDettagli: ${appUrl}/superadmin/connectors-health`

  return { subject, html, text }
}
