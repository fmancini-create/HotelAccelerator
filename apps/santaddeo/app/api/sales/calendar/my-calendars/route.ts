import { type NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { getAuthUserOrDev } from "@/lib/auth/getAuthUserOrDev"
import { validateAndResolveIcsUrl } from "@/lib/calendar/ics"

export const dynamic = "force-dynamic"

/** Risolve l'agente (sales_agents) collegato all'utente loggato. */
async function resolveAgent(svc: Awaited<ReturnType<typeof createServiceRoleClient>>, userId: string) {
  const { data } = await svc
    .from("sales_agents")
    .select("id")
    .eq("user_id", userId)
    .eq("is_active", true)
    .maybeSingle()
  return data
}

const PROVIDERS = ["google", "outlook", "apple", "other"] as const

/** Maschera un URL ICS per non riesporre mai il segreto al client. */
function maskUrl(url: string): string {
  try {
    const u = new URL(url)
    return `${u.protocol}//${u.host}/…`
  } catch {
    return "…"
  }
}

/**
 * GET /api/sales/calendar/my-calendars
 * Lista i calendari personali del venditore loggato. NON espone l'URL ICS
 * completo (contiene un segreto): solo metadati + host mascherato.
 */
export async function GET() {
  const { user } = await getAuthUserOrDev()
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  const svc = await createServiceRoleClient()
  const agent = await resolveAgent(svc, user.id)
  if (!agent) return NextResponse.json({ calendars: [] })

  const { data, error } = await svc
    .from("sales_agent_calendars")
    .select("id, provider, label, color, is_active, last_synced_at, last_error, ics_url, created_at")
    .eq("sales_agent_id", agent.id)
    .order("created_at", { ascending: true })

  if (error) {
    console.error("[my-calendars/GET]", error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const calendars = (data ?? []).map((c) => ({
    id: c.id,
    provider: c.provider,
    label: c.label,
    color: c.color,
    is_active: c.is_active,
    last_synced_at: c.last_synced_at,
    last_error: c.last_error,
    url_hint: maskUrl(c.ics_url),
    created_at: c.created_at,
  }))
  return NextResponse.json({ calendars })
}

/**
 * POST /api/sales/calendar/my-calendars
 * Aggiunge un calendario ICS al venditore loggato. Valida l'URL con un fetch
 * di prova prima di salvare.
 * Body: { ics_url, provider?, label?, color? }
 */
export async function POST(request: NextRequest) {
  const { user } = await getAuthUserOrDev()
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  const svc = await createServiceRoleClient()
  const agent = await resolveAgent(svc, user.id)
  if (!agent) return NextResponse.json({ error: "not_an_agent" }, { status: 403 })

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 })
  }

  const icsUrl = (body?.ics_url || "").toString().trim()
  if (!icsUrl) return NextResponse.json({ error: "ics_url_required" }, { status: 400 })

  const provider = PROVIDERS.includes(body?.provider) ? body.provider : "other"
  const label = (body?.label || "").toString().trim().slice(0, 120) || null
  const color = /^#[0-9a-fA-F]{6}$/.test(body?.color) ? body.color : "#a855f7"

  // Valida l'URL prima di salvare: deve essere un ICS leggibile.
  // Prova anche i feed derivati (es. link embed Google -> public/basic.ics) e
  // salva l'URL effettivamente funzionante, non quello di sola visualizzazione.
  const check = await validateAndResolveIcsUrl(icsUrl)
  if (!check.ok) {
    return NextResponse.json({ error: "invalid_ics", message: check.error }, { status: 400 })
  }
  const urlToStore = check.resolvedUrl || icsUrl

  const { data, error } = await svc
    .from("sales_agent_calendars")
    .insert({
      sales_agent_id: agent.id,
      provider,
      ics_url: urlToStore,
      label,
      color,
      last_synced_at: new Date().toISOString(),
      last_error: null,
    })
    .select("id")
    .single()

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ error: "duplicate", message: "Questo calendario è già collegato." }, { status: 409 })
    }
    console.error("[my-calendars/POST]", error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true, id: data.id, event_count: check.count ?? 0 })
}

/**
 * DELETE /api/sales/calendar/my-calendars?id=UUID
 * Rimuove un calendario del venditore loggato (solo i propri).
 */
export async function DELETE(request: NextRequest) {
  const { user } = await getAuthUserOrDev()
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  const svc = await createServiceRoleClient()
  const agent = await resolveAgent(svc, user.id)
  if (!agent) return NextResponse.json({ error: "not_an_agent" }, { status: 403 })

  const id = new URL(request.url).searchParams.get("id")
  if (!id) return NextResponse.json({ error: "id_required" }, { status: 400 })

  const { error } = await svc
    .from("sales_agent_calendars")
    .delete()
    .eq("id", id)
    .eq("sales_agent_id", agent.id)

  if (error) {
    console.error("[my-calendars/DELETE]", error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
