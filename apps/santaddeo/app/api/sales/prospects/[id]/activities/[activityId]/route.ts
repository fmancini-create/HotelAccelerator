import { type NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { getAuthUserOrDev } from "@/lib/auth/getAuthUserOrDev"

export const dynamic = "force-dynamic"

const VALID_OUTCOMES = ["positive", "neutral", "negative"] as const

/**
 * Recupera prospect+agent+activity, verificando che l'attivita' appartenga
 * davvero al prospect indicato e che il caller sia autorizzato (super_admin
 * o l'agent che l'ha creata).
 */
async function loadAndAuthorize(prospectId: string, activityId: string) {
  const { user, supabase: authSupa } = await getAuthUserOrDev()
  if (!user) return { error: "unauthorized" as const, status: 401 }

  const svc = await createServiceRoleClient()

  const { data: profile } = await authSupa
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle()
  const isSuperAdmin = profile?.role === "super_admin"

  const { data: agent } = await svc
    .from("sales_agents")
    .select("id")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .maybeSingle()

  const { data: activity } = await svc
    .from("prospect_activities")
    .select("id, prospect_id, agent_id, type, task_status, due_at, happened_at, demo_request_id")
    .eq("id", activityId)
    .maybeSingle()
  if (!activity) return { error: "not_found" as const, status: 404 }
  if (activity.prospect_id !== prospectId) {
    return { error: "mismatched_prospect" as const, status: 400 }
  }

  // Le attivita' di sistema non sono modificabili neanche dal proprietario
  if (activity.type === "system") {
    return { error: "system_immutable" as const, status: 403 }
  }

  // Permesso: super_admin oppure l'agent che ha creato l'attivita'
  if (!isSuperAdmin && (!agent || activity.agent_id !== agent.id)) {
    return { error: "forbidden" as const, status: 403 }
  }

  return { svc, activity }
}

/**
 * PATCH /api/sales/prospects/[id]/activities/[activityId]
 * Modifica un'attivita' esistente. Solo il creatore (o super_admin).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; activityId: string }> },
) {
  const { id, activityId } = await params
  const res = await loadAndAuthorize(id, activityId)
  if ("error" in res) return NextResponse.json({ error: res.error }, { status: res.status })
  const { svc, activity } = res

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: "invalid_body" }, { status: 400 })

  const patch: Record<string, any> = {}
  if (typeof body.title === "string") patch.title = body.title.trim().slice(0, 200) || null
  if (typeof body.description === "string")
    patch.description = body.description.trim().slice(0, 5000) || null
  if (body.outcome === null) patch.outcome = null
  else if (typeof body.outcome === "string") {
    if (!VALID_OUTCOMES.includes(body.outcome as any)) {
      return NextResponse.json({ error: "outcome_invalid" }, { status: 400 })
    }
    patch.outcome = body.outcome
  }
  if (body.happened_at) {
    const d = new Date(body.happened_at)
    if (isNaN(d.getTime())) return NextResponse.json({ error: "happened_at_invalid" }, { status: 400 })
    patch.happened_at = d.toISOString()
  }

  // Task management: gestione transizioni di task_status
  //  - "pending" -> "done": completed_at = now, happened_at = now, outcome opzionale
  //  - "pending" -> "cancelled": completed_at resta NULL, happened_at = due_at
  //  - riapertura "done"/"cancelled" -> "pending": reset completed_at
  //  - reschedule: cambio solo di due_at (resta pending)
  let sideEffectMarkDone = false
  if (body.task_status !== undefined) {
    const newStatus = body.task_status
    if (newStatus !== null && !["pending", "done", "cancelled"].includes(newStatus)) {
      return NextResponse.json({ error: "task_status_invalid" }, { status: 400 })
    }
    if (newStatus === null) {
      patch.task_status = null
      patch.due_at = null
      patch.completed_at = null
    } else {
      patch.task_status = newStatus
      if (newStatus === "done") {
        const now = new Date().toISOString()
        patch.completed_at = now
        // happened_at = quando il task e' stato completato, per la timeline
        if (!body.happened_at) patch.happened_at = now
        sideEffectMarkDone = true
      } else if (newStatus === "cancelled") {
        patch.completed_at = null
      } else if (newStatus === "pending") {
        // Riapertura: reset completed_at
        patch.completed_at = null
        // Se non c'e' due_at sull'attivita' (es. tentativo di trasformare
        // un'attivita' storica in task), richiediamo che il client invii anche due_at.
        if (!activity.due_at && !body.due_at) {
          return NextResponse.json(
            { error: "due_at_required_for_pending" },
            { status: 400 },
          )
        }
      }
    }
  }
  if (body.due_at !== undefined) {
    if (body.due_at === null) {
      patch.due_at = null
    } else {
      const d = new Date(body.due_at)
      if (isNaN(d.getTime())) return NextResponse.json({ error: "due_at_invalid" }, { status: 400 })
      patch.due_at = d.toISOString()
    }
  }

  // Reschedule di una DEMO: il client invia requested_start/requested_end.
  // Aggiorniamo gli orari dell'attivita' (due_at/happened_at) e, piu' avanti,
  // sincronizziamo la richiesta demo collegata se ancora pending.
  let demoReschedule: { start: string; end: string } | null = null
  if (body.requested_start) {
    const start = new Date(body.requested_start)
    if (isNaN(start.getTime())) {
      return NextResponse.json({ error: "demo_start_invalid" }, { status: 400 })
    }
    let end = body.requested_end ? new Date(body.requested_end) : null
    if (!end || isNaN(end.getTime()) || end <= start) {
      end = new Date(start.getTime() + 30 * 60 * 1000)
    }
    demoReschedule = { start: start.toISOString(), end: end.toISOString() }
    patch.due_at = demoReschedule.start
    // Per la timeline una demo (task pianificato) usa due_at come happened_at
    // finche' non viene completata manualmente.
    if (activity.task_status === "pending") {
      patch.happened_at = demoReschedule.start
    }
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "no_changes" }, { status: 400 })
  }

  const { data, error } = await svc
    .from("prospect_activities")
    .update(patch)
    .eq("id", activityId)
    .select(
      "id, prospect_id, agent_id, type, title, description, outcome, happened_at, due_at, task_status, completed_at, created_at, updated_at, demo_request_id, agent:agent_id(id, display_name, email), demo_request:demo_request_id(id, status, requested_start, requested_end, google_event_link, decision_notes)",
    )
    .single()

  if (error) {
    console.error("[activities] PATCH error:", error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Sincronizza la richiesta demo collegata se ancora pending: se il venditore
  // sposta orario/titolo/note di una demo non ancora confermata dall'admin,
  // aggiorniamo anche la riga demo_requests. Se e' gia' approved/rejected NON
  // tocchiamo nulla (l'evento Google e' gia' stato deciso dall'admin).
  if (activity.demo_request_id) {
    const drPatch: Record<string, any> = {}
    if (demoReschedule) {
      drPatch.requested_start = demoReschedule.start
      drPatch.requested_end = demoReschedule.end
    }
    if (patch.title !== undefined && patch.title) drPatch.title = patch.title
    if (patch.description !== undefined) drPatch.notes = patch.description
    if (Object.keys(drPatch).length > 0) {
      const { error: drErr } = await svc
        .from("demo_requests")
        .update(drPatch)
        .eq("id", activity.demo_request_id)
        .eq("status", "pending")
      if (drErr) {
        console.error("[activities] demo_request sync error:", drErr.message)
      }
    }
  }

  // Side effect: se ho appena completato un task di contatto, aggiorno
  // prospects.last_contact_at (stesso comportamento del POST per le
  // attivita' "now").
  if (sideEffectMarkDone && ["call", "email", "visit", "meeting"].includes(activity.type)) {
    await svc
      .from("prospects")
      .update({
        last_contact_at: patch.happened_at,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
  }

  return NextResponse.json({ activity: data })
}

/**
 * DELETE /api/sales/prospects/[id]/activities/[activityId]
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; activityId: string }> },
) {
  const { id, activityId } = await params
  const res = await loadAndAuthorize(id, activityId)
  if ("error" in res) return NextResponse.json({ error: res.error }, { status: res.status })
  const { svc, activity } = res

  // Se la demo ha una richiesta collegata ancora pending, la annulliamo (cosi'
  // l'admin non vede una richiesta orfana da approvare). Se gia' approvata,
  // marcandola cancelled segnaliamo all'admin di rimuovere l'evento Google.
  if (activity.demo_request_id) {
    const { error: drErr } = await svc
      .from("demo_requests")
      .update({ status: "cancelled" })
      .eq("id", activity.demo_request_id)
      .in("status", ["pending", "approved"])
    if (drErr) {
      console.error("[activities] demo_request cancel error:", drErr.message)
    }
  }

  const { error } = await svc.from("prospect_activities").delete().eq("id", activityId)
  if (error) {
    console.error("[activities] DELETE error:", error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
