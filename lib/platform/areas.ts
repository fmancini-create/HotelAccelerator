/**
 * Platform area catalog.
 *
 * An "area" is a top-level section of the admin app (Inbox, CRM, CMS, Photos,
 * Tracking, ...). Historically only CHANNELS were permissioned; areas were
 * reachable by anyone who could load the page. This catalog is the single
 * source of truth used by:
 *   - the per-user / per-group permission matrices (UI),
 *   - the nav filtering in the platform header,
 *   - the server-side page guards (requireAreaPage).
 *
 * Keys are stable strings stored in `user_area_permissions.area_key` and
 * `group_area_permissions.area_key`. Do NOT rename a key without a data
 * migration.
 */

export type AreaGroup = "operative" | "config"

export interface PlatformArea {
  /** Stable identifier persisted in the DB. */
  key: string
  /** Human label (Italian UI). */
  label: string
  /**
   * Classificazione dell'area:
   *  - "operative": si USA per lavorare => nel menu ha un pulsante proprio.
   *  - "config":    si IMPOSTA una funzione => vive sotto "Impostazioni".
   *
   * Serve sia a raggruppare la matrice dei permessi sia a spiegare la
   * collocazione nel menu. La collocazione effettiva e' dichiarata in
   * lib/platform/nav.ts (`placement`), che e' la fonte unica letta dal menu e
   * dalla pagina Impostazioni; una prova verifica che le due non divergano.
   */
  group: AreaGroup
  /** Primary route of the area (used by guards / nav). */
  href: string
  /**
   * Baseline areas are always available to every authenticated member and are
   * NOT shown in the grant matrix (you can't take them away).
   */
  baseline?: boolean
  /**
   * Admin-only areas are reserved to super_admins / tenant admins and are NOT
   * grantable to regular members (kept out of the matrix). Used for privilege-
   * sensitive sections (user management, billing, platform config).
   */
  adminOnly?: boolean
  /**
   * L'area si concede, ma da sola la concessione NON basta: la persona deve
   * anche essere responsabile (capogruppo) di almeno un gruppo della struttura.
   *
   * Serve perche' le due categorie esistenti non bastavano: `adminOnly` la
   * chiude a chiunque non sia amministratore, mentre un'area normale si apre a
   * qualunque membro a cui venga concessa. Qui la richiesta era "amministratore
   * oppure capogruppo, se il permesso e' attivo": due condizioni in E.
   *
   * Il filtro vive in `getMemberEffectiveAreas`, cioe' nella stessa funzione che
   * alimenta sia il menu sia le guardie di pagine e API: cosi' non possono
   * dire cose diverse.
   */
  requiresGroupLead?: boolean
}

export const PLATFORM_AREAS: PlatformArea[] = [
  // --- Baseline (always on for everyone) ---
  { key: "dashboard", label: "Dashboard", group: "operative", href: "/admin/dashboard", baseline: true },
  { key: "inbox", label: "Inbox", group: "operative", href: "/admin/inbox", baseline: true },
  { key: "profile", label: "Il Mio Profilo", group: "operative", href: "/admin/profile", baseline: true },
  { key: "settings", label: "Impostazioni", group: "operative", href: "/admin/settings", baseline: true },

  // --- Operative areas (grantable to members) ---
  { key: "crm", label: "CRM", group: "operative", href: "/admin/crm" },
  // Registro delle telefonate del centralino. Concedibile e NON riservata agli
  // amministratori: le chiamate senza risposta servono a chi sta alla reception,
  // mentre la configurazione del centralino resta in Canali (solo admin).
  { key: "calls", label: "Telefonate", group: "operative", href: "/admin/calls" },
  // Cosa ha imparato l'agente guardando lavorare nel gestionale. Riservata:
  // e' il registro di COME lavora il personale, quindi la vede chi risponde del
  // lavoro (amministratore o capogruppo), non chiunque abbia il CRM.
  // L'etichetta dice a chi concede che il permesso da solo non apre nulla.
  {
    key: "pms_learning",
    label: "Apprendimento agente (solo capogruppo)",
    group: "operative",
    href: "/admin/crm/pms-sync/apprendimento",
    requiresGroupLead: true,
  },
  { key: "todos", label: "Todos", group: "operative", href: "/admin/todos" },
  { key: "marketing", label: "Email Marketing", group: "operative", href: "/admin/marketing" },
  { key: "monitoring", label: "Monitoring", group: "operative", href: "/admin/monitoring" },
  { key: "hr", label: "Personale e turni", group: "operative", href: "/admin/hr", adminOnly: true },
  // Una sola chiave per tutto /admin/tracking: e' quello che protegge
  // `requireAreaPage("tracking")` nel layout. Nel MENU le tre destinazioni sono
  // separate (Visitatori e Calendario domanda fra le operative, le chiavi fra
  // le impostazioni), ma il permesso resta uno: spezzarlo avrebbe richiesto
  // nuove chiavi, e chi ha "tracking" concesso oggi avrebbe perso l'accesso
  // senza una migrazione dei dati. L'etichetta lo dice a chi concede.
  {
    key: "tracking",
    label: "Tracking (visitatori, domanda e chiavi)",
    group: "operative",
    href: "/admin/tracking/visitors",
  },

  // --- Content / config areas (grantable to members) ---
  // `group` non e' solo l'ordine della matrice dei permessi: e' la stessa
  // classificazione che decide DOVE sta la voce nel menu (operative = pulsante
  // proprio, config = sotto Impostazioni). Vedi lib/platform/nav.ts.
  { key: "cms", label: "CMS", group: "config", href: "/admin/cms/studio" },
  { key: "embed-scripts", label: "Embed scripts", group: "config", href: "/admin/embed-scripts" },
  { key: "photos", label: "Foto", group: "config", href: "/admin/photos" },
  { key: "gallery", label: "Gallery", group: "config", href: "/admin/gallery" },
  { key: "categories", label: "Categorie", group: "config", href: "/admin/categories" },
  { key: "message-rules", label: "Regole Messaggi", group: "config", href: "/admin/message-rules" },

  // --- Admin-only areas (never grantable to members) ---
  { key: "users", label: "Gestione Utenti", group: "config", href: "/admin/users", adminOnly: true },
  { key: "modules", label: "Moduli", group: "config", href: "/admin/modules", adminOnly: true },
  { key: "billing", label: "Abbonamento & Fatturazione", group: "config", href: "/admin/billing", adminOnly: true },
]

/** Area keys always available to every authenticated member. */
export const BASELINE_AREA_KEYS: string[] = PLATFORM_AREAS.filter((a) => a.baseline).map((a) => a.key)

/** Set of all valid area keys (for input validation). */
export const ALL_AREA_KEYS: Set<string> = new Set(PLATFORM_AREAS.map((a) => a.key))

/** Areas an admin can grant/revoke for members (excludes baseline + adminOnly). */
export function getGrantableAreas(): PlatformArea[] {
  return PLATFORM_AREAS.filter((a) => !a.baseline && !a.adminOnly)
}

/** Set of grantable area keys (used to sanitize incoming permission payloads). */
export const GRANTABLE_AREA_KEYS: Set<string> = new Set(getGrantableAreas().map((a) => a.key))

/** Lookup helper. */
export function getAreaByKey(key: string): PlatformArea | undefined {
  return PLATFORM_AREAS.find((a) => a.key === key)
}
