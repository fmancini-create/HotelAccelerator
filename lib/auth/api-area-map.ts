/**
 * Mappa rotta API -> area di piattaforma.
 *
 * PERCHE' ESISTE
 * I permessi per area erano applicati solo alle PAGINE (`requireAreaPage` nei
 * layout, 12 sezioni). Il commento di `requireAreaPage` lo dice esplicitamente:
 * "The underlying APIs should still enforce their own access". Non lo facevano:
 * su 135 rotte API, ZERO verificavano l'area. Un membro senza il permesso
 * "CRM" non vedeva la pagina, ma poteva chiamare `/api/admin/crm/contacts`
 * direttamente e ottenere i contatti.
 *
 * COME SI LEGGE
 * `API_AREA_MAP` associa un PREFISSO di percorso alla chiave di area. Il match
 * e' sul prefisso piu' lungo (piu' specifico vince), cosi' una sottorotta puo'
 * sovrascrivere il gruppo che la contiene.
 *
 * LE ROTTE PUBBLICHE NON VANNO PRESIDIATE
 * `PUBLIC_API_PREFIXES` elenca cio' che gira legittimamente SENZA sessione:
 * widget sui siti dei clienti, webhook di Google/Meta/Stripe, cron, callback
 * OAuth, API a token per i sistemi esterni. Applicare un controllo di area qui
 * romperebbe integrazioni funzionanti: sono state misurate una per una
 * dall'esterno (vedi PR #204) prima di finire in questo elenco.
 *
 * COSA NON COPRE
 * Questa mappa decide "quale sezione", non "quale tenant". L'isolamento fra
 * clienti diversi resta affidato allo scoping per `property_id` nelle query.
 */

/**
 * Rotte che girano senza sessione utente. Non ricevono MAI un controllo di
 * area: hanno (o devono avere) una propria forma di autorizzazione — firma del
 * webhook, token di servizio, identificativo opaco.
 */
export const PUBLIC_API_PREFIXES: string[] = [
  // Widget e script serviti sui siti dei clienti (visitatori anonimi).
  "/api/chat/widget",
  // Widget chat multipli: l'autorizzazione e' la chiave pubblica nell'URL, non
  // una sessione. Il `property_id` si ricava dalla chiave e non viene mai letto
  // dal corpo della richiesta.
  "/api/public/chat-widget",
  "/api/messages/impression",
  "/api/messages/rules",
  "/api/public/embed",
  "/api/track",
  "/api/identify",
  // Webhook di terze parti: autenticati dalla firma, non da una sessione.
  "/api/channels/email/webhook",
  "/api/channels/whatsapp/webhook",
  "/api/stripe/webhook",
  "/api/meta/data-deletion",
  // Callback e refresh OAuth: nessuna sessione al momento della chiamata.
  "/api/channels/email/oauth/callback",
  "/api/channels/email/oauth/refresh",
  // Lavori pianificati: girano senza cookie.
  "/api/cron",
  // API a token per i sistemi esterni (Manubot e affini).
  "/api/external",
  // Lettura pagina pubblicata per slug: serve la resa del sito pubblico.
  "/api/cms/pages/by-slug",
  // Le rotte che il centralino 3CX chiama DA FUORI (ricerca del contatto,
  // registrazione a fine chiamata e strumento dell'assistente vocale): si autenticano
  // col segreto della struttura, non con un cookie, e nessuna persona le apre.
  // Chiedere loro un'area di membro le romperebbe con un 401 a ogni squillo.
  "/api/telephony/3cx/lookup",
  "/api/telephony/3cx/journal",
  "/api/telephony/3cx/voice",
]

/**
 * Rotte riservate ai super admin di piattaforma. Il controllo di area non si
 * applica: un super admin ha per definizione ogni area, e un membro di tenant
 * non deve arrivarci comunque.
 */
export const SUPER_ADMIN_API_PREFIXES: string[] = ["/api/super-admin"]

/**
 * Prefisso rotta -> chiave area (da `lib/platform/areas.ts`).
 *
 * Le aree di base (dashboard, inbox, profile, settings) sono sempre concesse a
 * ogni membro autenticato: mapparle qui e' comunque utile, perche' rende
 * esplicito che la rotta e' stata classificata invece di essere stata
 * dimenticata.
 */
export const API_AREA_MAP: Record<string, string> = {
  // --- Aree concedibili: qui il controllo cambia davvero qualcosa ---
  "/api/admin/crm": "crm",
  // Le rotte del CRM non stanno tutte sotto /api/admin: la sincronizzazione col
  // PMS e la sua configurazione vivono sotto /api/crm, che era NON CLASSIFICATO
  // (misurato: `check:area-guard` le elencava entrambe). Con la modalita' attuale
  // "enforce" quella mancanza non era teorica: un membro senza l'area CRM poteva
  // chiamare a mano la sincronizzazione, che scrive nella rubrica.
  "/api/crm": "crm",
  "/api/admin/todos": "todos",

  "/api/admin/photos": "photos",
  "/api/admin/upload-photos": "photos",
  "/api/admin/update-photo": "photos",
  "/api/admin/delete-photo": "photos",
  "/api/admin/migrate-photos": "photos",
  "/api/admin/cleanup-photos": "photos",

  "/api/admin/assign-categories": "categories",

  "/api/admin/message-rules": "message-rules",
  "/api/admin/marketing": "marketing",
  "/api/admin/embed-scripts": "embed-scripts",
  "/api/admin/tracking": "tracking",
  "/api/tracking/demand": "tracking",
  "/api/admin/monitoring": "monitoring",

  "/api/cms": "cms",
  "/api/admin/site-legal": "cms",

  // --- Aree solo-admin: gia' presidiate da requireTenantAdmin dove presente,
  //     mappate qui per completezza e per il controllo di copertura ---
  "/api/admin/users": "users",
  "/api/admin/groups": "users",
  "/api/admin/modules": "modules",
  "/api/admin/manubot": "modules",
  "/api/platform/modules": "modules",
  "/api/admin/billing": "billing",
  "/api/admin/quotas": "billing",
  "/api/stripe/checkout": "billing",
  // Il portale Stripe gestisce l'abbonamento come il checkout: stessa area.
  "/api/stripe/portal": "billing",

  // Telefonia: `/api/telephony/calls` chiamava GIA' `requireAreaApi("calls")`
  // al suo interno, quindi qui non si aggiunge un'intenzione nuova, si rende
  // valida per tutte le rotte sorelle (interni, click-to-call, centralino 3CX)
  // che erano rimaste fuori. Misurato l'effetto sull'unico membro non
  // amministratore presente: ha crm, marketing, message-rules, monitoring,
  // todos e NON ha "calls" ⇒ senza l'area Telefonate non usa il telefono,
  // che e' esattamente cio' che l'area dovrebbe significare.
  "/api/telephony": "calls",

  // --- Aree di base: sempre concesse, mappate per non lasciarle "non
  //     classificate" nel controllo di copertura ---
  "/api/inbox": "inbox",
  "/api/gmail": "inbox",
  "/api/messages": "inbox",
  "/api/intelligence": "inbox",
  "/api/kpi": "inbox",
  "/api/admin/revenue": "dashboard",
  "/api/channels": "settings",
  // Token di accesso API della struttura: vive sotto Impostazioni. Il presidio
  // effettivo e' `requireTenantAdmin` DENTRO la rotta, perche' "settings" e'
  // un'area baseline (concessa a tutti) e da sola non proteggerebbe nulla.
  "/api/admin/api-access": "settings",
  "/api/admin/domains": "settings",
  "/api/admin/setup": "settings",
  "/api/admin/cleanup": "settings",
  "/api/platform/me": "profile",
  "/api/platform/switch-tenant": "profile",

  // Presenza dell'operatore: il segnalatore e' reso da `app/admin/layout.tsx`,
  // quindi parte su OGNI pagina per OGNI membro. Mapparla su un'area
  // concedibile la farebbe negare a chi non l'ha, cioe' un errore a ogni
  // caricamento; ed e' informazione sul proprio stato, quindi "profile".
  "/api/admin/presence": "profile",

  // Base di conoscenza e impostazioni del bot: NON esiste un'area dedicata
  // (le chiavi vere sono 19 e nessuna e' "ai" o "knowledge"), e inventarla qui
  // significherebbe negare l'accesso in nome di un'area che nessuno puo'
  // concedere, perche' non compare nell'elenco dei permessi. Resta quindi
  // "settings", che e' anche il posto dove si configura il bot.
  "/api/admin/ai": "settings",

  // Widget di chat: si governano da `app/admin/channels/chat`, e `/api/channels`
  // e' gia' mappato su "settings": stessa pagina, stessa area.
  "/api/admin/chat-widgets": "settings",
}

/** True se il percorso e' una rotta pubblica (nessun controllo di area). */
export function isPublicApiPath(pathname: string): boolean {
  return PUBLIC_API_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

/** True se il percorso e' riservato ai super admin. */
export function isSuperAdminApiPath(pathname: string): boolean {
  return SUPER_ADMIN_API_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

/**
 * Risolve l'area di una rotta API.
 *
 * Restituisce `null` quando la rotta e' pubblica, riservata ai super admin, o
 * non classificata. `null` NON significa "vietato": significa "questa mappa non
 * esprime un parere". Chi chiama decide cosa farne — il controllo di copertura
 * usa proprio questo per elencare le rotte ancora da classificare.
 */
export function resolveApiArea(pathname: string): string | null {
  if (isPublicApiPath(pathname) || isSuperAdminApiPath(pathname)) return null

  let migliorPrefisso = ""
  let area: string | null = null

  for (const [prefisso, chiaveArea] of Object.entries(API_AREA_MAP)) {
    const combacia = pathname === prefisso || pathname.startsWith(`${prefisso}/`)
    if (combacia && prefisso.length > migliorPrefisso.length) {
      migliorPrefisso = prefisso
      area = chiaveArea
    }
  }

  return area
}
