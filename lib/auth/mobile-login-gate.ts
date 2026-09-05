export type MobileTimeClockGateInput = {
  mobile: boolean
  moduleStatus: string | null | undefined
  moduleExpiresAt: string | null | undefined
  employmentStatus: string | null | undefined
  requiresTimeClock: boolean | null | undefined
}

/**
 * Riconosce i principali browser mobile dal relativo User-Agent.
 * Il controllo viewport resta separato e viene usato nel browser: questo helper
 * serve anche al callback OAuth, che gira sul server e quindi non ha matchMedia.
 */
export function isMobileUserAgent(userAgent: string | null | undefined): boolean {
  return /android|iphone|ipad|ipod|iemobile|opera mini|mobile/i.test(userAgent ?? "")
}

/**
 * Browser-side mobile detection. La media query copre anche tablet/browser che
 * espongono un User-Agent desktop, mentre il controllo UA copre i browser mobile
 * con viewport ampia o zoom particolare.
 */
export function isMobileBrowser(): boolean {
  if (typeof window === "undefined") return false
  return window.matchMedia("(max-width: 767px)").matches || isMobileUserAgent(window.navigator.userAgent)
}

/**
 * Regola pura del gate post-login. Il redirect alla timbratura scatta soltanto
 * se tutte le condizioni sono vere; qualunque dato mancante lascia l'accesso
 * normale alla dashboard, evitando di bloccare il login per un guasto HR.
 */
export function shouldRouteToMobileTimeClock(
  input: MobileTimeClockGateInput,
  nowMs = Date.now(),
): boolean {
  if (!input.mobile || input.requiresTimeClock !== true || input.employmentStatus !== "active") return false
  if (input.moduleStatus !== "active" && input.moduleStatus !== "trial") return false

  if (input.moduleExpiresAt) {
    const expiresAt = Date.parse(input.moduleExpiresAt)
    if (!Number.isFinite(expiresAt) || expiresAt < nowMs) return false
  }

  return true
}
