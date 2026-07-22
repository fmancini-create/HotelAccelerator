import { type NextRequest, NextResponse } from "next/server"
import { createClient, createServiceRoleClient } from "@/lib/supabase/server"

/**
 * Calcola la timestamp di scadenza a partire da una di:
 *  - expires_at esplicito (ISO string)
 *  - duration_days (default 60 se omesso e non e' esplicitamente null)
 *
 * Se sia expires_at sia duration_days sono null/omessi, ritorna null
 * (nessuna scadenza). Se duration_days = 0 ritorna null (no scadenza).
 */
function resolveExpiry(input: {
  expires_at?: string | null
  duration_days?: number | null
}): { expires_at: string | null; duration_days: number | null } {
  if (input.expires_at) {
    const d = new Date(input.expires_at)
    if (Number.isNaN(d.getTime())) {
      throw new Error("expires_at non valido")
    }
    return { expires_at: d.toISOString(), duration_days: input.duration_days ?? null }
  }
  if (input.duration_days === null || input.duration_days === 0) {
    return { expires_at: null, duration_days: null }
  }
  // Default 60gg se non specificato
  const days = typeof input.duration_days === "number" ? input.duration_days : 60
  if (days < 1 || days > 365) {
    throw new Error("duration_days fuori range (1-365)")
  }
  const expiry = new Date()
  expiry.setUTCDate(expiry.getUTCDate() + days)
  return { expires_at: expiry.toISOString(), duration_days: days }
}

async function requireSuperAdmin() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: NextResponse.json({ error: "Non autorizzato" }, { status: 401 }) }
  const service = await createServiceRoleClient()
  const { data: profile } = await service.from("profiles").select("role").eq("id", user.id).maybeSingle()
  if (profile?.role !== "super_admin") {
    return { error: NextResponse.json({ error: "Accesso negato" }, { status: 403 }) }
  }
  return { user, service }
}

/**
 * POST: Assegnazione bulk di prospect a un agente, con scadenza.
 *
 * Body:
 *  {
 *    agent_id: string,                       // obbligatorio
 *    prospect_ids?: string[],                // opzione A
 *    filters?: {                             // opzione B
 *      regions?: string[], provinces?: string[], cities?: string[],
 *      categories?: string[], stars_min?: number, stars_max?: number,
 *      rooms_min?: number, rooms_max?: number,
 *      include_assigned?: boolean            // default false
 *    },
 *    expires_at?: string | null,             // ISO; oppure...
 *    duration_days?: number | null,          // ...default 60
 *    force?: boolean,                        // override su prospect assegnati
 *    force_reason?: string,                  // obbligatorio se force=true
 *    dry_run?: boolean                       // ritorna preview senza scrivere
 *  }
 */
export async function POST(request: NextRequest) {
  const auth = await requireSuperAdmin()
  if ("error" in auth) return auth.error
  const { user, service } = auth

  let body: any
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: "Body non valido" }, { status: 400 })
  }

  const { agent_id, prospect_ids, filters, force, force_reason, dry_run } = body || {}

  if (!agent_id) {
    return NextResponse.json({ error: "agent_id obbligatorio" }, { status: 400 })
  }

  let expiry: { expires_at: string | null; duration_days: number | null }
  try {
    expiry = resolveExpiry({ expires_at: body?.expires_at, duration_days: body?.duration_days })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 400 })
  }

  // Verifica agente
  const { data: agent, error: agentError } = await service
    .from("sales_agents")
    .select("id, display_name, is_active")
    .eq("id", agent_id)
    .maybeSingle()
  if (agentError || !agent || !agent.is_active) {
    return NextResponse.json({ error: "Agente non trovato o inattivo" }, { status: 404 })
  }

  // Costruisci la query di SELECT per identificare i prospect target.
  // Lo facciamo come SELECT separato (non UPDATE...IN) per supportare:
  // - dry_run (preview)
  // - filtri force/no-force in modo esplicito
  let selectQuery = service.from("prospects").select("id, name, city, region, assigned_agent_id")

  if (Array.isArray(prospect_ids) && prospect_ids.length > 0) {
    selectQuery = selectQuery.in("id", prospect_ids)
  } else if (filters && typeof filters === "object") {
    if (Array.isArray(filters.regions) && filters.regions.length > 0) {
      selectQuery = selectQuery.in("region", filters.regions)
    } else if (filters.region) {
      selectQuery = selectQuery.eq("region", filters.region)
    }
    if (Array.isArray(filters.provinces) && filters.provinces.length > 0) {
      selectQuery = selectQuery.in("province", filters.provinces)
    } else if (filters.province) {
      selectQuery = selectQuery.eq("province", filters.province)
    }
    if (Array.isArray(filters.cities) && filters.cities.length > 0) {
      selectQuery = selectQuery.in("city", filters.cities)
    } else if (filters.city) {
      selectQuery = selectQuery.ilike("city", `%${filters.city}%`)
    }
    if (Array.isArray(filters.categories) && filters.categories.length > 0) {
      selectQuery = selectQuery.in("category", filters.categories)
    } else if (filters.category) {
      selectQuery = selectQuery.eq("category", filters.category)
    }
    if (typeof filters.stars_min === "number") selectQuery = selectQuery.gte("stars", filters.stars_min)
    if (typeof filters.stars_max === "number") selectQuery = selectQuery.lte("stars", filters.stars_max)
    if (typeof filters.rooms_min === "number") selectQuery = selectQuery.gte("rooms_count", filters.rooms_min)
    if (typeof filters.rooms_max === "number") selectQuery = selectQuery.lte("rooms_count", filters.rooms_max)

    // Di default escludiamo i prospect gia' assegnati ad altri agenti
    // (lo stesso agent_id e' OK: e' un no-op di refresh scadenza).
    if (!filters.include_assigned && !force) {
      selectQuery = selectQuery.or(`assigned_agent_id.is.null,assigned_agent_id.eq.${agent_id}`)
    }
  } else {
    return NextResponse.json({ error: "Specificare prospect_ids o filters" }, { status: 400 })
  }

  // Hard cap di sicurezza per non scrivere migliaia di righe per errore
  const HARD_CAP = 500
  const { data: candidates, error: selErr } = await selectQuery.limit(HARD_CAP + 1)
  if (selErr) {
    console.error("[bulk-assign] select error:", selErr)
    return NextResponse.json({ error: selErr.message }, { status: 500 })
  }

  const overCap = (candidates || []).length > HARD_CAP
  const targets = (candidates || []).slice(0, HARD_CAP)

  // Separa quelli liberi da quelli gia' presi (servono per il dialog di force)
  const alreadyTaken = targets.filter((p) => p.assigned_agent_id && p.assigned_agent_id !== agent_id)

  if (alreadyTaken.length > 0 && !force) {
    return NextResponse.json(
      {
        error: "some_already_assigned",
        message: "Alcuni prospect sono gia' assegnati. Usa force=true + force_reason per sovrascrivere.",
        already_taken_count: alreadyTaken.length,
        free_count: targets.length - alreadyTaken.length,
        over_cap: overCap,
        cap: HARD_CAP,
      },
      { status: 409 },
    )
  }

  if (force && (!force_reason || force_reason.trim().length < 5)) {
    return NextResponse.json(
      { error: "force_reason richiesto (min 5 caratteri) quando force=true" },
      { status: 400 },
    )
  }

  if (dry_run) {
    return NextResponse.json({
      dry_run: true,
      preview_count: targets.length,
      already_taken_count: alreadyTaken.length,
      over_cap: overCap,
      cap: HARD_CAP,
      sample: targets.slice(0, 10).map((p) => ({ id: p.id, name: p.name, city: p.city, region: p.region })),
    })
  }

  if (targets.length === 0) {
    return NextResponse.json({ success: true, assigned_count: 0, agent })
  }

  // Imposta session vars per il trigger history (force / who)
  if (force) {
    await service.rpc("set_config" as any, {
      param: "app.assignment_unassign_reason",
      val: "forced_by_admin",
      is_local: true,
    } as any)
  }
  // Non possiamo passare session vars facilmente in PostgREST per il trigger,
  // quindi quando force=true logghiamo esplicitamente in history via UPDATE
  // dei record open (vedi sotto dopo l'UPDATE principale).

  const ids = targets.map((t) => t.id)
  const { data: updated, error: updErr } = await service
    .from("prospects")
    .update({
      assigned_agent_id: agent_id,
      assignment_date: new Date().toISOString(),
      assignment_expires_at: expiry.expires_at,
      assignment_duration_days: expiry.duration_days,
      assignment_expired_at: null,
      status: "assigned",
    })
    .in("id", ids)
    .select("id, assigned_agent_id")

  if (updErr) {
    console.error("[bulk-assign] update error:", updErr)
    return NextResponse.json({ error: updErr.message }, { status: 500 })
  }

  // Se force: aggiorna manualmente l'ultima riga history chiusa di questi
  // prospect (la chiusura e' avvenuta nel trigger con reason='manual' default).
  // La portiamo a 'forced_by_admin' e annotiamo motivo.
  if (force && force_reason) {
    const justClosedAt = new Date(Date.now() - 5000).toISOString() // 5s di tolleranza
    await service
      .from("prospect_assignment_history")
      .update({
        unassign_reason: "forced_by_admin",
        unassign_notes: force_reason,
        unassigned_by: user.id,
      })
      .in("prospect_id", ids)
      .not("unassigned_at", "is", null)
      .gte("unassigned_at", justClosedAt)
  }

  // Memorizza assigned_by sull'ultima riga history aperta (quella nuova).
  await service
    .from("prospect_assignment_history")
    .update({ assigned_by: user.id })
    .in("prospect_id", ids)
    .eq("agent_id", agent_id)
    .is("unassigned_at", null)

  return NextResponse.json({
    success: true,
    assigned_count: updated?.length || 0,
    forced_count: force ? alreadyTaken.length : 0,
    expires_at: expiry.expires_at,
    duration_days: expiry.duration_days,
    over_cap: overCap,
    cap: HARD_CAP,
    agent,
  })
}

/**
 * DELETE: Rimuovi assegnazione bulk (manual).
 */
export async function DELETE(request: NextRequest) {
  const auth = await requireSuperAdmin()
  if ("error" in auth) return auth.error
  const { service } = auth

  const body = await request.json()
  const { prospect_ids } = body
  if (!Array.isArray(prospect_ids) || prospect_ids.length === 0) {
    return NextResponse.json({ error: "prospect_ids obbligatorio" }, { status: 400 })
  }

  const { data, error } = await service
    .from("prospects")
    .update({
      assigned_agent_id: null,
      assignment_date: null,
      assignment_expires_at: null,
      status: "unassigned",
    })
    .in("id", prospect_ids)
    .select("id")

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, unassigned_count: data?.length || 0 })
}
