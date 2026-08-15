/**
 * Il bersaglio della collaborazione: quale messaggio si sta lavorando.
 *
 * Questo modulo NON e' `server-only` di proposito: sia le rotte sia il pannello
 * (che gira nel browser) devono parlare la stessa lingua. Se il tipo vivesse
 * dentro un modulo riservato al server, il pannello non potrebbe importarlo e
 * finirebbe per costruire le chiavi a mano, con il rischio che le due parti si
 * disallineino senza che nulla lo segnali.
 *
 * Due mondi in una coppia (tipo, chiave):
 *  - "conversation": le nostre conversazioni multicanale (WhatsApp, Telegram,
 *    widget, email interne), identificate dall'uuid della riga;
 *  - "gmail_thread": i thread di Gmail, che NON sono salvati da noi e vivono su
 *    Google, identificati dall'id del thread.
 */

export type TipoBersaglio = "conversation" | "gmail_thread"

export interface Bersaglio {
  kind: TipoBersaglio
  key: string
}

export const TIPI_BERSAGLIO: TipoBersaglio[] = ["conversation", "gmail_thread"]

/** Riconosce un bersaglio arrivato dalla rete. Restituisce null se non e'
 *  valido: le rotte rispondono 400 invece di scrivere righe senza senso. */
export function leggiBersaglio(valore: unknown): Bersaglio | null {
  if (!valore || typeof valore !== "object") return null
  const { kind, key } = valore as { kind?: unknown; key?: unknown }
  if (typeof kind !== "string" || typeof key !== "string") return null
  if (!TIPI_BERSAGLIO.includes(kind as TipoBersaglio)) return null
  if (key.trim().length === 0) return null
  return { kind: kind as TipoBersaglio, key: key.trim() }
}

/** Chiave piatta per usare il bersaglio come indice di una mappa nel pannello. */
export function chiaveBersaglio(bersaglio: Bersaglio): string {
  return `${bersaglio.kind}:${bersaglio.key}`
}
