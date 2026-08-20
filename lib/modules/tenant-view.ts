/**
 * Cosa vede un hotel dei moduli a pagamento.
 *
 * Un hotel deve vedere il PREZZO. Non deve vedere il COSTO che sosteniamo noi:
 * dal costo si legge subito il nostro margine (il prezzo e' il doppio), e non e'
 * un'informazione che appartiene al cliente.
 *
 * La difesa non e' "ricordarsi di non stamparlo": e' che nel tipo qui sotto il
 * costo NON ESISTE. Se un domani qualcuno aggiunge una colonna alla tabella dei
 * moduli sulla pagina dell'hotel, non ha nulla da cui prenderlo, e il
 * compilatore lo fermerebbe se provasse. Un `if` che nasconde si dimentica; un
 * campo che non c'e' non si dimentica.
 */

import type { ModuleWithState } from "."
import { prezzoVenditaCentesimi } from "./pricing"

/**
 * Vista di un modulo destinata all'hotel: come `ModuleWithState`, ma senza il
 * costo e con il prezzo al suo posto.
 */
export type TenantModuleView = Omit<ModuleWithState, "monthlyCostCents"> & {
  /**
   * Prezzo mensile in centesimi. `null` = non ancora determinato, che NON vuol
   * dire gratis: chi mostra il dato deve dirlo a parole.
   */
  monthlyPriceCents: number | null
}

/**
 * Converte la riga completa (con il costo) nella vista per l'hotel.
 * Il costo viene eliminato dall'oggetto, non solo omesso dal tipo: cosi' non
 * finisce nel JSON della risposta nemmeno per errore.
 */
export function toTenantModuleView(modulo: ModuleWithState): TenantModuleView {
  const { monthlyCostCents, ...resto } = modulo
  return {
    ...resto,
    monthlyPriceCents: prezzoVenditaCentesimi(monthlyCostCents),
  }
}

export function toTenantModuleViews(moduli: ModuleWithState[]): TenantModuleView[] {
  return moduli.map(toTenantModuleView)
}
