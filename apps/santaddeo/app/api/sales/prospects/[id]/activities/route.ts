import { type NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { getAuthUserOrDev } from "@/lib/auth/getAuthUserOrDev"

export const dynamic = "force-dynamic"

const VALID_TYPES = ["note", "call", "email", "visit", "meeting", "demo"] as const
const VALID_OUTCOMES = ["positive", "neutral", "negative"] as const

/**
 * Verifica accesso al prospect: torna { agent, isSuperAdmin, prospect } o null se non autorizzato.
 * Tutti gli endpoint sotto /api/sales/prospects/[id]/activities richiedono che il caller
 * sia super_admin oppure l'agente assegnato al prospect.
 */
async function checkAccess(prospectId: string) {
  const { user, supabase: authSupa } = await getAuthUserOrDev()
  if (!user) return { error: "unauthorized" as const, status: 401 }

  const svc = await createServiceRoleClient()

  const { data: profile } = await authSupa
    .from("profiles")
    .select("id, role")
    .eq("id", user.id)
    .maybeSingle()
  const isSuperAdmin = profile?.role === "super_admin"

  const { data: agent } = await svc
    .from("sales_agents")
    .select("id")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .maybeSingle()

  const { data: prospect } = await svc
    .from("prospects")
    .select("id, assigned_agent_id")
    .eq("id", prospectId)
    .maybeSingle()
  if (!prospect) return { error: "not_found" as const, status: 404 }

  if (!isSuperAdmin && prospect.assigned_agent_id !== agent?.id) {
    return { error: "forbidden" as const, status: 403 }
  }

  return { svc, agent, isSuperAdmin, prospect }
}

/**
 * GET /api/sales/prospects/[id]/activities
 * Ritorna timeline attivita' (manuali + system events) ordinate desc per happened_at.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const access = await checkAccess(id)
  if ("error" in access) {
    return NextResponse.json({ error: access.error }, { status: access.status })
  }
  const { svc } = access

  const { data, error } = await svc
    .from("prospect_activities")
    .select(
      "id, prospect_id, agent_id, type, title, description, outcome, happened_at, due_at, task_status, completed_at, created_at, updated_at, demo_request_id, agent:agent_id(id, display_name, email), demo_request:demo_request_id(id, status, requested_start, requested_end, google_event_link, decision_notes)",
    )
    .eq("prospect_id", id)
    // Ordino prima i task pending per due_at ASC (i piu' imminenti prima),
    // poi il resto per happened_at DESC. Lo faccio via JS sotto perche'
    // PostgREST non supporta CASE in order. Limito a 300 per evitare query
    // pesanti su prospect storici.
    .order("happened_at", { ascending: false })
    .limit(300)

  if (error) {
    console.error("[activities] GET error:", error.message)
    return NextResponse.json({ error: "db_error" }, { status: 500 })
  }
  return NextResponse.json({ activities: data || [] })
}

/**
 * POST /api/sales/prospects/[id]/activities
 * Crea una nuova attivita' (note, call, email, visit, meeting).
 * Body: { type, title?, description?, outcome?, happened_at? }
 *
 * Quando type=='call' aggiorniamo anche prospects.last_contact_at.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const access = await checkAccess(id)
  if ("error" in access) {
    return NextResponse.json({ error: access.error }, { status: access.status })
  }
  const { svc, agent, isSuperAdmin } = access

  // Solo gli agenti assegnati possono creare attivita' (il superadmin ha
  // permesso di sola consultazione qui — se vuole agire impersona).
  if (!agent && !isSuperAdmin) {
    return NextResponse.json(
      { error: "Solo agenti possono registrare attivita'" },
      { status: 403 },
    )
  }
  if (!agent) {
    return NextResponse.json(
      { error: "I superadmin non registrano attivita' direttamente" },
      { status: 403 },
    )
  }

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: "invalid_body" }, { status: 400 })

  const type = String(body.type || "").trim()
  if (!VALID_TYPES.includes(type as any)) {
    return NextResponse.json(
      { error: `Tipo non valido (ammessi: ${VALID_TYPES.join(", ")})` },
      { status: 400 },
    )
  }

  const outcome = body.outcome ? String(body.outcome).trim() : null
  if (outcome && !VALID_OUTCOMES.includes(outcome as any)) {
    return NextResponse.json({ error: "outcome_invalid" }, { status: 400 })
  }

  const title = body.title ? String(body.title).trim().slice(0, 200) : null
  const description = body.description
    ? String(body.description).trim().slice(0, 5000)
    : null

  // --- Tipo DEMO ---------------------------------------------------------
  // Una "Demo" e' sempre un evento PIANIFICATO con un intervallo orario
  // (inizio/fine). Il venditore puo' opzionalmente coinvolgere l'admin
  // Santaddeo (involve_admin): in quel caso creiamo anche una richiesta sul
  // calendario condiviso clienti@4bid.it (tabella demo_requests, status
  // pending) e la colleghiamo all'attivita' via demo_request_id. L'evento
  // Google reale viene creato solo quando il super admin accetta.
  const isDemo = type === "demo"
  const involveAdmin = isDemo && body.involve_admin === true
  let demoStart: Date | null = null
  let demoEnd: Date | null = null
  if (isDemo) {
    const rawStart = body.requested_start || body.due_at || body.happened_at
    demoStart = rawStart ? new Date(rawStart) : null
    if (!demoStart || isNaN(demoStart.getTime())) {
      return NextResponse.json({ error: "demo_start_required" }, { status: 400 })
    }
    demoEnd = body.requested_end ? new Date(body.requested_end) : null
    if (!demoEnd || isNaN(demoEnd.getTime()) || demoEnd <= demoStart) {
      // Default: 30 minuti dopo l'inizio.
      demoEnd = new Date(demoStart.getTime() + 30 * 60 * 1000)
    }
  }

  // Modalita': se il client passa `due_at` (o e' una demo), stiamo creando un
  // TASK pianificato (task_status='pending', happened_at = due_at in modo che
  // resti coerente nella timeline). Se invece passa happened_at, e' storica.
  // Se non passa niente, e' un'attivita' "adesso".
  const isTask = !!body.due_at || isDemo
  let due_at: string | null = null
  let task_status: "pending" | null = null
  let happened_at: string

  if (isTask) {
    const d = isDemo ? demoStart! : new Date(body.due_at)
    if (isNaN(d.getTime())) {
      return NextResponse.json({ error: "due_at_invalid" }, { status: 400 })
    }
    due_at = d.toISOString()
    task_status = "pending"
    // Per i task uso due_at come happened_at: cosi' la riga ha sempre una
    // data e si ordina correttamente. Quando il task viene completato,
    // happened_at viene aggiornato a now() (vedi PATCH).
    happened_at = d.toISOString()
  } else {
    happened_at = body.happened_at
      ? new Date(body.happened_at).toISOString()
      : new Date().toISOString()
  }

  // Se la demo deve coinvolgere l'admin, creo prima la richiesta sul
  // calendario condiviso (status pending) cosi' da poterla collegare
  // all'attivita'. Riuso la stessa logica di /api/sales/demo-requests.
  let demoRequestId: string | null = null
  if (involveAdmin && demoStart && demoEnd) {
    const { data: prospectName } = await svc
      .from("prospects")
      .select("name")
      .eq("id", id)
      .maybeSingle()
    const demoTitle =
      title || `Demo Santaddeo - ${prospectName?.name || "Prospect"}`
    const { data: dr, error: drErr } = await svc
      .from("demo_requests")
      .insert({
        agent_id: agent.id,
        prospect_id: id,
        title: demoTitle.slice(0, 200),
        notes: description,
        requested_start: demoStart.toISOString(),
        requested_end: demoEnd.toISOString(),
        attendee_email: (agent as any).email || null,
        status: "pending",
      })
      .select("id")
      .single()
    if (drErr) {
      console.error("[activities] demo_request error:", drErr.message)
      return NextResponse.json(
        { error: "Errore nella richiesta demo: " + drErr.message },
        { status: 500 },
      )
    }
    demoRequestId = dr.id
  }

  const { data: inserted, error } = await svc
    .from("prospect_activities")
    .insert({
      prospect_id: id,
      agent_id: agent.id,
      type,
      title,
      description,
      outcome: isTask ? null : outcome,
      happened_at,
      due_at,
      task_status,
      demo_request_id: demoRequestId,
    })
    .select(
      "id, prospect_id, agent_id, type, title, description, outcome, happened_at, due_at, task_status, completed_at, created_at, updated_at, demo_request_id, agent:agent_id(id, display_name, email), demo_request:demo_request_id(id, status, requested_start, requested_end, google_event_link, decision_notes)",
    )
    .single()

  if (error) {
    console.error("[activities] POST error:", error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Side-effect: per attivita' "di contatto" (call/email/visit/meeting) GIA'
  // SVOLTE (cioe' non task pending) aggiorniamo last_contact_at sul prospect,
  // in modo che la lista mostri il dato aggiornato. Per i task pianificati nel
  // futuro NON aggiorniamo (il contatto sara' registrato quando completato).
  if (!isTask && ["call", "email", "visit", "meeting"].includes(type)) {
    await svc
      .from("prospects")
      .update({ last_contact_at: happened_at, updated_at: new Date().toISOString() })
      .eq("id", id)
  }

  return NextResponse.json({ activity: inserted })
}
