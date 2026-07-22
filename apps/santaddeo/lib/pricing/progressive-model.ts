/**
 * Progressive Pricing Model (sandbox)
 * ====================================
 *
 * Terzo algoritmo di pricing in fase di sperimentazione (NON in produzione).
 * Da inserire come algorithm_type ufficiale solo dopo validazione su dati
 * reali. Vedi `v0_memories/user/santaddeo-pricing-engine-immutability.md`
 * per le regole di immutabilita' del motore.
 *
 * Formula (da spreadsheet santaddeo):
 *
 *   P(X) = ((PMAX - PI) * A^(X-1) + PI * A^(N-1) - PMAX) / (A^(N-1) - 1)
 *
 * dove:
 *   N    = numero totale di camere della tipologia
 *   K    = coefficiente di domanda intero in [0, 10]. Suggerimento per
 *          PI: PI_suggerito = PMIN + (K/10) * (PMAX - PMIN). Non e' usato
 *          dal calcolo: serve solo a generare un PI sensato quando l'utente
 *          non lo imposta manualmente.
 *   PMIN = prezzo minimo (copertura costi variabili)
 *   PMAX = prezzo massimo (rack)
 *   PI   = prezzo iniziale (X=1). Input diretto. Se non passato, viene
 *          calcolato da K via la formula sopra.
 *   A    = base di crescita intera in [2, 10]
 *   X    = numero camere gia' vendute + 1 (camera in vendita)
 *
 * Proprieta':
 *   - P(1)  = PI
 *   - P(N)  = PMAX
 *   - A=2 -> curva piu' graduale (prezzi alti gia' a meta' occupazione)
 *   - A=10 -> curva piu' piatta (salto al massimo solo all'ultima camera)
 *
 * NESSUNA dipendenza da bande di occupazione, scenario storico, K vars,
 * last minute, market demand: questa formula sostituisce quei concetti
 * con un'unica curva matematica parametrizzata da K e A.
 */

export interface ProgressiveParams {
  /** Numero totale di camere della tipologia. Intero >= 1. */
  N: number
  /** Coefficiente di domanda. Intero in [0, 10]. Usato solo per derivare PI quando non e' passato esplicitamente. */
  K: number
  /** Prezzo minimo (copertura costi). > 0. */
  PMIN: number
  /** Prezzo massimo (rack). > PMIN. */
  PMAX: number
  /** Base di crescita. Intero in [2, 10]. */
  A: number
  /** Prezzo iniziale X=1. Se omesso o null, viene calcolato da K, PMIN, PMAX. */
  PI?: number | null
}

export interface ProgressiveResult {
  /** Prezzo iniziale calcolato (X=1). */
  PI: number
  /**
   * Curva completa: prezzi[i] e' P(i+1) per i in [0, N-1]
   * (prezzi[0] = P(1) = PI, prezzi[N-1] = P(N) = PMAX).
   */
  prices: number[]
  /** Parametri normalizzati effettivamente usati (clampati ai range). */
  normalized: ProgressiveParams
}

/** Clampa i parametri ai range validi e li forza interi dove richiesto. */
function normalizeParams(p: ProgressiveParams): Required<Omit<ProgressiveParams, "PI">> & { PI: number } {
  const N = Math.max(1, Math.round(p.N))
  const K = Math.max(0, Math.min(10, Math.round(p.K)))
  const A = Math.max(2, Math.min(10, Math.round(p.A)))
  const PMIN = Math.max(0, p.PMIN)
  const PMAX = Math.max(PMIN + 0.01, p.PMAX)
  // PI esplicito se passato, altrimenti derivato da K
  const piRaw =
    p.PI !== undefined && p.PI !== null
      ? p.PI
      : PMIN + (K / 10) * (PMAX - PMIN)
  // Clampa PI in [PMIN, PMAX] per garantire monotonia della curva
  const PI = Math.max(PMIN, Math.min(PMAX, piRaw))
  return { N, K, PMIN, PMAX, A, PI }
}

/**
 * Calcola PI suggerito a partire da K, PMIN, PMAX.
 * Lineare: K=0 -> PI=PMIN, K=10 -> PI=PMAX.
 * NB: questo e' solo un suggerimento. Il calcolo del prezzo usa il PI
 * esplicito se passato in `ProgressiveParams.PI`.
 */
export function computePI(params: Pick<ProgressiveParams, "K" | "PMIN" | "PMAX">): number {
  const K = Math.max(0, Math.min(10, Math.round(params.K)))
  return params.PMIN + (K / 10) * (params.PMAX - params.PMIN)
}

/**
 * Calcola il prezzo per una specifica posizione X (camera in vendita).
 * X=1 e' la prima camera, X=N e' l'ultima. Valori fuori range vengono
 * clampati al range valido.
 */
export function computeProgressivePrice(
  params: ProgressiveParams,
  X: number,
): number {
  const { N, PMAX, A, PI } = normalizeParams(params)
  const x = Math.max(1, Math.min(N, Math.round(X)))

  // Caso degenere: una sola camera -> sempre PMAX
  if (N === 1) return PMAX

  const aPowXminus1 = Math.pow(A, x - 1)
  const aPowNminus1 = Math.pow(A, N - 1)
  const denom = aPowNminus1 - 1
  if (denom <= 0) return PI // safety: A>=2 quindi non dovrebbe mai capitare

  const numerator = (PMAX - PI) * aPowXminus1 + PI * aPowNminus1 - PMAX
  return numerator / denom
}

/**
 * Genera l'intera curva di prezzi per X in [1, N].
 * Utile per simulazione/visualizzazione (sandbox).
 */
export function computeProgressiveCurve(
  params: ProgressiveParams,
): ProgressiveResult {
  const normalized = normalizeParams(params)
  const prices: number[] = []
  for (let x = 1; x <= normalized.N; x++) {
    prices.push(computeProgressivePrice(normalized, x))
  }
  return { PI: normalized.PI, prices, normalized }
}
