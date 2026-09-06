export type TimeClockRequirementInput = {
  moduleStatus: string | null | undefined
  moduleExpiresAt: string | null | undefined
  employmentStatus: string | null | undefined
  requiresTimeClock: boolean | null | undefined
}

export type MobileTimeClockGateInput = TimeClockRequirementInput & {
  mobile: boolean
  hasOpenTimeEntry: boolean | null | undefined
}

export type DesktopTimeClockPromptInput = TimeClockRequirementInput & {
  mobile: boolean
  hasOpenTimeEntry: boolean | null | undefined
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
 * Regola comune: l'obbligo e' applicabile soltanto con HR attivo/trial non
 * scaduto, dipendente attivo e flag individuale esplicito. Dati mancanti fanno
 * fallire aperto il login normale invece di trasformare HR in un blocco accessi.
 */
export function hasActiveTimeClockRequirement(
  input: TimeClockRequirementInput,
  nowMs = Date.now(),
): boolean {
  if (input.requiresTimeClock !== true || input.employmentStatus !== "active") return false
  if (input.moduleStatus !== "active" && input.moduleStatus !== "trial") return false

  if (input.moduleExpiresAt) {
    const expiresAt = Date.parse(input.moduleExpiresAt)
    if (!Number.isFinite(expiresAt) || expiresAt < nowMs) return false
  }

  return true
}

/**
 * Su smartphone il gate serve a registrare l'INGRESSO mancante, non a forzare
 * una nuova azione ad ogni riapertura dell'app. Se esiste gia' una presenza
 * aperta il dipendente entra normalmente in dashboard e registrera' l'uscita
 * quando termina davvero il turno. `hasOpenTimeEntry` deve essere esplicitamente
 * false: in caso di lookup incerto il login resta fail-open.
 */
export function shouldRouteToMobileTimeClock(
  input: MobileTimeClockGateInput,
  nowMs = Date.now(),
): boolean {
  if (!input.mobile || input.hasOpenTimeEntry !== false) return false
  return hasActiveTimeClockRequirement(input, nowMs)
}

/**
 * Sul desktop non imponiamo il gate. Se l'obbligo e' attivo e NON esiste una
 * presenza aperta, mostriamo un promemoria nella dashboard. `hasOpenTimeEntry`
 * deve essere esplicitamente false: lookup mancanti/errori restano fail-open.
 */
export function shouldPromptDesktopTimeClock(
  input: DesktopTimeClockPromptInput,
  nowMs = Date.now(),
): boolean {
  if (input.mobile || input.hasOpenTimeEntry !== false) return false
  return hasActiveTimeClockRequirement(input, nowMs)
}
