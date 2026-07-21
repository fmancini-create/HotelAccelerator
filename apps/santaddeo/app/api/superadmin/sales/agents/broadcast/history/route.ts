import { NextResponse } from "next/server"
import { requireSuperadmin } from "@/lib/sales/superadmin-guard"
import { createServiceRoleClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

/**
 * GET /api/superadmin/sales/agents/broadcast/history
 *
 * Storico delle comunicazioni inviate ai venditori. Legge da `email_audit_log`
 * (email_type = "sales_agent_broadcast"): ogni riga = una copia individuale a
 * un venditore. Le righe vengono raggruppate per "invio" (stesso oggetto +
 * mittente, a distanza di pochi secondi) cosi' la UI mostra una sola voce con
 * il numero di destinatari e quanti recapiti sono andati a buon fine.
 *
 * NB: il corpo del messaggio NON e' salvato nel log, quindi non e' disponibile.
 */
export async function GET() {
  const guard = await requireSuperadmin()
  if ("error" in guard) return guard.error

  const svc = await createServiceRoleClient()

  const { data: rows, error } = await svc
    .from("email_audit_log")
    .select("id, recipients, subject, status, error_message, metadata, created_at")
    .eq("email_type", "sales_agent_broadcast")
    .order("created_at", { ascending: false })
    .limit(500)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Risolvo i nomi dei venditori (agent_id -> display_name) in un colpo solo.
  const agentIds = Array.from(
    new Set(
      (rows ?? [])
        .map((r) => (r.metadata as Record<string, unknown> | null)?.agent_id)
        .filter((x): x is string => typeof x === "string" && x.length > 0),
    ),
  )
  const nameById = new Map<string, string>()
  if (agentIds.length > 0) {
    const { data: agents } = await svc
      .from("sales_agents")
      .select("id, display_name")
      .in("id", agentIds)
    for (const a of agents ?? []) {
      if (a.display_name) nameById.set(a.id, a.display_name)
    }
  }

  // Raggruppo per invio: chiave = oggetto + mittente + timestamp al minuto.
  type Item = {
    key: string
    subject: string | null
    fromAlias: string | null
    sentAt: string
    total: number
    sent: number
    failed: number
    recipients: Array<{ email: string | null; agentName: string | null; ok: boolean; error: string | null }>
  }
  const groups = new Map<string, Item>()

  for (const r of rows ?? []) {
    const meta = (r.metadata as Record<string, unknown> | null) ?? {}
    const fromAlias = typeof meta.from_alias === "string" ? meta.from_alias : null
    const agentId = typeof meta.agent_id === "string" ? meta.agent_id : null
    const minute = (r.created_at as string).slice(0, 16) // YYYY-MM-DDTHH:mm
    const key = `${r.subject ?? ""}|${fromAlias ?? ""}|${minute}`
    const email = Array.isArray(r.recipients) ? (r.recipients[0] ?? null) : null
    const ok = r.status === "sent"

    let g = groups.get(key)
    if (!g) {
      g = {
        key,
        subject: r.subject,
        fromAlias,
        sentAt: r.created_at as string,
        total: 0,
        sent: 0,
        failed: 0,
        recipients: [],
      }
      groups.set(key, g)
    }
    g.total += 1
    if (ok) g.sent += 1
    else g.failed += 1
    g.recipients.push({
      email,
      agentName: agentId ? nameById.get(agentId) ?? null : null,
      ok,
      error: (r.error_message as string | null) ?? null,
    })
  }

  const items = Array.from(groups.values()).sort(
    (a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime(),
  )

  return NextResponse.json({ items })
}
