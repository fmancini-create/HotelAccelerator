import { sendEmail } from "@/lib/email"
import { createServiceRoleClient } from "@/lib/supabase/server"

const BASE_URL =
  process.env.NEXT_PUBLIC_APP_URL || "https://www.santaddeo.com"

interface ExpiredAssignment {
  prospect_id: string
  prospect_name: string
  agent_id: string
  agent_display_name: string | null
  agent_user_id: string | null
  agent_email: string | null
  parent_agent_id: string | null
  expires_at: string | null
}

/**
 * Spedisce le email post-scadenza a venditore, capo area, super-admin.
 * Fire-and-forget: ogni errore di invio singolo viene loggato ma non blocca
 * il resto del batch.
 *
 * Audit: ogni send passa per sendEmail() -> email_logs (type='prospect_expired')
 * quindi il super-admin puo' verificare retrospettivamente in /superadmin/email-logs.
 */
export async function notifyExpiredAssignments(rows: ExpiredAssignment[]): Promise<void> {
  if (rows.length === 0) return

  const service = await createServiceRoleClient()

  // Aggrega per agente: una sola email anche se ha piu' prospect scaduti
  const byAgent = new Map<string, ExpiredAssignment[]>()
  for (const r of rows) {
    const list = byAgent.get(r.agent_id) ?? []
    list.push(r)
    byAgent.set(r.agent_id, list)
  }

  // Collect parent agent ids per email capo area
  const parentIds = Array.from(new Set(rows.map((r) => r.parent_agent_id).filter((x): x is string => !!x)))
  let parentMap = new Map<string, { display_name: string | null; email: string | null }>()
  if (parentIds.length > 0) {
    const { data: parents } = await service
      .from("sales_agents")
      .select("id, display_name, email")
      .in("id", parentIds)
    for (const p of parents ?? []) {
      parentMap.set(p.id, { display_name: p.display_name, email: p.email })
    }
  }

  // Email super-admin: prendi tutti i super_admin attivi.
  const { data: admins } = await service
    .from("profiles")
    .select("email, is_active")
    .eq("role", "super_admin")
  const adminEmails = (admins ?? [])
    .filter((a) => a.is_active && a.email)
    .map((a) => a.email as string)

  for (const [agentId, prospects] of byAgent) {
    const first = prospects[0]
    const agentName = first.agent_display_name ?? "Venditore"

    const list = prospects
      .map((p) => `<li><strong>${escapeHtml(p.prospect_name)}</strong></li>`)
      .join("")

    const html = baseEmailTemplate({
      title: "Assegnazioni prospect scadute",
      bodyHtml: `
        <p>Ciao ${escapeHtml(agentName)},</p>
        <p>${prospects.length === 1 ? "Un prospect" : `${prospects.length} prospect`} a te assegnati
        ${prospects.length === 1 ? "ha" : "hanno"} superato la data di scadenza dell'assegnazione
        e ${prospects.length === 1 ? "e' tornato disponibile" : "sono tornati disponibili"} per altri
        venditori.</p>
        <ul>${list}</ul>
        <p>Se vuoi riprenderne uno contatta il super-admin.</p>
      `,
      ctaLabel: "Vai a Prospect",
      ctaUrl: `${BASE_URL}/sales/prospects`,
    })

    // 1) Email all'agente
    if (first.agent_email) {
      try {
        await sendEmail({
          to: first.agent_email,
          subject: `Assegnazione scaduta: ${prospects.length} prospect${prospects.length > 1 ? "" : ""}`,
          html,
          type: "prospect_expired_agent",
          userId: first.agent_user_id ?? undefined,
          metadata: { agent_id: agentId, prospect_ids: prospects.map((p) => p.prospect_id) },
        })
      } catch (err) {
        console.error("[prospect-expiry-notifier] send to agent failed:", err)
      }
    }

    // 2) Email al capo area (se presente)
    if (first.parent_agent_id) {
      const parent = parentMap.get(first.parent_agent_id)
      if (parent?.email) {
        const htmlParent = baseEmailTemplate({
          title: "Assegnazioni scadute nel tuo team",
          bodyHtml: `
            <p>Ciao ${escapeHtml(parent.display_name ?? "")},</p>
            <p>${prospects.length === 1 ? "Un prospect" : `${prospects.length} prospect`} assegnati
            a <strong>${escapeHtml(agentName)}</strong> ${prospects.length === 1 ? "e' scaduto" : "sono scaduti"}
            e ${prospects.length === 1 ? "e' tornato disponibile" : "sono tornati disponibili"}.</p>
            <ul>${list}</ul>
          `,
          ctaLabel: "Vai al tuo team",
          ctaUrl: `${BASE_URL}/sales/team/${agentId}`,
        })
        try {
          await sendEmail({
            to: parent.email,
            subject: `Team: ${prospects.length} prospect scadut${prospects.length > 1 ? "i" : "o"}`,
            html: htmlParent,
            type: "prospect_expired_area_manager",
            metadata: { area_manager_id: first.parent_agent_id, agent_id: agentId },
          })
        } catch (err) {
          console.error("[prospect-expiry-notifier] send to area manager failed:", err)
        }
      }
    }
  }

  // 3) Una sola email aggregata al super-admin con tutti i casi
  if (adminEmails.length > 0) {
    const adminRows = rows
      .map(
        (r) =>
          `<tr>
            <td style="padding:6px 12px;border-bottom:1px solid #eee">${escapeHtml(r.prospect_name)}</td>
            <td style="padding:6px 12px;border-bottom:1px solid #eee">${escapeHtml(r.agent_display_name ?? "")}</td>
            <td style="padding:6px 12px;border-bottom:1px solid #eee;color:#9ca3af;font-size:12px">${r.expires_at ? new Date(r.expires_at).toLocaleString("it-IT") : ""}</td>
          </tr>`,
      )
      .join("")
    const htmlAdmin = baseEmailTemplate({
      title: "Prospect: assegnazioni scadute",
      bodyHtml: `
        <p>${rows.length} assegnazion${rows.length === 1 ? "e e' tornata disponibile" : "i sono tornate disponibili"}
        a seguito di scadenza temporale.</p>
        <table style="width:100%;border-collapse:collapse;font-size:14px;margin-top:12px">
          <thead><tr style="background:#f9fafb">
            <th align="left" style="padding:6px 12px;border-bottom:1px solid #e5e7eb">Prospect</th>
            <th align="left" style="padding:6px 12px;border-bottom:1px solid #e5e7eb">Agente</th>
            <th align="left" style="padding:6px 12px;border-bottom:1px solid #e5e7eb">Scadenza</th>
          </tr></thead>
          <tbody>${adminRows}</tbody>
        </table>
      `,
      ctaLabel: "Apri pannello assegnazioni",
      ctaUrl: `${BASE_URL}/superadmin/prospects/assignments`,
    })
    try {
      await sendEmail({
        to: adminEmails,
        subject: `[Santaddeo] ${rows.length} prospect tornati disponibili`,
        html: htmlAdmin,
        type: "prospect_expired_admin",
        metadata: { count: rows.length },
      })
    } catch (err) {
      console.error("[prospect-expiry-notifier] send to super-admin failed:", err)
    }
  }
}

function escapeHtml(s: string | null | undefined): string {
  if (!s) return ""
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function baseEmailTemplate(opts: {
  title: string
  bodyHtml: string
  ctaLabel: string
  ctaUrl: string
}): string {
  return `<!doctype html>
<html><body style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;background:#f9fafb;margin:0;padding:24px">
  <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;border:1px solid #e5e7eb">
    <h1 style="margin:0 0 16px 0;font-size:20px;color:#111827">${escapeHtml(opts.title)}</h1>
    <div style="color:#374151;font-size:14px;line-height:1.6">${opts.bodyHtml}</div>
    <div style="margin-top:24px">
      <a href="${opts.ctaUrl}" style="display:inline-block;background:#d97706;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600">${escapeHtml(opts.ctaLabel)}</a>
    </div>
    <p style="margin-top:32px;color:#9ca3af;font-size:12px">SANTADDEO &mdash; Email automatica. Non rispondere.</p>
  </div>
</body></html>`
}
