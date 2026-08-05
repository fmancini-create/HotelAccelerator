export const PLATFORM_DOMAIN = "hotelaccelerator.com"

const SUBDOMAIN_RE = /^(?!-)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/
const DOMAIN_RE = /^(?=.{1,253}$)(?!-)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/

export const RESERVED_SUBDOMAINS = new Set([
  "admin",
  "api",
  "app",
  "assets",
  "auth",
  "billing",
  "blog",
  "cdn",
  "dashboard",
  "docs",
  "ftp",
  "help",
  "imap",
  "login",
  "mail",
  "ns1",
  "ns2",
  "pop",
  "smtp",
  "static",
  "status",
  "support",
  "www",
])

export function normalizeSubdomain(value: unknown): string | null {
  if (typeof value !== "string") return null
  const normalized = value.trim().toLowerCase()
  return normalized || null
}

export function normalizeCustomDomain(value: unknown): string | null {
  if (typeof value !== "string") return null
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/\.$/, "")
  return normalized || null
}

export function validateSubdomain(value: string | null): string | null {
  if (!value) return null
  if (!SUBDOMAIN_RE.test(value)) return "Usa da 1 a 63 caratteri: lettere, numeri e trattini, senza trattino iniziale o finale"
  if (RESERVED_SUBDOMAINS.has(value)) return "Questo nome è riservato alla piattaforma"
  return null
}

export function validateCustomDomain(value: string | null): string | null {
  if (!value) return null
  if (!DOMAIN_RE.test(value)) return "Inserisci un dominio valido, senza protocollo o percorso"
  if (value === PLATFORM_DOMAIN || value.endsWith(`.${PLATFORM_DOMAIN}`)) {
    return `I sottodomini ${PLATFORM_DOMAIN} vanno configurati nel campo dedicato`
  }
  return null
}

export function tenantSubdomainHost(subdomain: string): string {
  return `${subdomain}.${PLATFORM_DOMAIN}`
}
