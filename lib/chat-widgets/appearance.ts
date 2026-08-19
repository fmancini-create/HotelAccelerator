/**
 * Aspetto di un widget chat: fonte unica.
 *
 * Questo file NON importa nulla dal server: lo usano il pannello di
 * amministrazione, l'anteprima dal vivo e il widget servito al sito pubblico.
 * Se i valori predefiniti vivessero in tre punti diversi, l'anteprima
 * mostrerebbe un widget che il visitatore non vede — il difetto peggiore,
 * perche' chi configura crede di aver controllato.
 */

export type WidgetPosition = "bottom-right" | "bottom-left"
export type WidgetShape = "rounded" | "square" | "pill"
export type WidgetIcon = "chat" | "message" | "help" | "sparkles" | "phone"

export interface WidgetAppearance {
  /** Colore della testata e del pulsante. */
  primaryColor: string
  /** Colore del testo SOPRA il colore principale. */
  textColor: string
  /** Logo mostrato nella testata (URL su Blob). */
  logoUrl: string | null
  position: WidgetPosition
  /** Distanza dai bordi, in pixel: serve quando il widget copre altri elementi del sito. */
  offsetX: number
  offsetY: number
  shape: WidgetShape
  /** Lato del pulsante, in pixel. */
  buttonSize: number
  /** Dimensioni della finestra aperta, in pixel. */
  windowWidth: number
  windowHeight: number
  icon: WidgetIcon
  /** Testi: ogni widget parla con la sua voce. */
  title: string
  subtitle: string
  welcomeMessage: string
  placeholder: string
  /** Mostrato quando il widget e' spento. */
  offlineMessage: string
}

export const DEFAULT_APPEARANCE: WidgetAppearance = {
  primaryColor: "#1f2937",
  textColor: "#ffffff",
  logoUrl: null,
  position: "bottom-right",
  offsetX: 24,
  offsetY: 24,
  shape: "rounded",
  buttonSize: 56,
  windowWidth: 380,
  windowHeight: 560,
  icon: "chat",
  title: "Come possiamo aiutarti?",
  subtitle: "Rispondiamo subito",
  welcomeMessage: "Buongiorno! Come possiamo aiutarla?",
  placeholder: "Scrivi un messaggio…",
  offlineMessage: "In questo momento non siamo disponibili. Lascia un messaggio e ti risponderemo.",
}

const POSITIONS: WidgetPosition[] = ["bottom-right", "bottom-left"]
const SHAPES: WidgetShape[] = ["rounded", "square", "pill"]
const ICONS: WidgetIcon[] = ["chat", "message", "help", "sparkles", "phone"]

/** Limiti: un pulsante da 4px non si clicca, uno da 400px copre il sito. */
const LIMITI = {
  offsetX: [0, 200],
  offsetY: [0, 200],
  buttonSize: [40, 96],
  windowWidth: [280, 560],
  windowHeight: [320, 800],
} as const

function numeroEntro(valore: unknown, [min, max]: readonly [number, number], predefinito: number): number {
  const n = typeof valore === "number" ? valore : Number.parseInt(String(valore ?? ""), 10)
  if (!Number.isFinite(n)) return predefinito
  return Math.min(max, Math.max(min, Math.round(n)))
}

/** Un colore esadecimale valido, altrimenti il predefinito. */
export function normalizzaColore(valore: unknown, predefinito: string): string {
  const s = String(valore ?? "").trim()
  if (/^#[0-9a-f]{6}$/i.test(s)) return s.toLowerCase()
  // Forma abbreviata #abc -> #aabbcc
  if (/^#[0-9a-f]{3}$/i.test(s)) {
    const [, a, b, c] = s.match(/^#(.)(.)(.)$/i) as RegExpMatchArray
    return `#${a}${a}${b}${b}${c}${c}`.toLowerCase()
  }
  return predefinito
}

function testoEntro(valore: unknown, predefinito: string, max: number): string {
  const s = String(valore ?? "").trim()
  if (!s) return predefinito
  return s.slice(0, max)
}

/**
 * Costruisce un aspetto valido da dati arbitrari.
 *
 * Vale sia per cio' che arriva dal pannello sia per cio' che e' salvato nel
 * database: una configurazione salvata mesi fa puo' non avere i campi aggiunti
 * dopo, e un campo mancante non deve produrre un widget rotto.
 */
export function normalizzaAspetto(raw: unknown): WidgetAppearance {
  const d = (raw ?? {}) as Record<string, unknown>
  const logo = typeof d.logoUrl === "string" && d.logoUrl.trim() ? d.logoUrl.trim() : null
  return {
    primaryColor: normalizzaColore(d.primaryColor, DEFAULT_APPEARANCE.primaryColor),
    textColor: normalizzaColore(d.textColor, DEFAULT_APPEARANCE.textColor),
    // Si accettano solo URL http(s): un "javascript:" finirebbe in un attributo
    // src su un sito di terzi.
    logoUrl: logo && /^https?:\/\//i.test(logo) ? logo : null,
    position: POSITIONS.includes(d.position as WidgetPosition)
      ? (d.position as WidgetPosition)
      : DEFAULT_APPEARANCE.position,
    offsetX: numeroEntro(d.offsetX, LIMITI.offsetX, DEFAULT_APPEARANCE.offsetX),
    offsetY: numeroEntro(d.offsetY, LIMITI.offsetY, DEFAULT_APPEARANCE.offsetY),
    shape: SHAPES.includes(d.shape as WidgetShape) ? (d.shape as WidgetShape) : DEFAULT_APPEARANCE.shape,
    buttonSize: numeroEntro(d.buttonSize, LIMITI.buttonSize, DEFAULT_APPEARANCE.buttonSize),
    windowWidth: numeroEntro(d.windowWidth, LIMITI.windowWidth, DEFAULT_APPEARANCE.windowWidth),
    windowHeight: numeroEntro(d.windowHeight, LIMITI.windowHeight, DEFAULT_APPEARANCE.windowHeight),
    icon: ICONS.includes(d.icon as WidgetIcon) ? (d.icon as WidgetIcon) : DEFAULT_APPEARANCE.icon,
    title: testoEntro(d.title, DEFAULT_APPEARANCE.title, 60),
    subtitle: testoEntro(d.subtitle, DEFAULT_APPEARANCE.subtitle, 80),
    welcomeMessage: testoEntro(d.welcomeMessage, DEFAULT_APPEARANCE.welcomeMessage, 300),
    placeholder: testoEntro(d.placeholder, DEFAULT_APPEARANCE.placeholder, 60),
    offlineMessage: testoEntro(d.offlineMessage, DEFAULT_APPEARANCE.offlineMessage, 300),
  }
}

/** Raggio degli angoli, in pixel, per la forma scelta. */
export function raggioPerForma(shape: WidgetShape, buttonSize: number): { pulsante: number; finestra: number } {
  switch (shape) {
    case "square":
      return { pulsante: 4, finestra: 4 }
    case "pill":
      return { pulsante: Math.round(buttonSize / 2), finestra: 24 }
    default:
      return { pulsante: 16, finestra: 16 }
  }
}

// ---------------------------------------------------------------------------
// Contrasto
// ---------------------------------------------------------------------------

function canaleLineare(c: number): number {
  const s = c / 255
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}

/** Luminanza relativa secondo WCAG. */
function luminanza(hex: string): number {
  const m = hex.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i)
  if (!m) return 0
  const [r, g, b] = [m[1], m[2], m[3]].map((h) => Number.parseInt(h, 16))
  return 0.2126 * canaleLineare(r) + 0.7152 * canaleLineare(g) + 0.0722 * canaleLineare(b)
}

/**
 * Rapporto di contrasto fra due colori (1 = identici, 21 = massimo).
 *
 * Serve perche' chi configura guarda il pannello, non il sito: un colore
 * principale chiaro con testo bianco produce una testata illeggibile che l'admin
 * non vede mai. La soglia 4.5 e' quella WCAG AA per il testo normale.
 */
export function rapportoContrasto(coloreA: string, coloreB: string): number {
  const a = luminanza(normalizzaColore(coloreA, "#000000"))
  const b = luminanza(normalizzaColore(coloreB, "#ffffff"))
  const chiaro = Math.max(a, b)
  const scuro = Math.min(a, b)
  return (chiaro + 0.05) / (scuro + 0.05)
}

export const SOGLIA_CONTRASTO_AA = 4.5

export interface EsitoContrasto {
  rapporto: number
  leggibile: boolean
  /** Colore di testo consigliato quando la coppia scelta non e' leggibile. */
  consigliato: "#ffffff" | "#000000"
}

export function valutaContrasto(primaryColor: string, textColor: string): EsitoContrasto {
  const rapporto = rapportoContrasto(primaryColor, textColor)
  const conBianco = rapportoContrasto(primaryColor, "#ffffff")
  const conNero = rapportoContrasto(primaryColor, "#000000")
  return {
    rapporto: Math.round(rapporto * 100) / 100,
    leggibile: rapporto >= SOGLIA_CONTRASTO_AA,
    consigliato: conBianco >= conNero ? "#ffffff" : "#000000",
  }
}
