import type { RateShopperProvider, FetchRatesParams, NormalizedRate } from "@/lib/rate-shopper/provider"

/**
 * Adapter "manual": non recupera nulla da fonti esterne. I prezzi arrivano
 * dall'inserimento manuale o dall'import CSV tramite la route /ingest, che
 * scrive direttamente su competitor_rates. fetchRates() e' quindi un no-op:
 * serve solo a soddisfare l'interfaccia per il cron (che lo salta).
 *
 * E' l'adapter che valida UI + storage + confronto col nostro prezzo senza
 * dipendere da alcun contratto/credenziale.
 */
export class ManualProvider implements RateShopperProvider {
  readonly key = "manual"

  isConfigured(): boolean {
    // Sempre disponibile, ma non viene "pullato" dal cron (nessuna fonte).
    return true
  }

  async fetchRates(_params: FetchRatesParams): Promise<NormalizedRate[]> {
    return []
  }
}
