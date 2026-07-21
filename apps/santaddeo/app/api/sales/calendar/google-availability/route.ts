import { type NextRequest, NextResponse } from "next/server"
import { createServiceRoleClient } from "@/lib/supabase/server"
import { getAuthUserOrDev } from "@/lib/auth/getAuthUserOrDev"
import { isGoogleCalendarConfigured, listEvents } from "@/lib/google/calendar"
import {
  resolveCalendarViewer,
  resolveTargetAgentId,
  resolveTargetAgentIds,
  resolveVisibleDemoOwners,
} from "@/lib/sales/calendar-scope"

export const dynamic = "force-dynamic"

/**
 * GET /api/sales/calendar/google-availability?from=ISO&to=ISO[&agent_id=]
 * Ritorna gli eventi del calendario condiviso clienti@4bid.it nella finestra,
 * in sola lettura. Visibile a tutti i venditori autenticati per pianificare le
 * demo.
 *
 * PRIVACY DEMO (18/06/2026): titolo, descrizione e link (Meet + evento) di una
 * demo sono visibili SOLO al venditore proprietario della demo e al super admin.
 * Gli altri venditori vedono solo che lo slot e' occupato ("Demo prenotata"),
 * senza dettagli ne' link. Gli eventi NON-demo (es. blocchi "Ufficio") restano
 * invariati. Il mascheramento avviene lato server: i dati sensibili non lasciano
 * mai il backend verso un venditore non autorizzato.
 *
 * CAPO AREA (23/06/2026): il capo area vede anche titolo + link Meet delle demo
 * dei venditori del proprio team (resolveVisibleDemoOwners). Con `agent_id` (un
 * suo venditore, o chiunque se super_admin) la vista si FOCALIZZA: le demo di
 * altri venditori vengono nascoste, restano i blocchi non-demo come contesto.
 *
 * Se Google non e' configurato ritorna { configured: false, events: [] }.
 */
export async function GET(request: NextRequest) {
  const { user } = await getAuthUserOrDev()
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

  if (!isGoogleCalendarConfigured()) {
    return NextResponse.json({ configured: false, events: [] })
  }

  const url = new URL(request.url)
  const from = url.searchParams.get("from")
  const to = url.searchParams.get("to")
  const overrideAgentId = url.searchParams.get("agent_id")
  // Multi-overlay (come superadmin): CSV di agent_id da sovrapporre. Ha
  // precedenza su `agent_id` (legacy a singolo focus) quando presente.
  const overrideAgentIds = (url.searchParams.get("agent_ids") || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
  if (!from || !to) {
    return NextResponse.json({ error: "from_to_required" }, { status: 400 })
  }
  const fromD = new Date(from)
  const toD = new Date(to)
  if (isNaN(fromD.getTime()) || isNaN(toD.getTime())) {
    return NextResponse.json({ error: "invalid_range" }, { status: 400 })
  }

  const svc = await createServiceRoleClient()

  // Chi sta guardando: ruolo + agente collegato + set di owner demo visibili
  // (sé stesso, + team se capo area, oppure tutti se super_admin).
  const viewer = await resolveCalendarViewer(svc, user.id)
  const visibleOwners = await resolveVisibleDemoOwners(svc, viewer)
  const canSeeOwner = (ownerAgentId: string | null) =>
    "all" in visibleOwners
      ? true
      : ownerAgentId !== null && visibleOwners.ids.has(ownerAgentId)

  // Focus opzionale sui venditori selezionati nel calendario (overlay multi).
  // `agent_ids` (CSV) ha precedenza; in mancanza si usa `agent_id` (legacy).
  // I non autorizzati vengono scartati silenziosamente (no escalation).
  // focusAgentIds vuoto = nessun focus (mostra tutto ciò che è permesso).
  let focusAgentIds: Set<string> | null = null
  if (overrideAgentIds.length > 0) {
    const allowed = await resolveTargetAgentIds(svc, viewer, overrideAgentIds)
    focusAgentIds = new Set(allowed)
  } else if (overrideAgentId) {
    const scope = await resolveTargetAgentId(svc, viewer, overrideAgentId)
    if ("forbidden" in scope) {
      return NextResponse.json({ error: "forbidden", events: [] }, { status: 403 })
    }
    focusAgentIds = scope.agentId ? new Set([scope.agentId]) : new Set()
  }

  try {
    const events = await listEvents(fromD.toISOString(), toD.toISOString())

    // Mappa google_event_id -> agent_id proprietario. Cerchiamo le demo per id
    // ESATTO degli eventi nella finestra (non per data: evita drift di fuso
    // orario o disallineamenti requested_start/orario evento).
    const eventIds = events.map((e) => e.id).filter(Boolean)
    const demoOwnerByEvent = new Map<string, string | null>()
    const agentNameById = new Map<string, string>()
    if (eventIds.length > 0) {
      const { data: demos } = await svc
        .from("demo_requests")
        .select("google_event_id, agent_id")
        .in("google_event_id", eventIds)
      const ownerIds = new Set<string>()
      for (const d of demos ?? []) {
        if (d.google_event_id) {
          demoOwnerByEvent.set(d.google_event_id, d.agent_id)
          if (d.agent_id) ownerIds.add(d.agent_id)
        }
      }
      if (ownerIds.size > 0) {
        const { data: agents } = await svc
          .from("sales_agents")
          .select("id, display_name")
          .in("id", Array.from(ownerIds))
        for (const a of agents ?? []) {
          if (a.display_name) agentNameById.set(a.id, a.display_name)
        }
      }
    }

    // Attribuzione AUTOMATICA per email invitato: una demo creata a mano su
    // Google (senza riga demo_requests) viene attribuita al venditore se la sua
    // email registrata (email o sender_email) e' tra i partecipanti dell'evento.
    // Match ESATTO case-insensitive (niente fuzzy: mai attribuire al venditore
    // sbagliato). Carichiamo la mappa solo se ci sono eventi senza owner-row.
    const emailToAgent = new Map<string, string>()
    const hasUnownedDemo = events.some(
      (e) => !demoOwnerByEvent.has(e.id) && e.participantEmails.length > 0,
    )
    if (hasUnownedDemo) {
      const { data: allAgents } = await svc
        .from("sales_agents")
        .select("id, display_name, email, sender_email")
        .eq("is_active", true)
      for (const a of allAgents ?? []) {
        for (const e of [a.email, a.sender_email]) {
          const key = (e || "").trim().toLowerCase()
          if (key) emailToAgent.set(key, a.id)
        }
        if (a.display_name) agentNameById.set(a.id, a.display_name)
      }
    }
    const resolveOwnerByEmail = (participantEmails: string[]): string | null => {
      for (const e of participantEmails) {
        const agentId = emailToAgent.get(e)
        if (agentId) return agentId
      }
      return null
    }

    // Una demo prenotata direttamente su Google Calendar puo' NON avere una riga
    // demo_requests collegata: la riconosciamo comunque dal titolo ("Demo ...")
    // per non far trapelare dettagli (default sicuro).
    const looksLikeDemo = (title: string | null) => /(^|\s)demo\b/i.test(title ?? "")

    const safeEvents = events.flatMap((rawEv) => {
      // `participantEmails` resta server-side: non va mai esposto al client.
      const { participantEmails, ...ev } = rawEv
      const hasOwnerRow = demoOwnerByEvent.has(ev.id)
      // Owner: prima la riga demo_requests (autoritativa), poi il fallback per
      // email invitato (demo creata a mano su Google e mai passata in piattaforma).
      const ownerAgentId = hasOwnerRow
        ? demoOwnerByEvent.get(ev.id) ?? null
        : resolveOwnerByEmail(participantEmails)
      const isDemo = hasOwnerRow || ownerAgentId !== null || looksLikeDemo(ev.title)

      // Non e' una demo (es. blocchi "Ufficio"): lasciamo invariato (contesto
      // di disponibilità, mantenuto anche quando si focalizza un venditore).
      if (!isDemo) return [{ ...ev, isDemo: false }]

      // Focus sui venditori selezionati: nascondi solo le demo ATTRIBUITE a un
      // venditore FUORI dal set. Le demo NON attribuite (ownerAgentId null)
      // restano visibili: cosi' il capo area/super admin puo' trovarle e
      // assegnarle anche mentre filtra un venditore.
      if (focusAgentIds && focusAgentIds.size > 0 && ownerAgentId && !focusAgentIds.has(ownerAgentId)) {
        return []
      }

      // Vede i dettagli (titolo + link Meet): super admin, il venditore
      // proprietario, oppure il CAPO AREA se l'owner è nel suo team.
      // `ownerAgentId` viene esposto per consentire la colorazione per venditore
      // lato client (overlay multi-calendario).
      if (canSeeOwner(ownerAgentId)) {
        const ownerName = ownerAgentId ? agentNameById.get(ownerAgentId) ?? null : null
        return [{ ...ev, isDemo: true, ownerAgentId, ownerName }]
      }

      // Demo di un altro venditore (o owner non determinabile): solo "occupato".
      return [
        {
          ...ev,
          title: "Demo prenotata",
          meetLink: null,
          htmlLink: null,
          isDemo: true,
          ownerAgentId: null,
        },
      ]
    })

    return NextResponse.json({ configured: true, events: safeEvents })
  } catch (err) {
    console.error("[google-availability] error:", err instanceof Error ? err.message : err)
    return NextResponse.json({ configured: true, events: [], error: "google_fetch_failed" }, { status: 200 })
  }
}
