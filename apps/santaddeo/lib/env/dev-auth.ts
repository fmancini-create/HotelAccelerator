/**
 * DEV auth bypass — detects v0 sandbox or localhost.
 *
 * SECURITY RULES:
 * - vusercontent.net  -> DEV (v0 sandbox iframe proxy)
 * - *.vercel.run      -> DEV (v0 sandbox preview host)
 * - localhost         -> DEV (local development)
 * - *.vercel.app      -> PRODUCTION (v0-santaddeo-*.vercel.app)
 * - anything else     -> PRODUCTION
 *
 * The isProd check takes priority: if hostname contains "vercel.app",
 * the function returns false even if other conditions match.
 *
 * Note on logging: the previous implementation printed a console.warn
 * on every request that hit a protected route, which flooded the server
 * logs (and was reported by users as a visible "error"). We now log the
 * dev-bypass state exactly once per process, so the signal is preserved
 * for debugging without the noise.
 */

let warnedClient = false
let warnedServer = false

function isDevHost(host: string): boolean {
  if (host.includes("vercel.app")) return false // prod preview/prod
  return (
    host.includes("vusercontent.net") ||
    host.includes("vercel.run") ||
    host.includes("localhost") ||
    host.startsWith("127.") ||
    host === ""
  )
}

export function isDevAuth(): boolean {
  if (typeof window === "undefined") return false
  const hostname = window.location.hostname.toLowerCase()
  const isDev = isDevHost(hostname)
  if (isDev && !warnedClient) {
    warnedClient = true
    console.info("[dev-auth] client bypass active for", hostname)
  }
  return isDev
}

export async function isDevAuthAsync(): Promise<boolean> {
  try {
    const { headers } = await import("next/headers")
    const headersList = await headers()
    const host = (headersList.get("host") || "").toLowerCase()

    // NODE_ENV alone is NOT a trusted signal on Vercel sandboxes: the
    // v0 preview runs with NODE_ENV=development on *.vercel.run, so we
    // rely on the hostname match instead. `NODE_ENV==="development"`
    // still counts when we can't determine the host (e.g. local CLI).
    const isDev = isDevHost(host) || (!host && process.env.NODE_ENV === "development")

    if (isDev && !warnedServer) {
      warnedServer = true
      console.info("[dev-auth] server bypass active for host:", host || "(no host header)")
    }
    return isDev
  } catch {
    return false
  }
}
