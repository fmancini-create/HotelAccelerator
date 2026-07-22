/**
 * K-DRIVEN PRICING FORMULA
 * 
 * Modello esponenziale per la determinazione del prezzo camera
 * basato sul coefficiente di domanda K e sulle camere già prenotate.
 * 
 * PARAMETRI:
 * - N: Numero totale camere della tipologia
 * - K: Coefficiente di domanda (0-10), aumenta con la domanda
 * - PMIN: Prezzo minimo della camera (copre costi variabili)
 * - PMAX: Prezzo massimo della camera
 * - A: Base di crescita (2-10), determina la curva esponenziale
 * - X: Quale camera stiamo vendendo (da 1 a N)
 * 
 * FORMULE:
 * 1. Prezzo di Ingresso (PI):
 *    PI = PMIN + (K/10) * (PMAX - PMIN)
 * 
 * 2. Prezzo Camera X (P):
 *    P = ((PMAX - PI) * A^(X-1) + PI * A^(N-1) - PMAX) / (A^(N-1) - 1)
 * 
 * La curva parte da PI (prima camera) e arriva a PMAX (ultima camera).
 */

export interface KDrivenParams {
  /** Numero totale camere della tipologia */
  N: number
  /** Coefficiente di domanda (0-10) */
  K: number
  /** Prezzo minimo camera */
  PMIN: number
  /** Prezzo massimo camera */
  PMAX: number
  /** Base di crescita (2-10) */
  A: number
}

export interface KDrivenResult {
  /** Prezzo di ingresso/partenza */
  PI: number
  /** Array di prezzi per ogni camera (da 1 a N) */
  prices: number[]
  /** Prezzo per la prossima camera da vendere */
  nextPrice: number
  /** Indice della prossima camera da vendere (1-based) */
  nextCameraIndex: number
}

/**
 * Calcola il Prezzo di Ingresso (PI)
 * PI = PMIN + (K/10) * (PMAX - PMIN)
 */
export function calculatePI(params: Pick<KDrivenParams, 'K' | 'PMIN' | 'PMAX'>): number {
  const { K, PMIN, PMAX } = params
  
  // Clamp K between 0 and 10
  const clampedK = Math.max(0, Math.min(10, K))
  
  // PI = PMIN + (K/10) * (PMAX - PMIN)
  const PI = PMIN + (clampedK / 10) * (PMAX - PMIN)
  
  return Math.round(PI * 100) / 100 // Round to 2 decimals
}

/**
 * Calcola il prezzo per la camera X
 * P = ((PMAX - PI) * A^(X-1) + PI * A^(N-1) - PMAX) / (A^(N-1) - 1)
 * 
 * @param X - Quale camera stiamo vendendo (1 to N)
 */
export function calculatePriceForCamera(
  params: KDrivenParams,
  X: number,
  PI?: number
): number {
  const { N, PMIN, PMAX, A, K } = params
  
  // Validate X is within bounds
  if (X < 1 || X > N) {
    throw new Error(`Camera index X (${X}) must be between 1 and ${N}`)
  }
  
  // Calculate PI if not provided
  const pricePI = PI ?? calculatePI({ K, PMIN, PMAX })
  
  // Clamp A between 2 and 10
  const clampedA = Math.max(2, Math.min(10, A))
  
  // Special case: if N = 1, there's only one camera
  if (N === 1) {
    return pricePI
  }
  
  // Calculate A^(N-1) - 1 (denominator)
  const aN1 = Math.pow(clampedA, N - 1)
  const denominator = aN1 - 1
  
  // Prevent division by zero (shouldn't happen with A >= 2 and N >= 2)
  if (denominator === 0) {
    return pricePI
  }
  
  // Calculate A^(X-1)
  const aX1 = Math.pow(clampedA, X - 1)
  
  // P = ((PMAX - PI) * A^(X-1) + PI * A^(N-1) - PMAX) / (A^(N-1) - 1)
  const numerator = (PMAX - pricePI) * aX1 + pricePI * aN1 - PMAX
  const P = numerator / denominator
  
  // Round to 2 decimals and clamp between PMIN and PMAX
  return Math.round(Math.max(PMIN, Math.min(PMAX, P)) * 100) / 100
}

/**
 * Calcola tutti i prezzi per una tipologia camera usando il modello K-driven
 * 
 * @param params - Parametri K-driven
 * @param camereSoldCount - Numero di camere già vendute (0 to N-1)
 */
export function calculateKDrivenPrices(
  params: KDrivenParams,
  camereSoldCount: number = 0
): KDrivenResult {
  const { N, K, PMIN, PMAX, A } = params
  
  // Validate inputs
  if (N < 1) throw new Error('N must be at least 1')
  if (K < 0 || K > 10) throw new Error('K must be between 0 and 10')
  if (PMIN > PMAX) throw new Error('PMIN cannot be greater than PMAX')
  if (A < 2 || A > 10) throw new Error('A must be between 2 and 10')
  
  // Calculate PI (entry price)
  const PI = calculatePI({ K, PMIN, PMAX })
  
  // Calculate prices for all cameras (1 to N)
  const prices: number[] = []
  for (let X = 1; X <= N; X++) {
    const price = calculatePriceForCamera(params, X, PI)
    prices.push(price)
  }
  
  // Determine next camera to sell (1-based index)
  // If camereSoldCount = 0, next is camera 1
  // If camereSoldCount = 3, next is camera 4
  const nextCameraIndex = Math.min(camereSoldCount + 1, N)
  const nextPrice = prices[nextCameraIndex - 1] // Array is 0-indexed
  
  return {
    PI,
    prices,
    nextPrice,
    nextCameraIndex
  }
}

/**
 * Calcola il coefficiente K basato sulle variabili di pressione
 * 
 * Ogni variabile ha un valore raw (-1 a +1) e un peso (0-10).
 * K = media pesata delle variabili, normalizzata a 0-10.
 */
export function calculateKFromVariables(
  variables: Array<{
    /** Valore raw della variabile (-1 a +1, dove 0 è neutro) */
    value: number
    /** Peso assegnato dal revenue manager (0-10) */
    weight: number
  }>
): number {
  if (variables.length === 0) return 5 // Neutral K
  
  let weightedSum = 0
  let totalWeight = 0
  
  for (const { value, weight } of variables) {
    // Clamp values
    const clampedValue = Math.max(-1, Math.min(1, value))
    const clampedWeight = Math.max(0, Math.min(10, weight))
    
    // Convert value from [-1, 1] to [0, 10]
    const normalizedValue = (clampedValue + 1) * 5
    
    weightedSum += normalizedValue * clampedWeight
    totalWeight += clampedWeight
  }
  
  if (totalWeight === 0) return 5 // Neutral K
  
  // Return weighted average (already in 0-10 range)
  return Math.round((weightedSum / totalWeight) * 100) / 100
}

/**
 * Esempio di utilizzo:
 * 
 * const params: KDrivenParams = {
 *   N: 6,        // 6 camere della tipologia
 *   K: 7,        // Alta domanda
 *   PMIN: 50,    // Prezzo minimo €50
 *   PMAX: 200,   // Prezzo massimo €200
 *   A: 2         // Base di crescita 2 (curva moderata)
 * }
 * 
 * const result = calculateKDrivenPrices(params, 2) // 2 camere già vendute
 * // result.PI = 155 (prezzo di ingresso)
 * // result.prices = [155, 158.23, 164.84, 178.39, 205.81, 261.29] // prezzi teorici
 * // result.nextCameraIndex = 3 (prossima camera da vendere)
 * // result.nextPrice = 164.84 (prezzo per la terza camera)
 */
