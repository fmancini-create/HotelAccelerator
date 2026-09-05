import "server-only"
import { isIP } from "node:net"
import { lookup } from "node:dns/promises"

function isBlockedIpv4(host: string): boolean {
  const parts = host.split(".").map(Number)
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false
  const [a, b] = parts
  return (
    a === 0 || a === 10 || a === 127 ||
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

export function isBlockedTelephonyAddress(address: string): boolean {
  const version = isIP(address.replace(/^\[|\]$/g, ""))
  if (version === 4) return isBlockedIpv4(address)
  if (version === 6) return isBlockedIpv6(address)
  return true
}

/**
 * Le URL PBX sono input amministrativo ma vengono chiamate dal backend: senza
 * questi controlli diventerebbero un vettore SSRF verso localhost, metadata
 * endpoint o reti private della piattaforma.
 */
export function validateTelephonyBaseUrl(raw: string): { ok: true; url: string } | { ok: false; error: string } {
  const input = String(raw || "").trim()
  if (!input) return { ok: false, error: "Indirizzo del centralino mancante." }

  let parsed: URL
  try { parsed = new URL(input) } catch { return { ok: false, error: "Indirizzo del centralino non valido." } }

  if (parsed.protocol !== "https:") return { ok: false, error: "Per sicurezza il centralino deve essere raggiungibile tramite HTTPS." }
  if (parsed.username || parsed.password) return { ok: false, error: "Non inserire credenziali dentro l'URL del centralino." }

  const host = parsed.hostname.toLowerCase()
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    return { ok: false, error: "Usa un FQDN HTTPS pubblico/protetto, non un indirizzo locale." }
  }
  if (isIP(host.replace(/^\[|\]$/g, "")) && isBlockedTelephonyAddress(host)) {
    return { ok: false, error: "Gli indirizzi IP privati/locali non sono raggiungibili in sicurezza da HotelAccelerator." }
  }

  parsed.hash = ""
  parsed.search = ""
  return { ok: true, url: parsed.toString().replace(/\/+$/, "") }
}

/** Risolve anche il DNS prima di effettuare chiamate provider. */
export async function ensureTelephonyHostIsPublic(rawUrl: string): Promise<{ ok: true } | { ok: false; error: string }> {
  let parsed: URL
  try { parsed = new URL(rawUrl) } catch { return { ok: false, error: "Indirizzo del centralino non valido." } }
  const host = parsed.hostname.replace(/^\[|\]$/g, "")
  if (isIP(host)) return isBlockedTelephonyAddress(host) ? { ok: false, error: "Il centralino risolve verso una rete privata/non consentita." } : { ok: true }
  try {
    const addresses = await lookup(host, { all: true, verbatim: true })
    if (addresses.length === 0 || addresses.some((entry) => isBlockedTelephonyAddress(entry.address))) {
      return { ok: false, error: "Il dominio del centralino risolve verso una rete privata/non consentita." }
    }
    return { ok: true }
  } catch {
    return { ok: false, error: "Impossibile risolvere il dominio del centralino." }
  }
}
