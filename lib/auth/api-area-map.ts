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
 */

export const PUBLIC_API_PREFIXES: string[] = [
  "/api/chat/widget",
  "/api/public/chat-widget",
  "/api/messages/impression",
  "/api/messages/rules",
  "/api/public/embed",
  "/api/track",
  "/api/identify",
  "/api/channels/email/webhook",
  "/api/channels/whatsapp/webhook",
  "/api/stripe/webhook",
  "/api/meta/data-deletion",
  "/api/channels/email/oauth/callback",
  "/api/channels/email/oauth/refresh",
  "/api/cron",
  "/api/external",
  "/api/cms/pages/by-slug",
  "/api/telephony/3cx/lookup",
  "/api/telephony/3cx/journal",
  "/api/telephony/3cx/voice",
]

export const SUPER_ADMIN_API_PREFIXES: string[] = ["/api/super-admin"]

export const API_AREA_MAP: Record<string, string> = {
  "/api/admin/crm": "crm",
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

  "/api/admin/users": "users",
  "/api/admin/groups": "users",
  "/api/admin/modules": "modules",
  // Il bridge task ManuBot e' una funzione dell'area Attivita', non una pagina
  // amministrativa dei moduli. I prefissi piu' specifici vincono sul generico
  // /api/admin/manubot, cosi' un operatore con Todos puo' creare l'intervento
  // senza ottenere permessi di configurazione ManuBot.
  "/api/admin/manubot/task-data": "todos",
  "/api/admin/manubot/task-photos": "todos",
  "/api/admin/manubot": "modules",
  "/api/platform/modules": "modules",
  "/api/admin/billing": "billing",
  "/api/admin/quotas": "billing",
  "/api/stripe/checkout": "billing",
  "/api/stripe/portal": "billing",

  "/api/telephony": "calls",

  "/api/inbox": "inbox",
  "/api/gmail": "inbox",
  "/api/messages": "inbox",
  "/api/intelligence": "inbox",
  "/api/kpi": "inbox",
  "/api/admin/revenue": "dashboard",
  "/api/channels": "settings",
  "/api/admin/api-access": "settings",
  "/api/admin/domains": "settings",
  "/api/admin/setup": "settings",
  "/api/admin/cleanup": "settings",
  "/api/platform/me": "profile",
  "/api/platform/switch-tenant": "profile",
  "/api/admin/presence": "profile",
  "/api/me/auto-logout": "profile",
  "/api/admin/ai": "settings",
  "/api/admin/chat-widgets": "settings",
}

export function isPublicApiPath(pathname: string): boolean {
  return PUBLIC_API_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

export function isSuperAdminApiPath(pathname: string): boolean {
  return SUPER_ADMIN_API_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

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
