// Astrazione provider-agnostica per il Rate Shopper.
// Un "provider" sa restituire i prezzi del comp set in un formato normalizzato.
// L'app non dipende da nessun fornitore specifico: l'adapter "manual" funziona
// da subito (inserimento/CSV), gli adapter esterni si agganciano quando si
// sceglie il fornitore e si configurano le relative env.

export interface NormalizedRate {
  /** riferimento del competitor presso il provider (o competitor_id per manual) */
  competitorRef: string
  stayDate: string // YYYY-MM-DD
  price: number | null
  currency: string
  availability: boolean | null
  los: number
  occupancy: number
  channel?: string | null
  raw?: unknown
}

export interface FetchRatesParams {
  hotelId: string
  from: string // YYYY-MM-DD
  to: string // YYYY-MM-DD
  /** competitor del comp set con il loro external_ref */
  competitors: Array<{ id: string; externalRef: string | null; name: string }>
  los?: number
  occupancy?: number
}

export interface RateShopperProvider {
  /** chiave stabile salvata su competitors.provider / competitor_rates.provider */
  readonly key: string
  /** true se il provider e' configurato (env presenti) ed e' usabile da cron */
  isConfigured(): boolean
  /** recupera i prezzi normalizzati per il range richiesto */
  fetchRates(params: FetchRatesParams): Promise<NormalizedRate[]>
}
