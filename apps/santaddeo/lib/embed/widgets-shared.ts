/**
 * Tipi e default CLIENT-SAFE per il canale embeddabile multi-widget.
 *
 * Questo file NON importa nulla di server: e' condiviso tra il customizer
 * (componente client), l'API widget-config e l'endpoint pubblico. La config
 * dei widget aggiuntivi vive nel JSONB `review_widget_configs.config.widgets.*`
 * (la config recensioni resta al top-level per retrocompatibilita').
 */

/** Modalita' di posizionamento: nel flusso del contenuto o fisso al viewport. */
export type EmbedPlacement = "inline" | "floating"
/** Retrocompat: vecchio nome usato quando placement era chiamato "position". */
export type EmbedPosition = EmbedPlacement
export type EmbedTheme = "light" | "dark"

/** Le 6 posizioni disponibili quando il widget e' flottante. */
export type EmbedCorner =
  | "bottom-left"
  | "bottom-right"
  | "top-left"
  | "top-right"
  | "top-center"
  | "bottom-center"

/** Intensita' dell'ombra del widget. */
export type EmbedShadow = "none" | "sm" | "md" | "lg"

export const EMBED_CORNERS: EmbedCorner[] = [
  "bottom-left",
  "bottom-right",
  "top-left",
  "top-right",
  "top-center",
  "bottom-center",
]

export const EMBED_CORNER_LABELS: Record<EmbedCorner, string> = {
  "bottom-left": "Basso sx",
  "bottom-right": "Basso dx",
  "top-left": "Alto sx",
  "top-right": "Alto dx",
  "top-center": "Alto centro",
  "bottom-center": "Basso centro",
}

export const EMBED_SHADOWS: EmbedShadow[] = ["none", "sm", "md", "lg"]

export const EMBED_SHADOW_LABELS: Record<EmbedShadow, string> = {
  none: "Nessuna",
  sm: "Leggera",
  md: "Media",
  lg: "Forte",
}

/** CSS box-shadow per ogni livello (usato anche, replicato, dentro gli script). */
export const EMBED_SHADOW_CSS: Record<EmbedShadow, string> = {
  none: "none",
  sm: "0 2px 8px rgba(0,0,0,.10)",
  md: "0 8px 30px rgba(0,0,0,.18)",
  lg: "0 12px 48px rgba(0,0,0,.28)",
}

/** Cosa mostrare nel banner Last Minute (oltre al messaggio). */
export interface LastMinuteShow {
  discount: boolean
  dates: boolean
  roomsLeft: boolean
  cta: boolean
}

/** Configurazione del widget banner Last Minute, gestita dal tenant. */
export interface LastMinuteWidgetConfig {
  enabled: boolean
  /** Messaggio con segnaposto {dates} {discount} {rooms}. */
  messageTemplate: string
  show: LastMinuteShow
  /**
   * Mostra il numero di "camere rimaste" SOLO se <= a questa soglia.
   * 0 = nessun limite (mostra sempre, se show.roomsLeft e' attivo).
   * Serve per l'effetto scarsita': non vogliamo dire "ultime 18 camere".
   */
  roomsLeftMaxThreshold: number
  ctaLabel: string
  ctaUrl: string
  /** inline = dove e' incollato il tag; floating = fisso al viewport. */
  placement: EmbedPlacement
  /** Angolo/posizione quando placement = floating. */
  corner: EmbedCorner
  /** Larghezza massima in px. */
  maxWidth: number
  /** Intensita' ombra. */
  shadow: EmbedShadow
  theme: EmbedTheme
  accentColor: string
  radius: number
}

export const DEFAULT_LAST_MINUTE_CONFIG: LastMinuteWidgetConfig = {
  enabled: false,
  messageTemplate: "Offerta last minute {dates}",
  show: { discount: true, dates: true, roomsLeft: true, cta: true },
  roomsLeftMaxThreshold: 0,
  ctaLabel: "Prenota ora",
  ctaUrl: "",
  placement: "inline",
  corner: "bottom-right",
  maxWidth: 520,
  shadow: "md",
  theme: "light",
  accentColor: "#e11d48",
  radius: 12,
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/

function clampNum(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === "number" ? v : Number(v)
  if (!Number.isFinite(n)) return fallback
  return Math.max(min, Math.min(max, Math.round(n)))
}

function str(v: unknown, fallback: string, maxLen: number): string {
  if (typeof v !== "string") return fallback
  return v.slice(0, maxLen)
}

function bool(v: unknown, fallback: boolean): boolean {
  return typeof v === "boolean" ? v : fallback
}

/**
 * Normalizza una config Last Minute potenzialmente incompleta/sporca verso
 * una forma valida e completa. Usata sia in lettura che in scrittura.
 */
export function sanitizeLastMinuteConfig(input: unknown): LastMinuteWidgetConfig {
  const c = (input && typeof input === "object" ? input : {}) as Record<string, unknown>
  const d = DEFAULT_LAST_MINUTE_CONFIG
  const show = (c.show && typeof c.show === "object" ? c.show : {}) as Record<string, unknown>

  // Migrazione: il campo si chiamava "position" (inline|floating).
  const placementRaw = c.placement ?? c.position
  const placement: EmbedPlacement = placementRaw === "floating" ? "floating" : "inline"
  const corner: EmbedCorner = EMBED_CORNERS.includes(c.corner as EmbedCorner)
    ? (c.corner as EmbedCorner)
    : d.corner
  const shadow: EmbedShadow = EMBED_SHADOWS.includes(c.shadow as EmbedShadow)
    ? (c.shadow as EmbedShadow)
    : d.shadow
  const theme: EmbedTheme = c.theme === "dark" ? "dark" : "light"
  const accent = typeof c.accentColor === "string" && HEX_RE.test(c.accentColor) ? c.accentColor : d.accentColor

  let ctaUrl = str(c.ctaUrl, d.ctaUrl, 500).trim()
  // Solo http(s) per sicurezza (no javascript:, data:, ecc.)
  if (ctaUrl && !/^https?:\/\//i.test(ctaUrl)) ctaUrl = ""

  return {
    enabled: bool(c.enabled, d.enabled),
    messageTemplate: str(c.messageTemplate, d.messageTemplate, 160) || d.messageTemplate,
    show: {
      discount: bool(show.discount, d.show.discount),
      dates: bool(show.dates, d.show.dates),
      roomsLeft: bool(show.roomsLeft, d.show.roomsLeft),
      cta: bool(show.cta, d.show.cta),
    },
    roomsLeftMaxThreshold: clampNum(c.roomsLeftMaxThreshold, 0, 999, d.roomsLeftMaxThreshold),
    ctaLabel: str(c.ctaLabel, d.ctaLabel, 40) || d.ctaLabel,
    ctaUrl,
    placement,
    corner,
    maxWidth: clampNum(c.maxWidth, 240, 900, d.maxWidth),
    shadow,
    theme,
    accentColor: accent,
    radius: clampNum(c.radius, 0, 24, d.radius),
  }
}

/**
 * CSS di posizionamento per un widget flottante: ritorna le proprieta'
 * top/bottom/left/right/transform per l'angolo scelto. `margin` in px.
 * Replicato (inline) anche dentro gli script serializzati.
 */
export function cornerCss(corner: EmbedCorner, margin = 16): string {
  const vert = corner.startsWith("top") ? `top:${margin}px;` : `bottom:${margin}px;`
  const horiz = corner.endsWith("center")
    ? "left:50%;transform:translateX(-50%);"
    : corner.endsWith("left")
      ? `left:${margin}px;`
      : `right:${margin}px;`
  return vert + horiz
}
