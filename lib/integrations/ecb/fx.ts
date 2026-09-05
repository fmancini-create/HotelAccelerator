import "server-only"

const ECB_DAILY_FX_URL = "https://www.ecb.europa.eu/stats/eurofxref/eurofxref-daily.xml"
const REQUEST_TIMEOUT_MS = 10_000

export type EcbFxSnapshot = {
  source: "ecb"
  fromCurrency: string
  toCurrency: string
  rate: number
  referenceDate: string
  fetchedAt: string
  euroRates: Record<string, number>
}

function normalizeCurrency(value: string) {
  return value.trim().toUpperCase()
}

function parseDailyRates(xml: string) {
  const dateMatch = xml.match(/<Cube\s+time=['"](\d{4}-\d{2}-\d{2})['"]/i)
  if (!dateMatch) throw new Error("La BCE non ha restituito la data del tasso di cambio.")

  const euroRates: Record<string, number> = { EUR: 1 }
  const rateRegex = /<Cube\s+currency=['"]([A-Z]{3})['"]\s+rate=['"]([0-9.]+)['"]\s*\/?\s*>/gi
  let match: RegExpExecArray | null
  while ((match = rateRegex.exec(xml)) !== null) {
    const value = Number(match[2])
    if (Number.isFinite(value) && value > 0) euroRates[match[1].toUpperCase()] = value
  }

  return { referenceDate: dateMatch[1], euroRates }
}

/**
 * I reference rate BCE sono quotati come unita di valuta per 1 EUR.
 * La conversione generica A -> B e quindi rate(B/EUR) / rate(A/EUR).
 */
export function crossRateFromEuroRates(
  euroRates: Record<string, number>,
  fromCurrency: string,
  toCurrency: string,
) {
  const from = normalizeCurrency(fromCurrency)
  const to = normalizeCurrency(toCurrency)
  if (from === to) return 1
  const fromPerEuro = euroRates[from]
  const toPerEuro = euroRates[to]
  if (!Number.isFinite(fromPerEuro) || fromPerEuro <= 0) {
    throw new Error(`Cambio BCE non disponibile per ${from}.`)
  }
  if (!Number.isFinite(toPerEuro) || toPerEuro <= 0) {
    throw new Error(`Cambio BCE non disponibile per ${to}.`)
  }
  return toPerEuro / fromPerEuro
}

export async function getEcbFxRate(fromCurrency: string, toCurrency: string): Promise<EcbFxSnapshot> {
  const from = normalizeCurrency(fromCurrency)
  const to = normalizeCurrency(toCurrency)
  if (from === to) {
    const today = new Date().toISOString().slice(0, 10)
    return {
      source: "ecb",
      fromCurrency: from,
      toCurrency: to,
      rate: 1,
      referenceDate: today,
      fetchedAt: new Date().toISOString(),
      euroRates: { EUR: 1, [from]: 1 },
    }
  }

  const response = await fetch(ECB_DAILY_FX_URL, {
    method: "GET",
    headers: { accept: "application/xml,text/xml;q=0.9,*/*;q=0.8" },
    cache: "no-store",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  if (!response.ok) {
    throw new Error(`Cambio BCE non disponibile (HTTP ${response.status}).`)
  }

  const xml = await response.text()
  const parsed = parseDailyRates(xml)
  return {
    source: "ecb",
    fromCurrency: from,
    toCurrency: to,
    rate: crossRateFromEuroRates(parsed.euroRates, from, to),
    referenceDate: parsed.referenceDate,
    fetchedAt: new Date().toISOString(),
    euroRates: parsed.euroRates,
  }
}
