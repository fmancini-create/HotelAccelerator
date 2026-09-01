/**
 * Catalogo stabile dei prodotti esposti dal menu vocale 4 BID.
 *
 * Il tasto e il nome pubblico sono configurazione di prodotto; l'ID della base
 * di conoscenza, invece, appartiene al tenant e non va mai hardcoded. La base
 * viene risolta dentro l'elenco gia' filtrato per `property_id`.
 */
export const VOICE_PRODUCTS = [
  {
    key: "hotel-accelerator",
    dtmf: "1",
    label: "Hotel Accelerator",
    suggestedExtension: "810",
    aliases: ["hotel accelerator", "hotelaccelerator", "4 bid hotel accelerator", "4bid hotel accelerator"],
  },
  {
    key: "santaddeo-rms",
    dtmf: "2",
    label: "Santaddeo RMS",
    suggestedExtension: "811",
    aliases: ["santaddeo rms", "santaddeo", "santaddeo revenue management system"],
  },
  {
    key: "hotel-profit-ai",
    dtmf: "3",
    label: "Hotel Profit AI",
    suggestedExtension: "812",
    aliases: ["hotel profit ai", "hotelprofit ai", "hotel profit", "hotelprofit"],
  },
  {
    key: "manubot",
    dtmf: "4",
    label: "ManuBot",
    suggestedExtension: "813",
    aliases: ["manubot", "manu bot"],
  },
] as const

export type VoiceProduct = (typeof VOICE_PRODUCTS)[number]
export type VoiceProductKey = VoiceProduct["key"]

/** Fallback generico degli agenti telefonici dei tenant. */
export const VOICE_FALLBACK_EXTENSION = "200"

/** Coda operatore del centralino corporate 4BID sul PBX condiviso. */
export const VOICE_4BID_FALLBACK_EXTENSION = "820"

export interface VoiceKnowledgeBaseCandidate {
  id: string
  name: string
  description: string | null
  source_count: number
}

export type VoiceKnowledgeBaseResolution<T extends VoiceKnowledgeBaseCandidate = VoiceKnowledgeBaseCandidate> =
  | { ok: true; base: T; matchedBy: "marker" | "name" }
  | { ok: false; reason: "not_found" | "ambiguous"; candidates: T[] }

/** Confronto tollerante a spazi e punteggiatura, ma non a corrispondenze parziali. */
export function normalizeVoiceLabel(value: string): string {
  return value
    .toLocaleLowerCase("it")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ")
}

export function getVoiceProduct(value: string | null | undefined): VoiceProduct | null {
  const normalized = value?.trim().toLowerCase()
  return VOICE_PRODUCTS.find((product) => product.key === normalized) ?? null
}

/**
 * Risolve una base senza mai "indovinare" per sottostringa.
 *
 * Il marker `[voice:chiave-prodotto]` nella descrizione ha precedenza sul nome:
 * consente di rinominare liberamente la base senza introdurre una nuova colonna.
 * Zero o piu' di un risultato sono errori espliciti e portano all'operatore.
 */
export function resolveVoiceKnowledgeBase<T extends VoiceKnowledgeBaseCandidate>(
  product: VoiceProduct,
  bases: T[],
): VoiceKnowledgeBaseResolution<T> {
  const marker = `[voice:${product.key}]`
  const marked = bases.filter((base) => base.description?.toLowerCase().includes(marker))
  if (marked.length === 1) return { ok: true, base: marked[0], matchedBy: "marker" }
  if (marked.length > 1) return { ok: false, reason: "ambiguous", candidates: marked }

  const aliases = new Set(product.aliases.map(normalizeVoiceLabel))
  const named = bases.filter((base) => aliases.has(normalizeVoiceLabel(base.name)))
  if (named.length === 1) return { ok: true, base: named[0], matchedBy: "name" }
  if (named.length > 1) return { ok: false, reason: "ambiguous", candidates: named }

  return { ok: false, reason: "not_found", candidates: [] }
}

/**
 * Basi aggiuntive del prodotto, sempre cercate nell'elenco gia' tenant-scoped.
 * Il marker e' distinto da quello della primaria per impedire che una base
 * condivisa diventi accidentalmente l'autorita' principale dell'agente.
 */
export function resolveSharedVoiceKnowledgeBases<T extends VoiceKnowledgeBaseCandidate>(
  product: VoiceProduct,
  bases: T[],
): T[] {
  const marker = `[voice-shared:${product.key}]`
  return bases.filter((base) => base.description?.toLowerCase().includes(marker))
}
