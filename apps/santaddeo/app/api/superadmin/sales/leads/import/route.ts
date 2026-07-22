import { NextResponse } from "next/server"
import { randomBytes } from "node:crypto"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { requireSuperadmin } from "@/lib/sales/superadmin-guard"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * POST /api/superadmin/sales/leads/import
 *
 * Riceve un body JSON:
 *   {
 *     sales_agent_id: string,         // venditore destinazione
 *     rows: Array<{ first_name, last_name, email, hotel_name, phone? }>,
 *     send_email?: boolean             // (futuro) trigger invio mail di
 *                                      //  presentazione subito dopo import
 *   }
 *
 * Crea N lead per quell'agente. Per ognuno genera un tracking_token unico.
 * Skippa duplicati (stesso agente + stessa email) e li riporta in `skipped`.
 *
 * Il superadmin importa CSV dal client lato browser parsandolo lì
 * (o usando questa API direttamente se il CSV ha gia' formato JSON).
 */
function genToken(): string {
  // Token alfanumerico (16 hex bytes -> 32 chars)
  return randomBytes(16).toString("hex")
}

export async function POST(req: Request) {
  const guard = await requireSuperadmin()
  if ("error" in guard) return guard.error

  const body = await req.json().catch(() => null)
  if (!body || typeof body !== "object")
    return NextResponse.json({ error: "invalid_body" }, { status: 400 })

  const { sales_agent_id, rows } = body as { sales_agent_id?: string; rows?: any[] }
  if (!sales_agent_id || !Array.isArray(rows) || rows.length === 0) {
    return NextResponse.json(
      { error: "missing_fields", details: "sales_agent_id + rows[] richiesti" },
      { status: 400 },
    )
  }
  if (rows.length > 1000) {
    return NextResponse.json(
      { error: "too_many", details: "max 1000 lead per batch" },
      { status: 413 },
    )
  }

  const svc = await createServiceRoleClient()

  const { data: agent } = await svc
    .from("sales_agents")
    .select("id")
    .eq("id", sales_agent_id)
    .maybeSingle()
  if (!agent) return NextResponse.json({ error: "agent_not_found" }, { status: 400 })

  const inserted: any[] = []
  const skipped: any[] = []
  const errors: any[] = []

  for (const r of rows) {
    const first_name = String(r.first_name ?? "").trim()
    const last_name = String(r.last_name ?? "").trim()
    const email = String(r.email ?? "")
      .trim()
      .toLowerCase()
    const hotel_name = String(r.hotel_name ?? "").trim()
    const phone = r.phone ? String(r.phone).trim() : null

    if (!first_name || !last_name || !email || !hotel_name) {
      errors.push({ row: r, reason: "missing_required_field" })
      continue
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.push({ row: r, reason: "invalid_email" })
      continue
    }

    const { data, error } = await svc
      .from("sales_leads")
      .insert({
        sales_agent_id,
        first_name,
        last_name,
        email,
        hotel_name,
        phone,
        tracking_token: genToken(),
        status: "draft",
        source: "admin_import",
      })
      .select()
      .single()

    if (error) {
      // Duplicate key (UNIQUE(sales_agent_id, email))
      if (String(error.code) === "23505") {
        skipped.push({ email, reason: "duplicate" })
        continue
      }
      errors.push({ row: r, reason: "db_error", details: error.message })
      continue
    }
    inserted.push(data)
  }

  return NextResponse.json({
    inserted_count: inserted.length,
    skipped_count: skipped.length,
    error_count: errors.length,
    inserted,
    skipped,
    errors,
  })
}
