import type { NavViewer } from "@/lib/platform/nav"
import { BASELINE_AREA_KEYS } from "@/lib/platform/areas"

export type PanelKind = "attention" | "personal" | "metrics" | "oversight"

export interface DashboardPanel {
  id: string
  title: string
  hint: string
  kind: PanelKind
  adminOnly?: boolean
  area?: string
  module?: string
  href?: string
}

/**
 * Single dashboard manifest. Permissions/modules decide what a user MAY see;
 * per-user tenant settings may subsequently hide a subset, never grant more.
 */
export const DASHBOARD_PANELS: DashboardPanel[] = [
  {
    id: "backlog",
    title: "Messaggi da gestire",
    hint: "Conversazioni recenti da leggere o riprendere, rispettando i canali assegnati all'utente.",
    kind: "attention",
    module: "inbox",
    area: "inbox",
    href: "/admin/inbox",
  },
  {
    id: "stale",
    title: "Ferme da oltre 24 ore",
    hint: "Conversazioni aperte negli ultimi 7 giorni senza risposta da più di un giorno.",
    kind: "attention",
    module: "inbox",
    area: "inbox",
    href: "/admin/inbox",
  },
  {
    id: "leave-requests",
    title: "Assenze da approvare",
    hint: "Richieste in attesa di una risposta.",
    kind: "attention",
    module: "hr",
    area: "hr",
    adminOnly: true,
    href: "/admin/hr",
  },
  {
    id: "knowledge-gaps",
    title: "Domande senza risposta",
    hint: "Domande degli ospiti che l'assistente non ha saputo coprire nelle basi di conoscenza.",
    kind: "attention",
    module: "ai",
    adminOnly: true,
    href: "/admin/knowledge",
  },
  {
    id: "my-performance",
    title: "Le tue performance",
    hint: "Risposte, conversazioni e tempo mediano di risposta misurati dal momento in cui il tenant ha attivato i KPI.",
    kind: "personal",
    module: "inbox",
    area: "inbox",
  },
  {
    id: "my-shifts",
    title: "Turni in arrivo",
    hint: "Turni pubblicati non ancora iniziati. La tua agenda personale è in Le mie attività.",
    kind: "personal",
    module: "hr",
    href: "/admin/my-work",
  },
  {
    id: "my-todos",
    title: "Attività da fare",
    hint: "Attività assegnate a te che non sono ancora concluse.",
    kind: "personal",
    area: "todos",
    href: "/admin/todos",
  },
  {
    id: "calls",
    title: "Telefonate",
    hint: "Ultime chiamate e chiamate perse che non risultano ancora recuperate da un contatto successivo.",
    kind: "personal",
    module: "inbox",
    area: "calls",
    href: "/admin/calls",
  },
  {
    id: "volumes",
    title: "Volumi per canale",
    hint: "Da dove arrivano le conversazioni: totali sulle sorgenti scelte per le statistiche.",
    kind: "metrics",
    adminOnly: true,
    href: "/admin/inbox",
  },
  {
    id: "per-person",
    title: "Attività per persona",
    hint: "Risposte attribuite a ciascun operatore, con denominatori dichiarati.",
    kind: "metrics",
    adminOnly: true,
  },
  {
    id: "visitors",
    title: "Visitatori e domanda",
    hint: "Chi sta guardando il sito e cosa chiede.",
    kind: "metrics",
    module: "tracking",
    area: "tracking",
    href: "/admin/tracking/visitors",
  },
  {
    id: "campaigns",
    title: "Campagne email",
    hint: "Campagne create finora, in tutto lo storico.",
    kind: "metrics",
    area: "marketing",
    href: "/admin/marketing",
  },
  {
    id: "revenue",
    title: "Ricavi",
    hint: "Andamento economico della struttura.",
    kind: "metrics",
    adminOnly: true,
  },
  {
    id: "presence",
    title: "Chi è al lavoro adesso",
    hint: "Operatori con un segnale recente.",
    kind: "oversight",
    adminOnly: true,
    href: "/admin/users",
  },
  {
    id: "system-health",
    title: "Salute del sistema",
    hint: "Caselle collegate, allineamento e moduli attivi.",
    kind: "oversight",
    adminOnly: true,
    href: "/admin/settings",
  },
]

export const PANEL_ORDER: PanelKind[] = ["attention", "personal", "metrics", "oversight"]

export const PANEL_KIND_LABEL: Record<PanelKind, string> = {
  attention: "Richiede attenzione",
  personal: "Il tuo lavoro",
  metrics: "Andamento",
  oversight: "Sorveglianza",
}

export function visiblePanels(viewer: NavViewer): DashboardPanel[] {
  const { isAdmin, areas, activeModules } = viewer
  const active = activeModules ? new Set(activeModules) : null
  const granted = new Set([...(areas ?? []), ...BASELINE_AREA_KEYS])

  return DASHBOARD_PANELS.filter((panel) => {
    if (panel.module && active && !active.has(panel.module)) return false
    if (isAdmin) return true
    if (panel.adminOnly) return false
    if (panel.area && !granted.has(panel.area)) return false
    return true
  })
}

export function dashboardProfileLabel(viewer: NavViewer): string {
  if (viewer.isAdmin) return "Direzione"

  const granted = new Set(viewer.areas ?? [])
  const hasInbox = granted.has("inbox") || BASELINE_AREA_KEYS.includes("inbox")
  const hasCalls = granted.has("calls")

  if (hasInbox && hasCalls) return "Ricevimento"
  if (granted.has("hr")) return "Personale"
  if (hasInbox) return "Operativo"
  return "Il tuo lavoro"
}
