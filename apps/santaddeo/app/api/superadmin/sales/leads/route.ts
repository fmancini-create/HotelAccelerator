import { NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { requireSuperadmin } from "@/lib/sales/superadmin-guard"

export const dynamic = "force-dynamic"

/**
 * GET /api/superadmin/sales/leads
 *
 * Lista lead globale (tutti gli agenti). Supporta filtri:
 *   ?agent=<sales_agent_id>   - filtra per agente
 *   ?status=<status>          - filtra per status
 *   ?q=<search>               - cerca su email/nome/struttura (LIKE)
 *
 * Pagina su 200 record per default. Se servono leads piu' vecchi usare i
 * filtri.
 */
export async function GET(req: Request) {
  const guard = await requireSuperadmin()
  if ("error" in guard) return guard.error

  const url = new URL(req.url)
  const agentId = url.searchParams.get("agent")
  const status = url.searchParams.get("status")
  const q = (url.searchParams.get("q") ?? "").trim()
  const limit = Math.min(Number.parseInt(url.searchParams.get("limit") ?? "200", 10), 500)

  const svc = await createServiceRoleClient()

  let query = svc
    .from("sales_leads")
    .select(
      `
      id,
      sales_agent_id,
      first_name,
      last_name,
      email,
      hotel_name,
      phone,
      status,
      tracking_token,
      email_sent_at,
      email_sent_count,
      registered_at,
      converted_at,
      hotel_id,
      source,
      notes,
      created_at,
      sales_agents:sales_agent_id (id, display_name, email)
    `,
    )
    .order("created_at", { ascending: false })
    .limit(limit)

  if (agentId) query = query.eq("sales_agent_id", agentId)
  if (status) query = query.eq("status", status)
  if (q) {
    // OR su email, nome, cognome, struttura
    query = query.or(
      `email.ilike.%${q}%,first_name.ilike.%${q}%,last_name.ilike.%${q}%,hotel_name.ilike.%${q}%`,
    )
  }

  const { data, error } = await query
  if (error) {
    console.error("[superadmin/sales/leads] error:", error)
    return NextResponse.json({ error: "db_error", details: error.message }, { status: 500 })
  }

  return NextResponse.json({ leads: data ?? [] })
}
