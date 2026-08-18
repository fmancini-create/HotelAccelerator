/**
 * Manifesto della navigazione: FONTE UNICA di cosa appare nel menu e nella
 * pagina Impostazioni.
 *
 * Perche' esiste
 * --------------
 * Prima c'erano TRE elenchi paralleli: PRIMARY_NAV/MORE_NAV dentro l'header,
 * `settingsItems` dentro app/admin/settings/page.tsx, e il catalogo delle aree.
 * Tre elenchi scritti a mano sulle stesse destinazioni divergono, e infatti
 * divergevano:
 *
 *   - "Tracking" nel menu era concedibile per area, nelle schede Impostazioni
 *     era marcato solo-admin => un membro con l'area concessa lo vedeva nel
 *     menu e NON nelle impostazioni.
 *   - Stessa cosa per "CMS".
 *
 * La guardia vera (app/admin/tracking/layout.tsx e app/admin/cms/layout.tsx)
 * chiama `requireAreaPage("tracking")` / `requireAreaPage("cms")`: sono aree
 * CONCEDIBILI, non riservate agli amministratori. Quindi il menu aveva ragione
 * e le schede erano piu' severe della realta', nascondendo a un membro una
 * pagina che poteva legittimamente aprire. Qui la regola e' dichiarata UNA
 * volta e i due posti la leggono, cosi' non possono piu' dire cose diverse.
 *
 * Il criterio di classificazione
 * ------------------------------
 * - `operative`: si USA per lavorare (Inbox, Telefonate, turni, campagne...).
 *   Ha un pulsante proprio nel menu.
 * - `settings`: si IMPOSTA una funzione e poi si torna a lavorare (canali,
 *   basi di conoscenza, chiavi di tracking, utenti, moduli...). Vive sotto
 *   l'unica voce "Impostazioni".
 *
 * In entrambi i casi la visibilita' resta governata da permessi e moduli: la
 * riorganizzazione cambia DOVE si trova una voce, non chi puo' vederla.
 */

import {
  Activity,
  BarChart3,
  Boxes,
  CalendarClock,
  FileText,
  Globe,
  Image as ImageIcon,
  Inbox,
  KeyRound,
  LayoutDashboard,
  ListTodo,
  Lock,
  Mail,
  Megaphone,
  MessageSquare,
  PhoneCall,
  Radio,
  Scale,
  Settings,
  Sparkles,
  Tag,
  Users,
} from "lucide-react"

/**
 * Dove vive la voce:
 *  - "operative": pulsante proprio nel menu (parti operative).
 *  - "settings":  sotto l'unica voce "Impostazioni" (configurazione).
 */
export type NavPlacement = "operative" | "settings"

export interface NavEntry {
  /** Identificativo stabile della voce (chiave di React, niente DB). */
  id: string
  href: string
  label: string
  /**
   * Frase che spiega la voce. Usata dalle schede in /admin/settings; nel menu
   * a tendina non si mostra (lo spazio non basta) ma resta l'unica descrizione
   * scritta, quindi non puo' divergere fra i due posti.
   */
  description: string
  placement: NavPlacement
  icon: React.ComponentType<{ className?: string }>
  /**
   * Voci operative con `primary` stanno in chiaro nella barra su desktop; le
   * altre nella tendina "Altro". Serve solo a non far tracimare la barra.
   */
  primary?: boolean
  /**
   * Chiave del MODULO che governa la voce: se il modulo non e' attivo per la
   * struttura, la voce non compare.
   */
  module?: string
  /**
   * Chiave dell'AREA (lib/platform/areas.ts). Un membro non-admin vede la voce
   * solo se l'area gli e' stata concessa. Deve esistere in ALL_AREA_KEYS: c'e'
   * una prova che lo verifica (scripts/check-nav-manifest.ts), altrimenti un
   * refuso silenzioso nasconderebbe la voce per sempre.
   */
  area?: string
  /** Riservata agli amministratori (super_admin / tenant admin). */
  adminOnly?: boolean
  /** Permesso puntuale richiesto oltre al ruolo. */
  requiresPermission?: "can_manage_users"
  /** Riconoscimento della voce attiva quando l'URL ha sottopagine. */
  match?: (pathname: string) => boolean
}

/**
 * L'unico elenco. L'ordine e' quello che si vede a schermo.
 */
export const NAV_ENTRIES: NavEntry[] = [
  // ===================== PARTI OPERATIVE =====================
  // In chiaro nella barra (desktop): il lavoro di tutti i giorni.
  {
    id: "dashboard",
    href: "/admin/dashboard",
    label: "Dashboard",
    description: "Sintesi della struttura: conversazioni, chiamate e attivita' recenti",
    placement: "operative",
    icon: LayoutDashboard,
    primary: true,
  },
  {
    id: "inbox",
    href: "/admin/inbox",
    label: "Inbox",
    description: "Tutte le conversazioni dei canali in un'unica casella condivisa",
    placement: "operative",
    icon: Inbox,
    module: "inbox",
    primary: true,
  },
  {
    id: "crm",
    href: "/admin/crm",
    label: "CRM",
    description: "Contatti, richieste e storico dei rapporti con gli ospiti",
    placement: "operative",
    icon: Users,
    match: (p) => p.startsWith("/admin/crm"),
    module: "crm",
    area: "crm",
    primary: true,
  },
  {
    id: "calls",
    href: "/admin/calls",
    label: "Telefonate",
    description: "Registro delle chiamate del centralino, comprese quelle perse",
    placement: "operative",
    icon: PhoneCall,
    module: "inbox",
    area: "calls",
    primary: true,
  },
  {
    id: "marketing",
    href: "/admin/marketing",
    label: "Email Marketing",
    description: "Campagne email verso i contatti della struttura",
    placement: "operative",
    icon: Megaphone,
    match: (p) => p.startsWith("/admin/marketing"),
    area: "marketing",
    primary: true,
  },

  // Operative secondarie: nella tendina "Altro" per non far tracimare la barra.
  {
    id: "my-work",
    href: "/admin/my-work",
    label: "I miei turni",
    description: "I tuoi turni assegnati, da confermare o segnalare",
    placement: "operative",
    icon: CalendarClock,
    module: "hr",
  },
  {
    id: "hr",
    href: "/admin/hr",
    label: "Personale e turni",
    description: "Dipendenti, tabellone dei turni, assenze e pubblicazione",
    placement: "operative",
    icon: CalendarClock,
    module: "hr",
    area: "hr",
    adminOnly: true,
  },
  {
    id: "todos",
    href: "/admin/todos",
    label: "Todos",
    description: "Attivita' da svolgere assegnate al personale",
    placement: "operative",
    icon: ListTodo,
    area: "todos",
  },
  {
    // Consultazione quotidiana: "Sessioni live e timeline eventi".
    id: "tracking-visitors",
    href: "/admin/tracking/visitors",
    label: "Visitatori",
    description: "Sessioni in corso sul sito e cronologia degli eventi",
    placement: "operative",
    icon: BarChart3,
    module: "tracking",
    // Stessa chiave d'area della configurazione: `requireAreaPage("tracking")`
    // protegge TUTTO /admin/tracking. Separare i permessi avrebbe richiesto una
    // nuova chiave, e chi ha "tracking" concesso oggi avrebbe perso l'accesso.
    area: "tracking",
  },
  {
    // "Monitora le date piu' cercate dai tuoi potenziali ospiti".
    id: "tracking-demand",
    href: "/admin/tracking/demand",
    label: "Calendario domanda",
    description: "Le date piu' cercate dai potenziali ospiti, giorno per giorno",
    placement: "operative",
    icon: CalendarClock,
    module: "tracking",
    area: "tracking",
  },
  {
    id: "monitoring",
    href: "/admin/monitoring",
    label: "Monitoring",
    description: "Stato del sistema e segnalazioni da tenere d'occhio",
    placement: "operative",
    icon: Activity,
    area: "monitoring",
  },

  // ===================== IMPOSTAZIONI =====================
  // Si imposta una funzione, poi si torna a lavorare.
  {
    id: "channels",
    href: "/admin/channels",
    label: "Canali",
    description: "Email, WhatsApp, Telegram, Chat e Telefono IP",
    placement: "settings",
    icon: Radio,
    match: (p) => p.startsWith("/admin/channels"),
    module: "inbox",
  },
  {
    id: "knowledge",
    href: "/admin/knowledge",
    label: "Assistente IA",
    description: "Basi di conoscenza, comportamento e domande da approvare",
    placement: "settings",
    icon: Sparkles,
    match: (p) => p.startsWith("/admin/knowledge"),
    module: "inbox",
    adminOnly: true,
  },
  {
    id: "cms",
    href: "/admin/cms/studio",
    label: "CMS",
    description: "Crea il sito con template, chat guidata e gestione pagine",
    placement: "settings",
    icon: FileText,
    match: (p) => p.startsWith("/admin/cms"),
    module: "cms",
    // Area concedibile, NON solo-admin: e' quello che fa la guardia vera in
    // app/admin/cms/layout.tsx. Le schede la marcavano adminOnly e la
    // nascondevano a chi poteva aprirla.
    area: "cms",
  },
  {
    id: "message-rules",
    href: "/admin/message-rules",
    label: "Regole Messaggi",
    description: "Configura messaggi automatici basati sul comportamento",
    placement: "settings",
    icon: MessageSquare,
    module: "inbox",
    area: "message-rules",
  },
  {
    id: "photos",
    href: "/admin/photos",
    label: "Foto",
    description: "Carica e organizza le foto della struttura",
    placement: "settings",
    icon: ImageIcon,
    area: "photos",
  },
  {
    id: "gallery",
    href: "/admin/gallery",
    label: "Gallery",
    description: "Composizione delle gallerie mostrate sul sito",
    placement: "settings",
    icon: ImageIcon,
    area: "gallery",
  },
  {
    id: "categories",
    href: "/admin/categories",
    label: "Categorie",
    description: "Categorie con cui si classificano le foto",
    placement: "settings",
    icon: Tag,
    area: "categories",
  },
  {
    // La parte di IMPOSTAZIONE del tracking: le chiavi e i domini. La pagina
    // dichiara "Gestisci le chiavi di tracking per i siti dei tuoi clienti".
    id: "tracking-sites",
    href: "/admin/tracking/sites",
    label: "Tracking & Siti",
    description: "Chiavi di tracking e domini autorizzati dei siti",
    placement: "settings",
    icon: BarChart3,
    module: "tracking",
    area: "tracking",
  },
  {
    // Quali caselle e canali contano nei numeri del cruscotto.
    //
    // Area "tracking" (come le altre pagine di statistiche) ma SENZA `module`:
    // legare la voce al modulo tracking la farebbe sparire dove quel modulo non
    // e' attivo, e la scelta serve comunque, perche' i volumi per canale si
    // contano anche senza tracciamento dei siti.
    id: "analytics-sources",
    href: "/admin/settings/analytics-sources",
    label: "Sorgenti statistiche",
    description: "Caselle e canali che contano nei numeri del cruscotto",
    placement: "settings",
    icon: BarChart3,
    area: "tracking",
  },
  {
    id: "embed-scripts",
    href: "/admin/embed-scripts",
    label: "Embed scripts",
    description: "Script da incorporare nei siti della struttura",
    placement: "settings",
    icon: Mail,
    area: "embed-scripts",
  },
  {
    id: "domains",
    href: "/admin/settings/domains",
    label: "Domini",
    description: "Sottodominio e dominio personalizzato della struttura",
    placement: "settings",
    icon: Globe,
    adminOnly: true,
  },
  {
    id: "site-legal",
    href: "/admin/settings/site-legal",
    label: "Dati legali e policy",
    description: "Footer societario, Privacy Policy, Cookie Policy e White Label",
    placement: "settings",
    icon: Scale,
    adminOnly: true,
  },
  {
    id: "api-access",
    href: "/admin/settings/api-access",
    label: "Accesso API",
    description: "Token con cui un sistema esterno legge i dati della struttura",
    placement: "settings",
    icon: KeyRound,
    adminOnly: true,
  },
  {
    id: "users",
    href: "/admin/users",
    label: "Gestione Utenti",
    description: "Utenti, ruoli e aree visibili a ciascuno",
    placement: "settings",
    icon: Users,
    match: (p) => p.startsWith("/admin/users"),
    adminOnly: true,
    requiresPermission: "can_manage_users",
  },
  {
    id: "modules",
    href: "/admin/modules",
    label: "Moduli",
    description: "Attiva e gestisci i moduli della piattaforma",
    placement: "settings",
    icon: Boxes,
    match: (p) => p.startsWith("/admin/modules"),
    adminOnly: true,
  },
  {
    id: "billing",
    href: "/admin/billing",
    label: "Abbonamento & Fatturazione",
    description: "Piano, quote e gestione della sottoscrizione",
    placement: "settings",
    icon: Activity,
    adminOnly: true,
  },
  {
    id: "profile",
    href: "/admin/profile",
    label: "Il Mio Profilo",
    description: "Modifica la tua password e visualizza i tuoi permessi",
    placement: "settings",
    icon: Lock,
  },
]

/** Icona della voce "Impostazioni" (tendina nel menu + scorciatoia utente). */
export const SETTINGS_ICON = Settings

/** Percorso della pagina che raccoglie tutte le impostazioni. */
export const SETTINGS_HUB_HREF = "/admin/settings"

export const OPERATIVE_ENTRIES: NavEntry[] = NAV_ENTRIES.filter((e) => e.placement === "operative")
export const SETTINGS_ENTRIES: NavEntry[] = NAV_ENTRIES.filter((e) => e.placement === "settings")

/** Operative mostrate in chiaro nella barra (desktop). */
export const OPERATIVE_PRIMARY: NavEntry[] = OPERATIVE_ENTRIES.filter((e) => e.primary)
/** Operative raccolte nella tendina "Altro". */
export const OPERATIVE_SECONDARY: NavEntry[] = OPERATIVE_ENTRIES.filter((e) => !e.primary)

/**
 * Contesto di visibilita' di chi sta guardando il menu.
 * `isAdmin` e `areas` arrivano da /api/platform/me, `activeModules` da
 * /api/platform/modules.
 */
export interface NavViewer {
  isAdmin?: boolean
  areas?: string[]
  activeModules?: string[] | null
  canManageUsers?: boolean
}

/**
 * Filtro unico applicato da TUTTI i consumatori (menu e pagina Impostazioni).
 * Prima ogni posto rifaceva il filtro a modo suo: e' cosi' che nascono le
 * divergenze.
 *
 * Scelte deliberate, diverse tra loro:
 *  - moduli: FAIL-OPEN. Se non sappiamo quali moduli sono attivi (dato non
 *    ancora arrivato o errore di rete) mostriamo tutto: far sparire il menu a
 *    chi sta lavorando e' peggio che mostrare una voce in piu', e la pagina ha
 *    comunque la sua guardia.
 *  - ruolo e aree: FAIL-CLOSED. Finche' non sappiamo se chi guarda e' un
 *    amministratore, le voci riservate restano nascoste: mostrarle "per
 *    ottimismo" significherebbe far intravedere fatturazione e utenti a un
 *    dipendente.
 */
export function visibleEntries(entries: NavEntry[], viewer: NavViewer): NavEntry[] {
  const { isAdmin, areas, activeModules, canManageUsers } = viewer
  const active = activeModules ? new Set(activeModules) : null
  const granted = new Set(areas ?? [])

  return entries.filter((entry) => {
    // Moduli: fail-open quando il dato non c'e'.
    if (entry.module && active && !active.has(entry.module)) return false

    if (isAdmin) return true

    // Da qui in giu' si parla di un membro (o di un ruolo ancora ignoto).
    if (entry.adminOnly) return false
    if (entry.requiresPermission === "can_manage_users" && !canManageUsers) return false
    if (entry.area && !granted.has(entry.area)) return false
    return true
  })
}
