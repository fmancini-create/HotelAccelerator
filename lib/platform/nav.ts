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
  Gauge,
  Boxes,
  Building2,
  CalendarClock,
  Coins,
  CreditCard,
  Database,
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
  UserPlus,
  Users,
} from "lucide-react"

/**
 * Dove vive la voce:
 *  - "operative": pulsante proprio nel menu (parti operative).
 *  - "settings":  sotto l'unica voce "Impostazioni" (configurazione).
 *  - "platform":  gruppo a parte, visibile solo a chi amministra la
 *    piattaforma. Non e' "operative" perche' non riguarda il lavoro di una
 *    struttura (elenco dei clienti, fatturato complessivo, costi dei moduli), e
 *    non e' "settings" perche' non si configura la struttura in cui si sta
 *    lavorando. Tenerlo distinto evita che un albergatore ci finisca dentro
 *    scorrendo il proprio menu.
 */
export type NavPlacement = "operative" | "settings" | "platform"

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
  /** Per launcher esterni: nascondi la voce finche' gli entitlement non sono noti. */
  strictModule?: boolean
  /**
   * Chiave dell'AREA (lib/platform/areas.ts). Un membro non-admin vede la voce
   * solo se l'area gli e' stata concessa. Deve esistere in ALL_AREA_KEYS: c'e'
   * una prova che lo verifica (scripts/check-nav-manifest.ts), altrimenti un
   * refuso silenzioso nasconderebbe la voce per sempre.
   */
  area?: string
  /** Riservata agli amministratori (super_admin / tenant admin). */
  adminOnly?: boolean
  /**
   * Riservata a chi amministra LA PIATTAFORMA (solo super_admin).
   *
   * PERCHE' NON BASTA `adminOnly`. Quel flag significa "super_admin OPPURE
   * amministratore di una struttura": e' giusto per Utenti o Fatturazione, dove
   * ogni albergatore gestisce i propri. Ma le sezioni di piattaforma mostrano
   * l'elenco di TUTTI i clienti, il fatturato complessivo e i costi dei moduli:
   * marcarle `adminOnly` le mostrerebbe a ogni albergatore, cioe' farebbe
   * vedere a un cliente i dati dei concorrenti.
   *
   * Va quindi controllata PRIMA della scorciatoia `if (isAdmin) return true`,
   * altrimenti un amministratore di struttura la scavalcherebbe.
   */
  platformOnly?: boolean
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
    // Operativa (si consulta, non si configura) ma riservata a chi amministra:
    // confronta i colleghi fra loro. Senza `adminOnly` il menu la offrirebbe a
    // chiunque, mentre il layout la nega: menu e guardia direbbero cose diverse,
    // che e' il difetto dei tre elenchi divergenti gia' corretto.
    id: "operator-performance",
    href: "/admin/operator-performance",
    label: "Performance operatori",
    description: "Quante risposte manda ciascuno e quanto attende chi scrive",
    placement: "operative",
    icon: Gauge,
    adminOnly: true,
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
    id: "suite-hotelprofitai",
    href: "/api/platform/suite-launch?product=hotelprofitai",
    label: "Controllo di gestione",
    description: "Apri HotelProfitAI senza un nuovo login",
    placement: "operative",
    icon: Coins,
    module: "hotelprofitai",
    strictModule: true,
  },
  {
    id: "suite-santaddeo",
    href: "/api/platform/suite-launch?product=santaddeo",
    label: "Revenue & pricing",
    description: "Apri Santaddeo senza un nuovo login",
    placement: "operative",
    icon: BarChart3,
    module: "santaddeo",
    strictModule: true,
  },
  {
    id: "suite-manubot",
    href: "/api/platform/suite-launch?product=manubot",
    label: "Gestione manutenzioni",
    description: "Apri ManuBot senza un nuovo login",
    placement: "operative",
    icon: ListTodo,
    module: "manubot",
    strictModule: true,
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
    /*
     * Il collegamento al gestionale si CONFIGURA, quindi sta fra le
     * impostazioni. La voce "PMS" nella barra del CRM ora apre direttamente il
     * gestionale, che e' cio' che si usa ogni giorno: la configurazione si
     * tocca una volta e poi non si guarda piu'.
     *
     * `area: "crm"` e non `adminOnly`: la guardia vera di queste pagine e'
     * `requireAreaPage("crm")` nel layout di app/admin/crm. Mettere qui
     * `adminOnly` farebbe dire al menu una cosa e alla guardia un'altra, che e'
     * il difetto dei tre elenchi divergenti gia' corretto in questo file.
     */
    id: "pms-config",
    href: "/admin/crm/pms-sync",
    label: "Collegamento gestionale",
    description: "Credenziali e stato della sincronizzazione con il PMS della struttura",
    placement: "settings",
    icon: Database,
    module: "crm",
    area: "crm",
  },
  {
    id: "profile",
    href: "/admin/profile",
    label: "Il Mio Profilo",
    description: "Modifica la tua password e visualizza i tuoi permessi",
    placement: "settings",
    icon: Lock,
  },

  // ===================== PIATTAFORMA (solo super admin) =====================
  // Prima queste voci erano un SECONDO elenco scritto a mano dentro
  // app/super-admin/layout.tsx. E' lo stesso errore che questo file esisteva
  // per risolvere: due elenchi separati divergono, e infatti divergevano — il
  // menu la' ne dichiarava 5 mentre le pagine su disco erano 7, quindi "Costi
  // moduli" e "Nuovo cliente" erano raggiungibili solo scrivendo l'indirizzo a
  // mano.
  //
  // Tutte `platformOnly`: NON `adminOnly`, che comprenderebbe anche
  // l'amministratore di una struttura e gli mostrerebbe i dati dei concorrenti.
  {
    id: "platform-structures",
    href: "/super-admin/structures",
    label: "Strutture",
    description: "Tutti i clienti della piattaforma, con moduli attivi e stato dell'abbonamento",
    placement: "platform",
    icon: Building2,
    platformOnly: true,
    match: (p) => p.startsWith("/super-admin/structures"),
  },
  {
    id: "platform-onboarding",
    href: "/super-admin/onboarding",
    label: "Nuovo cliente",
    description: "Crea una nuova struttura e attiva i moduli acquistati",
    placement: "platform",
    icon: UserPlus,
    platformOnly: true,
  },
  {
    id: "platform-collaborators",
    href: "/super-admin/collaborators",
    label: "Collaboratori",
    description: "Chi lavora sulla piattaforma, con i relativi permessi",
    placement: "platform",
    icon: Users,
    platformOnly: true,
  },
  {
    id: "platform-billing",
    href: "/super-admin/billing",
    label: "Fatturazione piattaforma",
    description: "Abbonamenti, ricavi ricorrenti e pagamenti di tutti i clienti",
    placement: "platform",
    icon: CreditCard,
    platformOnly: true,
  },
  {
    id: "platform-module-costs",
    href: "/super-admin/module-costs",
    label: "Costi e prezzi dei moduli",
    description: "Quanto costa e a quanto si vende ogni modulo, per struttura",
    placement: "platform",
    icon: Coins,
    platformOnly: true,
  },
  {
    id: "platform-roadmap",
    href: "/super-admin/roadmap",
    label: "Roadmap",
    description: "Stato di avanzamento dei moduli della suite",
    placement: "platform",
    icon: ListTodo,
    platformOnly: true,
  },
  {
    id: "platform-settings",
    href: "/super-admin/settings",
    label: "Impostazioni piattaforma",
    description: "Configurazione trasversale della piattaforma",
    placement: "platform",
    icon: Settings,
    platformOnly: true,
  },
]

/** Icona della voce "Impostazioni" (tendina nel menu + scorciatoia utente). */
export const SETTINGS_ICON = Settings

/** Percorso della pagina che raccoglie tutte le impostazioni. */
export const SETTINGS_HUB_HREF = "/admin/settings"

export const OPERATIVE_ENTRIES: NavEntry[] = NAV_ENTRIES.filter((e) => e.placement === "operative")
export const SETTINGS_ENTRIES: NavEntry[] = NAV_ENTRIES.filter((e) => e.placement === "settings")
/**
 * Sezioni di piattaforma. Restano fuori da OPERATIVE_* e SETTINGS_* perche'
 * quei due filtri confrontano il collocamento in modo esatto: nessuna voce di
 * piattaforma puo' finire per sbaglio nel menu di una struttura.
 */
export const PLATFORM_ENTRIES: NavEntry[] = NAV_ENTRIES.filter((e) => e.placement === "platform")

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
  /**
   * Vero solo per chi amministra la piattaforma (`role === "super_admin"` da
   * /api/platform/me). Distinto da `isAdmin`, che comprende anche
   * l'amministratore di una singola struttura.
   */
  isPlatformAdmin?: boolean
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
  const { isAdmin, isPlatformAdmin, areas, activeModules, canManageUsers } = viewer
  const active = activeModules ? new Set(activeModules) : null
  const granted = new Set(areas ?? [])

  return entries.filter((entry) => {
    // I launcher esterni sono fail-closed: non devono apparire finche' non e'
    // stato confermato che il relativo modulo e' attivo per la struttura.
    if (entry.strictModule && (!active || !entry.module || !active.has(entry.module))) return false
    // Moduli normali: fail-open quando il dato non c'e'.
    if (entry.module && active && !active.has(entry.module)) return false

    // Piattaforma: PRIMA della scorciatoia qui sotto, e fail-closed.
    //
    // L'ordine e' la sostanza del controllo, non uno stile. `if (isAdmin)`
    // restituisce `true` e chiude il discorso: un amministratore di struttura
    // e' `isAdmin`, quindi se questo controllo stesse DOPO vedrebbe l'elenco di
    // tutti i clienti e il fatturato complessivo della piattaforma.
    //
    // Fail-closed anche qui: se il ruolo non e' ancora arrivato,
    // `isPlatformAdmin` e' `undefined` e la voce resta nascosta. Nel dubbio non
    // si mostrano i dati di tutti i clienti; al massimo la voce comparira' un
    // istante dopo, quando /api/platform/me ha risposto.
    if (entry.platformOnly && !isPlatformAdmin) return false

    if (isAdmin) return true

    // Da qui in giu' si parla di un membro (o di un ruolo ancora ignoto).
    if (entry.adminOnly) return false
    if (entry.requiresPermission === "can_manage_users" && !canManageUsers) return false
    if (entry.area && !granted.has(entry.area)) return false
    return true
  })
}