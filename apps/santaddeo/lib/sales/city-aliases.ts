/**
 * Alias IT <-> EN per i nomi delle citta' italiane piu' comuni.
 *
 * Contesto: nella tabella `prospects` molte citta' sono salvate in inglese
 * (Florence, Rome, Milan, Venice...) perche' la sorgente OSM/scraper le
 * restituisce localizzate. Il venditore pero' digita in italiano.
 *
 * `expandCityQuery(input)` restituisce sempre la lista degli alias possibili
 * (incluso l'input originale). L'API costruisce poi un OR di ilike su tutti.
 *
 * Quando aggiungi una nuova coppia mettere sempre [italiano, inglese].
 * Match case-insensitive sull'input.
 */
const CITY_ALIASES: Array<[string, string]> = [
  ["Roma", "Rome"],
  ["Milano", "Milan"],
  ["Torino", "Turin"],
  ["Firenze", "Florence"],
  ["Venezia", "Venice"],
  ["Napoli", "Naples"],
  ["Genova", "Genoa"],
  ["Padova", "Padua"],
  ["Mantova", "Mantua"],
  ["Siracusa", "Syracuse"],
  ["Bolzano", "Bozen"],
  ["Trento", "Trent"],
  ["Aosta", "Aoste"],
  ["Vicenza", "Vicence"],
  // Province con nomi storicamente tradotti
  ["Massa e Carrara", "Massa and Carrara"],
  ["Reggio Emilia", "Reggio nell'Emilia"],
  ["Forli'", "Forli"],
]

// Costruisce due mappe: lowercase IT -> EN e lowercase EN -> IT
const IT_TO_EN = new Map<string, string>()
const EN_TO_IT = new Map<string, string>()
for (const [it, en] of CITY_ALIASES) {
  IT_TO_EN.set(it.toLowerCase(), en)
  EN_TO_IT.set(en.toLowerCase(), it)
}

/**
 * Restituisce tutti i possibili alias da cercare per la stringa data.
 * Include sempre l'input originale, deduplicato case-insensitive.
 */
export function expandCityQuery(input: string): string[] {
  const cleaned = input.trim()
  if (!cleaned) return []
  const lower = cleaned.toLowerCase()
  const set = new Set<string>([cleaned])
  const en = IT_TO_EN.get(lower)
  if (en) set.add(en)
  const it = EN_TO_IT.get(lower)
  if (it) set.add(it)
  return Array.from(set)
}
