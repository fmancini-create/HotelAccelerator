/**
 * Impostazioni per-hotel che personalizzano COME l'AI genera le risposte alle
 * recensioni (firma, tono, lunghezza, linee guida, lingua, emoji).
 *
 * Persistite in public.hotel_review_reply_settings (1 riga per hotel) e lette
 * sia dal customizer (route reply-settings) sia dal generatore di bozze
 * (route reply-draft) per costruire il frammento di prompt.
 */

export type LengthPref = "short" | "medium" | "long"
export type LanguageMode = "guest" | "fixed"

export interface ReviewReplySettings {
  signature: string
  toneInstructions: string
  lengthPref: LengthPref
  guidelines: string
  languageMode: LanguageMode
  fixedLanguage: string
  keepRatingTone: boolean
  allowEmoji: boolean
}

export const DEFAULT_REPLY_SETTINGS: ReviewReplySettings = {
  signature: "",
  toneInstructions: "",
  lengthPref: "medium",
  guidelines: "",
  languageMode: "guest",
  fixedLanguage: "it",
  keepRatingTone: true,
  allowEmoji: false,
}

const LENGTH_VALUES: LengthPref[] = ["short", "medium", "long"]
const LANGUAGE_MODES: LanguageMode[] = ["guest", "fixed"]

export const SUPPORTED_FIXED_LANGUAGES: { code: string; label: string }[] = [
  { code: "it", label: "Italiano" },
  { code: "en", label: "Inglese" },
  { code: "de", label: "Tedesco" },
  { code: "fr", label: "Francese" },
  { code: "es", label: "Spagnolo" },
]

function clampText(v: unknown, max: number): string {
  if (typeof v !== "string") return ""
  return v.trim().slice(0, max)
}

/** Normalizza un input arbitrario (DB o body) in impostazioni valide. */
export function sanitizeReplySettings(input: unknown): ReviewReplySettings {
  const o = (input && typeof input === "object" ? input : {}) as Record<string, unknown>
  const lengthPref = LENGTH_VALUES.includes(o.lengthPref as LengthPref)
    ? (o.lengthPref as LengthPref)
    : DEFAULT_REPLY_SETTINGS.lengthPref
  const languageMode = LANGUAGE_MODES.includes(o.languageMode as LanguageMode)
    ? (o.languageMode as LanguageMode)
    : DEFAULT_REPLY_SETTINGS.languageMode
  const fixedRaw = clampText(o.fixedLanguage, 5).toLowerCase()
  const fixedLanguage = SUPPORTED_FIXED_LANGUAGES.some((l) => l.code === fixedRaw)
    ? fixedRaw
    : DEFAULT_REPLY_SETTINGS.fixedLanguage
  return {
    signature: clampText(o.signature, 200),
    toneInstructions: clampText(o.toneInstructions, 600),
    lengthPref,
    guidelines: clampText(o.guidelines, 1500),
    languageMode,
    fixedLanguage,
    keepRatingTone: o.keepRatingTone !== false,
    allowEmoji: o.allowEmoji === true,
  }
}

/** Mappa il record snake_case del DB nel tipo camelCase. */
export function settingsFromRow(row: Record<string, unknown> | null | undefined): ReviewReplySettings {
  if (!row) return { ...DEFAULT_REPLY_SETTINGS }
  return sanitizeReplySettings({
    signature: row.signature,
    toneInstructions: row.tone_instructions,
    lengthPref: row.length_pref,
    guidelines: row.guidelines,
    languageMode: row.language_mode,
    fixedLanguage: row.fixed_language,
    keepRatingTone: row.keep_rating_tone,
    allowEmoji: row.allow_emoji,
  })
}

/** Mappa il tipo camelCase nel record snake_case per l'upsert. */
export function settingsToRow(s: ReviewReplySettings): Record<string, unknown> {
  return {
    signature: s.signature || null,
    tone_instructions: s.toneInstructions || null,
    length_pref: s.lengthPref,
    guidelines: s.guidelines || null,
    language_mode: s.languageMode,
    fixed_language: s.fixedLanguage || null,
    keep_rating_tone: s.keepRatingTone,
    allow_emoji: s.allowEmoji,
  }
}

const LENGTH_HINT: Record<LengthPref, string> = {
  short: "Molto concisa: 2-3 frasi.",
  medium: "Lunghezza media: 4-6 frasi.",
  long: "Più articolata: 6-9 frasi, comunque senza divagare.",
}

const LANG_NAMES: Record<string, string> = {
  it: "italiano",
  en: "inglese",
  de: "tedesco",
  fr: "francese",
  es: "spagnolo",
}

/**
 * Costruisce le righe di prompt derivate dalle impostazioni del tenant.
 * Ritorna { rules, languageInstruction } dove languageInstruction sovrascrive
 * la lingua di default quando il tenant forza una lingua fissa.
 */
export function buildSettingsPromptParts(
  s: ReviewReplySettings,
  guestLangName: string,
): { rules: string[]; languageInstruction: string } {
  const rules: string[] = []

  const languageInstruction =
    s.languageMode === "fixed"
      ? `- Rispondi SEMPRE in ${LANG_NAMES[s.fixedLanguage] || "italiano"}, indipendentemente dalla lingua della recensione.`
      : `- Rispondi in ${guestLangName} (la lingua dell'ospite).`

  rules.push(`- ${LENGTH_HINT[s.lengthPref]}`)
  rules.push(s.allowEmoji ? "- Puoi usare emoji con parsimonia, se appropriato." : "- Niente emoji.")

  if (s.toneInstructions) {
    rules.push(`- Indicazioni di tono/stile della struttura: ${s.toneInstructions}`)
  }
  if (s.signature) {
    rules.push(`- Firma la risposta esattamente così: "${s.signature}".`)
  } else {
    rules.push("- Firma in modo naturale a nome della direzione/staff della struttura.")
  }
  if (s.guidelines) {
    rules.push(`- Linee guida sempre da rispettare: ${s.guidelines}`)
  }

  return { rules, languageInstruction }
}
