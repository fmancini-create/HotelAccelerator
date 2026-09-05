/**
 * Il cervello dell'apprendimento per osservazione dentro il PMS.
 *
 * Qui non si parla con nessun database e non si chiama nessuna API: sono
 * funzioni pure, cosi' si possono provare davvero. Chi le usa (la rotta di
 * ingresso degli eventi) mette le righe a posto.
 */

import { normalizzaDomanda } from "@/lib/ai/gaps"

export type ShadowAction = "navigate" | "click" | "fill" | "select" | "submit" | "keypress"
export type ValueKind = "empty" | "text" | "number" | "date" | "money" | "email" | "phone" | "secret"
export type Risk = "basso" | "medio" | "alto"
export type ProcedureStatus = "osservata" | "proposta" | "autonoma" | "bloccata"

export interface ShadowStep {
  action: ShadowAction
  targetRole?: string | null
  targetLabel?: string | null
  urlPath?: string | null
  valueKind?: ValueKind | null
}

/**
 * Soglia di evidenza: raggiungerla significa che la sequenza e' ricorrente, non
 * che sia autorizzata ad agire. L'autorizzazione resta una decisione umana.
 */
export const SOGLIA_AUTONOMIA_PREDEFINITA = 5

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

function improntaPasso(step: ShadowStep): string {
  const ruolo = normalizzaDomanda(step.targetRole ?? "")
  const etichetta = normalizzaDomanda(step.targetLabel ?? "")
  const percorso = (step.urlPath ?? "").toLowerCase().replace(/\/+$/, "")
  return [step.action, ruolo, etichetta, percorso, step.valueKind ?? ""].join("|")
}

export function chiaveProcedura(steps: ShadowStep[]): string {
  const testo = steps.map(improntaPasso).join(">")
  let h1 = 0x811c9dc5
  let h2 = 0x01000193
  for (let i = 0; i < testo.length; i++) {
    const c = testo.charCodeAt(i)
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0
    h2 = Math.imul(h2 + c, 0x85ebca6b) >>> 0
  }
  return h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0")
}

export function classificaRischio(steps: ShadowStep[]): Risk {
  const testo = steps
    .map((s) => `${normalizzaDomanda(s.targetLabel ?? "")} ${normalizzaDomanda(s.urlPath ?? "")}`)
    .join(" ")

  if (PAROLE_RISCHIO_ALTO.some((p) => testo.includes(p))) return "alto"
  if (steps.some((s) => s.valueKind === "money")) return "alto"

  const scrive = steps.some((s) => s.action === "fill" || s.action === "select" || s.action === "submit")
  return scrive ? "medio" : "basso"
}

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
  attuale?: ProcedureStatus
}

/**
 * La ripetizione rende una procedura una PROPOSTA, non un'autorizzazione.
 *
 * Prima di questa regola una sequenza a rischio basso diventava autonoma dopo
 * cinque osservazioni, cioe' l'IA poteva guadagnarsi da sola il diritto di
 * agire. La nuova regia tenant richiede invece che apprendimento e autonomia
 * siano due decisioni diverse: qui si accumula evidenza; l'admin approva cio'
 * che e' stato imparato e un eventuale permesso operativo resta esplicito.
 *
 * Gli stati `autonoma` gia' esistenti vengono preservati per compatibilita', ma
 * se il rischio sale ad alto tornano immediatamente a `proposta`.
 */
export function decidiStato(input: DecisioneAutonomia): ProcedureStatus {
  const { occorrenze, soglia, rischio, attuale } = input

  if (attuale === "bloccata") return "bloccata"

  if (rischio === "alto") {
    return occorrenze >= soglia || attuale === "autonoma" ? "proposta" : "osservata"
  }

  if (attuale === "autonoma") return "autonoma"
  if (occorrenze < soglia) return "osservata"

  return "proposta"
}
