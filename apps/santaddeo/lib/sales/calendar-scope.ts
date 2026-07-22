import { createServiceRoleClient } from "@/lib/supabase/server"

/**
 * Scoping condiviso del CALENDARIO VENDITORI (creato 23/06/2026).
 *
 * Regola di visibilità:
 *  - ogni venditore vede il PROPRIO calendario (task, eventi personali, demo);
 *  - il CAPO AREA (sales_agents.is_area_manager) vede anche i calendari e i
 *    link (Google Meet delle demo) dei venditori del proprio team, cioè gli
 *    agenti con `parent_agent_id === capoArea.id`;
 *  - il super_admin vede tutti.
 *
 * Centralizzato qui per essere riusato in modo IDENTICO (e sicuro) da:
 *  - /api/sales/calendar           (task pianificati + attività)
 *  - /api/sales/calendar/my-events (eventi dei calendari personali ICS)
 *  - /api/sales/calendar/google-availability (demo del calendario condiviso)
 */

type Svc = Awaited<ReturnType<typeof createServiceRoleClient>>

export interface CalendarViewer {
  userId: string
  /** Agente (sales_agents) collegato all'utente, se esiste ed è attivo. */
  agentId: string | null
  isSuperAdmin: boolean
  isAreaManager: boolean
}

/** Risolve ruolo + agente collegato dell'utente loggato. */
export async function resolveCalendarViewer(svc: Svc, userId: string): Promise<CalendarViewer> {
  const [{ data: profile }, { data: agent }] = await Promise.all([
    svc.from("profiles").select("role").eq("id", userId).maybeSingle(),
    svc
      .from("sales_agents")
      .select("id, is_area_manager")
      .eq("user_id", userId)
      .eq("is_active", true)
      .maybeSingle(),
  ])
  return {
    userId,
    agentId: agent?.id ?? null,
    isSuperAdmin: profile?.role === "super_admin",
    isAreaManager: Boolean(agent?.is_area_manager),
  }
}

/**
 * Decide quale agente può essere ispezionato dal viewer, dato un `agent_id`
 * richiesto (opzionale).
 *  - assente o uguale a sé stesso  -> il proprio agentId
 *  - super_admin                    -> qualsiasi agente esistente e attivo
 *  - capo area                      -> solo agenti del proprio team
 * Ritorna `{ agentId }` (può essere null se l'utente non è un agente e non ha
 * chiesto nessuno) oppure `{ forbidden: true }` se non autorizzato.
 */
export async function resolveTargetAgentId(
  svc: Svc,
  viewer: CalendarViewer,
  requestedAgentId: string | null,
): Promise<{ agentId: string | null } | { forbidden: true }> {
  // Nessun agente richiesto, oppure ha chiesto sé stesso: usa il proprio.
  if (!requestedAgentId || requestedAgentId === viewer.agentId) {
    return { agentId: viewer.agentId }
  }

  // Super admin: può ispezionare chiunque (se esiste ed è attivo).
  if (viewer.isSuperAdmin) {
    const { data } = await svc
      .from("sales_agents")
      .select("id, is_active")
      .eq("id", requestedAgentId)
      .maybeSingle()
    if (data?.is_active) return { agentId: data.id }
    return { forbidden: true }
  }

  // Capo area: solo i membri del proprio team (parent_agent_id === suo id).
  if (viewer.isAreaManager && viewer.agentId) {
    const { data } = await svc
      .from("sales_agents")
      .select("id, parent_agent_id, is_active")
      .eq("id", requestedAgentId)
      .maybeSingle()
    if (data?.is_active && data.parent_agent_id === viewer.agentId) {
      return { agentId: data.id }
    }
  }

  return { forbidden: true }
}

/**
 * Variante MULTI-AGENTE del selettore (overlay come il calendario superadmin):
 * dato un elenco di `agent_id` richiesti, ritorna l'insieme di quelli che il
 * viewer è autorizzato a ispezionare (riusa `resolveTargetAgentId` per ciascuno
 * e scarta silenziosamente quelli non consentiti). Se la lista è vuota, usa il
 * proprio agentId come default. Mantiene la stessa sicurezza della versione
 * singola: nessuna escalation, i non autorizzati vengono semplicemente esclusi.
 */
export async function resolveTargetAgentIds(
  svc: Svc,
  viewer: CalendarViewer,
  requestedAgentIds: string[],
): Promise<string[]> {
  const cleaned = Array.from(new Set(requestedAgentIds.filter(Boolean)))
  if (cleaned.length === 0) {
    return viewer.agentId ? [viewer.agentId] : []
  }
  const allowed = new Set<string>()
  for (const reqId of cleaned) {
    const res = await resolveTargetAgentId(svc, viewer, reqId)
    if ("agentId" in res && res.agentId) allowed.add(res.agentId)
  }
  return Array.from(allowed)
}

/**
 * Insieme di agentId di cui il viewer può vedere i DETTAGLI demo (titolo +
 * link Meet/evento) nel calendario condiviso clienti@4bid.it:
 *  - super_admin            -> { all: true }
 *  - capo area              -> sé stesso + team
 *  - venditore semplice     -> solo sé stesso
 */
export async function resolveVisibleDemoOwners(
  svc: Svc,
  viewer: CalendarViewer,
): Promise<{ all: true } | { ids: Set<string> }> {
  if (viewer.isSuperAdmin) return { all: true }

  const ids = new Set<string>()
  if (viewer.agentId) {
    ids.add(viewer.agentId)
    if (viewer.isAreaManager) {
      const { data: team } = await svc
        .from("sales_agents")
        .select("id")
        .eq("parent_agent_id", viewer.agentId)
      for (const a of team ?? []) ids.add(a.id)
    }
  }
  return { ids }
}
