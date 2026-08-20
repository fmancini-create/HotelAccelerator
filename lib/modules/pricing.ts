/**
 * Prezzo di vendita di un modulo a pagamento.
 *
 * REGOLA: si salva SOLO il costo che sosteniamo. Il prezzo e' il doppio, e
 * viene calcolato qui ogni volta che serve.
 *
 * Perche' non salvare il prezzo in tabella: sarebbero due numeri da tenere
 * d'accordo. Il giorno in cui il costo cambia, il prezzo salvato resterebbe
 * quello vecchio e il margine si assottiglierebbe SENZA che nessuno veda un
 * errore. Con una sola fonte questo non puo' accadere.
 */

/**
 * Quante volte il costo viene coperto dal prezzo. 2 = il prezzo raddoppia il
 * costo, cioe' meta' del prezzo e' margine.
 *
 * Sta qui come costante e non sparso nel codice: se un domani il ricarico
 * cambia, cambia in un punto solo.
 */
export const MOLTIPLICATORE_PREZZO = 2

/**
 * Prezzo di vendita in centesimi a partire dal costo in centesimi.
 *
 * `null` in ingresso -> `null` in uscita, MAI 0: "costo non ancora impostato" e
 * "costa zero" sono due cose diverse, e mostrare "0,00 EUR" a un cliente
 * significherebbe dirgli che e' gratis. Chi visualizza deve distinguere i due
 * casi, e con `null` e' obbligato a farlo.
 */
export function prezzoVenditaCentesimi(costoCentesimi: number | null | undefined): number | null {
  if (costoCentesimi === null || costoCentesimi === undefined) return null
  if (!Number.isFinite(costoCentesimi)) return null
  // Un costo negativo non e' rappresentabile come prezzo: il database lo vieta
  // (vincolo modules_monthly_cost_non_negative), ma il calcolo non si fida di
  // un dato che arriva da fuori.
  if (costoCentesimi < 0) return null
  return Math.round(costoCentesimi * MOLTIPLICATORE_PREZZO)
}

/**
 * Margine in centesimi: quanto resta dopo aver coperto il costo.
 */
export function margineCentesimi(costoCentesimi: number | null | undefined): number | null {
  const prezzo = prezzoVenditaCentesimi(costoCentesimi)
  if (prezzo === null || costoCentesimi === null || costoCentesimi === undefined) return null
  return prezzo - costoCentesimi
}

/**
 * Importo in euro come si scrive in italiano (virgola per i decimali).
 * `null` diventa una frase, non un numero: vedi sopra.
 */
export function formattaImporto(centesimi: number | null | undefined): string {
  if (centesimi === null || centesimi === undefined || !Number.isFinite(centesimi)) {
    return "non impostato"
  }
  return new Intl.NumberFormat("it-IT", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
  }).format(centesimi / 100)
}
