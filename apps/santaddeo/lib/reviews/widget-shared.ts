/**
 * Tipi e costanti del Widget Recensioni — CLIENT-SAFE (no server-only).
 * Usato sia dal customizer UI sia dalle route server (via widget.ts).
 */

import {
  type EmbedPlacement,
  type EmbedCorner,
  type EmbedShadow,
  EMBED_CORNERS,
  EMBED_SHADOWS,
} from "@/lib/embed/widgets-shared"

export type WidgetTheme = "light" | "dark" | "auto"
export type WidgetLayout = "badge" | "bar" | "grid"

export interface WidgetConfig {
  theme: WidgetTheme
  layout: WidgetLayout
  /** Colore accento (hex) usato per stelle/evidenze. */
  accentColor: string
  /** Bordi arrotondati in px. */
  radius: number
  /** Mostra il punteggio complessivo in evidenza. */
  showOverall: boolean
  /** Mostra il numero di recensioni per canale. */
  showCount: boolean
  /** Canali da mostrare; vuoto = tutti quelli disponibili. */
  platforms: string[]
  /** Testo opzionale sopra il widget (es. nome struttura). */
  title: string
  /** inline = dove e' incollato il tag; floating = fisso al viewport. */
  placement: EmbedPlacement
  /** Angolo/posizione quando placement = floating. */
  corner: EmbedCorner
  /** Larghezza massima in px. */
  maxWidth: number
  /** Intensita' ombra. */
  shadow: EmbedShadow
}

export const DEFAULT_WIDGET_CONFIG: WidgetConfig = {
  theme: "light",
  layout: "bar",
  accentColor: "#0d9488", // teal-600, brand Santaddeo
  radius: 12,
  showOverall: true,
  showCount: true,
  platforms: [],
  title: "",
  // inline di default: preserva il comportamento dei siti gia' integrati
  // (es. Villa I Barronci avvolge il widget in un proprio pannello flottante).
  placement: "inline",
  corner: "bottom-left",
  maxWidth: 520,
  shadow: "none",
}

/** Etichette leggibili per canale. */
export const PLATFORM_LABELS: Record<string, string> = {
  booking: "Booking.com",
  google: "Google",
  tripadvisor: "TripAdvisor",
  expedia: "Expedia",
  airbnb: "Airbnb",
  vrbo: "Vrbo",
}

/** Colori brand per canale (usati come fallback decorativo nello script). */
export const PLATFORM_COLORS: Record<string, string> = {
  booking: "#003580",
  google: "#4285F4",
  tripadvisor: "#00AA6C",
  expedia: "#FFC72C",
  airbnb: "#FF5A5F",
  vrbo: "#1668E3",
}

export function platformLabel(platform: string): string {
  return PLATFORM_LABELS[platform.toLowerCase()] || platform
}

/** Normalizza/valida una config arbitraria mantenendo i default. */
export function sanitizeConfig(input: unknown): WidgetConfig {
  const c = (input && typeof input === "object" ? input : {}) as Record<string, unknown>
  const theme = (["light", "dark", "auto"] as const).includes(c.theme as WidgetTheme)
    ? (c.theme as WidgetTheme)
    : DEFAULT_WIDGET_CONFIG.theme
  const layout = (["badge", "bar", "grid"] as const).includes(c.layout as WidgetLayout)
    ? (c.layout as WidgetLayout)
    : DEFAULT_WIDGET_CONFIG.layout
  const accentColor =
    typeof c.accentColor === "string" && /^#[0-9a-fA-F]{6}$/.test(c.accentColor)
      ? c.accentColor
      : DEFAULT_WIDGET_CONFIG.accentColor
  const radius =
    typeof c.radius === "number" && c.radius >= 0 && c.radius <= 32
      ? Math.round(c.radius)
      : DEFAULT_WIDGET_CONFIG.radius
  const platforms = Array.isArray(c.platforms)
    ? c.platforms.filter((p): p is string => typeof p === "string").slice(0, 10)
    : DEFAULT_WIDGET_CONFIG.platforms
  const title = typeof c.title === "string" ? c.title.slice(0, 80) : DEFAULT_WIDGET_CONFIG.title
  const placement: EmbedPlacement = c.placement === "floating" ? "floating" : "inline"
  const corner: EmbedCorner = EMBED_CORNERS.includes(c.corner as EmbedCorner)
    ? (c.corner as EmbedCorner)
    : DEFAULT_WIDGET_CONFIG.corner
  const shadow: EmbedShadow = EMBED_SHADOWS.includes(c.shadow as EmbedShadow)
    ? (c.shadow as EmbedShadow)
    : DEFAULT_WIDGET_CONFIG.shadow
  const maxWidth =
    typeof c.maxWidth === "number" && c.maxWidth >= 240 && c.maxWidth <= 900
      ? Math.round(c.maxWidth)
      : DEFAULT_WIDGET_CONFIG.maxWidth

  return {
    theme,
    layout,
    accentColor,
    radius,
    showOverall: c.showOverall !== false,
    showCount: c.showCount !== false,
    platforms,
    title,
    placement,
    corner,
    maxWidth,
    shadow,
  }
}
