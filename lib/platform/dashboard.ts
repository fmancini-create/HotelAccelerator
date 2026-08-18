/**
 * Quale dashboard vede chi.
 *
 * Il committente ha chiesto che ogni gruppo veda la dashboard piu' utile al suo
 * lavoro. I gruppi hanno pero' nomi liberi, scelti struttura per struttura
 * ("Front Office" qui, "Ricevimento" altrove), quindi NON si accoppia un nome a
 * una dashboard: si deduce tutto dai PERMESSI che il gruppo ha davvero (aree
 * concesse + moduli attivi + ruolo). Funziona con qualunque nome e su ogni
 * struttura, senza manutenzione.
 *
 * Il contesto di chi guarda (`NavViewer`) e' lo stesso del menu: un'unica
 * definizione di "cosa puo' vedere questa persona", non una copia che col tempo
 * divergerebbe.
 */

import type { NavViewer } from "@/lib/platform/nav"
// Le aree valide per tutti si leggono dal catalogo: riscriverle a mano qui
// avrebbe fatto divergere dashboard e menu, che e' il difetto appena chiuso.
import { BASELINE_AREA_KEYS } from "@/lib/platform/areas"

/** A cosa serve il pannello: decide anche l'ordine in pagina. */
export type PanelKind =
  /** Chiede un intervento adesso (arretrato, assenze da approvare). */
  | "attention"
  /** Il lavoro personale di chi guarda. */
  | "personal"
  /** Misura l'andamento: volumi, metriche, ricavi. */
  | "metrics"
  /** Sorveglianza: chi lavora, salute del sistema. */
  | "oversight"

export interface DashboardPanel {
  id: string
  title: string
  /** Riga di spiegazione: dice cosa sta guardando, non e' decorazione. */
  hint: string
  kind: PanelKind
  /** Riservato agli amministratori (super admin o tenant admin). */
  adminOnly?: boolean
  /**
   * Area richiesta (lib/platform/areas.ts). Un membro vede il pannello solo se
   * l'area gli e' concessa. Le aree baseline valgono per tutti.
   */
  area?: string
  /**
   * Modulo richiesto. Se il modulo NON e' attivo per la struttura il pannello
   * non si mostra affatto: il committente ha scelto "nascondere se il modulo e'
   * spento, dire nessun dato se e' attivo".
   */
  module?: string
  /**
   * Il pannello porta a una pagina: da un cruscotto ci si aspetta di poter
   * approfondire. Verificato che ogni indirizzo esista (check:dashboard).
   */
  href?: string
}

/**
 * I pannelli, in ordine di utilita': prima cio' che chiede attenzione, poi il
 * lavoro personale, poi le misure, infine la sorveglianza. Un operatore vede
 * quasi solo le prime due famiglie, la direzione vede tutto.
 */
export const DASHBOARD_PANELS: DashboardPanel[] = [
  // --- Chiede attenzione ---
  {
    id: "backlog",
    title: "Da gestire in casella",
    hint: "Conversazioni non lette e aperte: la casella e' condivisa, quindi il conto e' di tutti.",
    kind: "attention",
    module: "inbox",
    area: "inbox",
    href: "/admin/inbox",
  },
  {
    id: "stale",
    title: "Ferme da oltre 24 ore",
    hint: "Aperte senza un nuovo messaggio da piu' di un giorno: sono quelle che scivolano.",
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
    hint: "Domande degli ospiti che l'assistente non ha saputo coprire: da chiudere nelle basi.",
    kind: "attention",
    module: "ai",
    adminOnly: true,
    href: "/admin/knowledge",
  },

  // --- Il lavoro personale ---
  {
    id: "my-shifts",
    // NON "I miei turni": il turno e' legato alla scheda dipendente, che non
    // coincide con l'utente amministrativo. Contare i turni della struttura e
    // chiamarli "miei" sarebbe un numero giusto con l'etichetta sbagliata.
    title: "Turni in arrivo",
    hint: "Turni pubblicati non ancora iniziati. La tua agenda personale e' in Le mie attivita'.",
    kind: "personal",
    module: "hr",
    href: "/admin/my-work",
  },
  {
    id: "my-todos",
    title: "Attivita' aperte",
    hint: "Cose da fare non ancora chiuse.",
    kind: "personal",
    area: "todos",
    href: "/admin/todos",
  },
  {
    id: "calls",
    title: "Telefonate",
    hint: "Chiamate degli ultimi 7 giorni, con quelle perse in evidenza.",
    kind: "personal",
    module: "inbox",
    area: "calls",
    href: "/admin/calls",
  },

  // --- Misure ---
  {
    id: "volumes",
    title: "Volumi per canale",
    hint: "Da dove arrivano le conversazioni e quanto si muovono nelle 24 ore.",
    kind: "metrics",
    adminOnly: true,
    href: "/admin/inbox",
  },
  {
    id: "per-person",
    title: "Attivita' per persona",
    hint: "Risposte scritte da ciascuno. Dichiara quante risposte hanno un autore: senza quel dato il confronto ingannerebbe.",
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
    hint: "Invii recenti e loro esito.",
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

  // --- Sorveglianza ---
  {
    id: "presence",
    title: "Chi e' al lavoro adesso",
    hint: "Operatori con un segnale recente. Chi non si collega da tempo non compare come presente.",
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

/** Ordine in cui le famiglie compaiono in pagina. */
export const PANEL_ORDER: PanelKind[] = ["attention", "personal", "metrics", "oversight"]

export const PANEL_KIND_LABEL: Record<PanelKind, string> = {
  attention: "Richiede attenzione",
  personal: "Il tuo lavoro",
  metrics: "Andamento",
  oversight: "Sorveglianza",
}

/**
 * I pannelli che questa persona puo' vedere.
 *
 * Fail-closed su ruolo e aree: finche' non sappiamo se chi guarda e'
 * amministratore, i pannelli riservati restano nascosti (meglio un cruscotto
 * povero che mostrare a un dipendente i ricavi).
 *
 * Fail-open sui moduli: se l'elenco dei moduli attivi non e' ancora arrivato non
 * si svuota la pagina, altrimenti un ritardo di rete sembrerebbe un guasto.
 */
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

/**
 * Come si chiama, in parole, il cruscotto che questa persona sta vedendo.
 * Serve solo a spiegarglielo in testata: NON governa cosa vede (quello lo
 * decidono i permessi), quindi non puo' andare fuori sincrono con il contenuto.
 */
export function dashboardProfileLabel(viewer: NavViewer): string {
  if (viewer.isAdmin) return "Direzione"

  const granted = new Set(viewer.areas ?? [])
  const haCasella = granted.has("inbox") || BASELINE_AREA_KEYS.includes("inbox")
  const haTelefono = granted.has("calls")

  if (haCasella && haTelefono) return "Ricevimento"
  if (granted.has("hr")) return "Personale"
  if (haCasella) return "Operativo"
  return "Il tuo lavoro"
}
