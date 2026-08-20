/**
 * Il cervello dell'apprendimento per osservazione dentro il PMS.
 *
 * Qui non si parla con nessun database e non si chiama nessuna API: sono
 * funzioni pure, cosi' si possono provare davvero. Chi le usa (la rotta di
 * ingresso degli eventi) mette le righe a posto.
 *
 * Perche' esiste questo file separato dalla rotta.
 * La stessa domanda - "questa sequenza l'abbiamo gia' vista? puo' agire da
 * sola?" - servira' alla rotta che riceve gli eventi, alla pagina che li mostra
 * e a chi eseguira' le procedure. Se la formula stesse dentro la rotta, la
 * seconda e la terza copia divergerebbero e nessuno saprebbe quale comanda.
 */

import { normalizzaDomanda } from "@/lib/ai/gaps"

export type ShadowAction = "navigate" | "click" | "fill" | "select" | "submit" | "keypress"

/**
 * Di che natura era il valore digitato. NON il valore.
 * Vedi il commento della colonna `value_kind` in scripts/216: chi lavora nel
 * PMS digita anche la propria password, e gli ospiti sono persone reali.
 */
export type ValueKind = "empty" | "text" | "number" | "date" | "money" | "email" | "phone" | "secret"

export type Risk = "basso" | "medio" | "alto"

export type ProcedureStatus = "osservata" | "proposta" | "autonoma" | "bloccata"

/**
 * Un passo osservato.
 *
 * Si noti cosa NON c'e': un campo `value`. Non e' una dimenticanza, e' la
 * garanzia. Se il tipo non ha un posto dove mettere il testo digitato, nessuna
 * riscrittura distratta potra' salvarlo per sbaglio.
 */
export interface ShadowStep {
  action: ShadowAction
  targetRole?: string | null
  targetLabel?: string | null
  urlPath?: string | null
  valueKind?: ValueKind | null
}

/**
 * Quante volte una procedura deve essere vista prima di poter agire da sola.
 *
 * Cinque e non una: una volta sola non e' un'abitudine, e' un caso. Il numero
 * viene salvato sulla riga (`autonomy_threshold`) nel momento in cui la
 * procedura matura, perche' questa costante si puo' cambiare domani e senza il
 * valore storico non si potrebbe piu' spiegare perche' quella procedura agisce.
 */
export const SOGLIA_AUTONOMIA_PREDEFINITA = 5

/**
 * Parole che rendono una procedura ad alto rischio.
 *
 * Sono i gesti che toccano soldi o cancellano lavoro altrui. Una procedura che
 * ne contiene una non diventa mai autonoma, per quante volte la si sia vista:
 * la ripetizione dimostra che e' abituale, non che sia innocua. Un rimborso
 * fatto cento volte correttamente e' comunque un rimborso.
 */
const PAROLE_RISCHIO_ALTO = [
  "annulla",
  "annullamento",
  "cancella",
  "cancellazione",
  "elimina",
  "rimborso",
  "storno",
  "incassa",
  "incasso",
  "pagamento",
  "paga",
  "prezzo",
  "tariffa",
  "sconto",
  "addebita",
  "addebito",
  "fattura",
  "overbooking",
  "no show",
]

/**
 * Il testo normalizzato di un passo, usato per riconoscerlo.
 *
 * Si appoggia a `normalizzaDomanda` (la stessa funzione che riconosce le
 * domande ripetute in 214) invece di ricopiarne la formula: "Salva", "salva" e
 * "SALVA!" sono lo stesso pulsante.
 */
function improntaPasso(step: ShadowStep): string {
  const ruolo = normalizzaDomanda(step.targetRole ?? "")
  const etichetta = normalizzaDomanda(step.targetLabel ?? "")
  // Il percorso NON passa da normalizzaDomanda: quella funzione mangia le
  // barre, e "/prenotazioni/nuova" e "/prenotazioni/nuovo-ospite" diventerebbero
  // indistinguibili.
  const percorso = (step.urlPath ?? "").toLowerCase().replace(/\/+$/, "")
  return [step.action, ruolo, etichetta, percorso, step.valueKind ?? ""].join("|")
}

/**
 * La chiave che dice "questa sequenza l'abbiamo gia' vista".
 *
 * Restituisce un'impronta corta e stabile: la sequenza intera come testo
 * sarebbe troppo lunga per un indice unico, e senza indice unico la stessa
 * procedura vista dieci volte diventerebbe dieci righe.
 */
export function chiaveProcedura(steps: ShadowStep[]): string {
  const testo = steps.map(improntaPasso).join(">")
  // Somma di controllo deterministica (FNV-1a a 64 bit, in due metà da 32):
  // non serve robustezza crittografica, serve che la stessa sequenza dia sempre
  // la stessa chiave, anche fra processi diversi.
  let h1 = 0x811c9dc5
  let h2 = 0x01000193
  for (let i = 0; i < testo.length; i++) {
    const c = testo.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0
    h2 = Math.imul(h2 + c, 0x85ebca6b) >>> 0
  }
  return h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0")
}

/**
 * Quanto rischia questa procedura, calcolato dai passi e non deciso a mano.
 *
 * - alto:  tocca soldi o cancellazioni (vedi PAROLE_RISCHIO_ALTO)
 * - medio: scrive qualcosa nel PMS (compila, scegli, conferma)
 * - basso: si limita a guardare (naviga, clicca)
 */
export function classificaRischio(steps: ShadowStep[]): Risk {
  const testo = steps
    .map((s) => `${normalizzaDomanda(s.targetLabel ?? "")} ${normalizzaDomanda(s.urlPath ?? "")}`)
    .join(" ")

  if (PAROLE_RISCHIO_ALTO.some((p) => testo.includes(p))) return "alto"

  // Un campo di tipo importo e' denaro anche se l'etichetta non lo dice.
  if (steps.some((s) => s.valueKind === "money")) return "alto"

  const scrive = steps.some((s) => s.action === "fill" || s.action === "select" || s.action === "submit")
  return scrive ? "medio" : "basso"
}

/**
 * Un nome leggibile per la procedura, proposto dai passi osservati.
 *
 * E' una proposta: una persona lo puo' correggere. Meglio "Conferma
 * prenotazione - 4 passi" che una riga senza nome, che nessuno andrebbe a
 * leggere.
 */
export function proponiTitolo(steps: ShadowStep[]): string {
  const conclusivo = [...steps].reverse().find((s) => s.action === "submit" || s.action === "click")
  const etichetta = conclusivo?.targetLabel?.trim()
  const percorso = steps.find((s) => s.urlPath)?.urlPath?.replace(/^\//, "")
  const base = etichetta || percorso || "Procedura nel PMS"
  return `${base} — ${steps.length} ${steps.length === 1 ? "passo" : "passi"}`
}

export interface DecisioneAutonomia {
  occorrenze: number
  soglia: number
  rischio: Risk
  /** Lo stato attuale della riga, se esiste gia'. */
  attuale?: ProcedureStatus
}

/**
 * Decide se una procedura puo' agire da sola.
 *
 * Le due regole che non si scavalcano:
 *
 * 1. Una decisione umana non si annulla da sola. Se una persona ha bloccato la
 *    procedura, vederla ripetere altre venti volte non la sblocca: sarebbe il
 *    sistema che scavalca chi lo comanda.
 * 2. Il rischio alto non si guadagna l'autonomia con la ripetizione. Puo' solo
 *    diventare una proposta da approvare. E se il rischio si alza DOPO (il PMS
 *    cambia, la stessa sequenza inizia a toccare un importo) una procedura che
 *    era autonoma torna a chiedere: la sicurezza vince sull'abitudine.
 */
export function decidiStato(input: DecisioneAutonomia): ProcedureStatus {
  const { occorrenze, soglia, rischio, attuale } = input

  if (attuale === "bloccata") return "bloccata"

  if (rischio === "alto") {
    // Anche se era gia' autonoma: da qui in poi chiede.
    return occorrenze >= soglia || attuale === "autonoma" ? "proposta" : "osservata"
  }

  // Una persona l'aveva sbloccata: resta autonoma.
  if (attuale === "autonoma") return "autonoma"

  if (occorrenze < soglia) return "osservata"

  // Sotto la soglia non arriva qui. Il rischio basso matura da solo, il medio
  // aspetta un consenso una volta sola (poi resta autonoma per la riga sopra).
  return rischio === "basso" ? "autonoma" : "proposta"
}
