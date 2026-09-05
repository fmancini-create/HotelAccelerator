import "server-only"
import { isIP } from "node:net"

function isBlockedIpv4(host: string): boolean {
  const parts = host.split(".").map(Number)
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false
  const [a, b] = parts
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  )
}

function isBlockedIpv6(host: string): boolean {
  const normalized = host.replace(/^\[|\]$/g, "").toLowerCase()
  return normalized === "::" || normalized === "::1" || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe8") || normalized.startsWith("fe9") || normalized.startsWith("fea") || normalized.startsWith("feb")
}

/**
 * Le URL dei PBX sono input amministrativo ma vengono poi chiamate dal backend:
 * senza questo controllo diventerebbero un vettore SSRF verso localhost,
 * metadata endpoint o reti private della piattaforma.
 *
 * Un PBX on-prem deve quindi essere pubblicato tramite un FQDN HTTPS protetto
 * (reverse proxy/VPN gateway con allowlist), non tramite un 192.168.x.x.
 */
export function validateTelephonyBaseUrl(raw: string): { ok: true; url: string } | { ok: false; error: string } {
  const input = String(raw || "").trim()
  if (!input) return { ok: false, error: "Indirizzo del centralino mancante." }

  let parsed: URL
  try {
    parsed = new URL(input)
  } catch {
    return { ok: false, error: "Indirizzo del centralino non valido." }
  }

  if (parsed.protocol !== "https:") {
    return { ok: false, error: "Per sicurezza il centralino deve essere raggiungibile tramite HTTPS." }
  }
  if (parsed.username || parsed.password) {
    return { ok: false, error: "Non inserire credenziali dentro l'URL del centralino." }
  }

  const host = parsed.hostname.toLowerCase()
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    return { ok: false, error: "Usa un FQDN HTTPS pubblico/protetto, non un indirizzo locale." }
  }

  const ipVersion = isIP(host.replace(/^\[|\]$/g, ""))
  if ((ipVersion === 4 && isBlockedIpv4(host)) || (ipVersion === 6 && isBlockedIpv6(host))) {
    return { ok: false, error: "Gli indirizzi IP privati/locali non sono raggiungibili in sicurezza da HotelAccelerator." }
  }

  parsed.hash = ""
  parsed.search = ""
  return { ok: true, url: parsed.toString().replace(/\/+$/, "") }
}
