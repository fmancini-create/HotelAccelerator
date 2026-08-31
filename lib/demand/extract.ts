import "server-only"
import { generateObject } from "ai"
import { z } from "zod"
import { CHAT_MODEL } from "@/lib/ai/config"
import { isMachineSender } from "@/lib/crm/machine-sender"
import type { TrackingField } from "./fields"

/**
 * Livello 3: il testo libero, letto dal modello con i campi del reparto.
 *
 * Lo schema non è scritto a mano: si costruisce dai campi che l'admin ha
 * configurato sul gruppo. Un reparto che traccia "coperti" e uno che traccia
 * "notti" usano lo stesso codice, e aggiungere un campo non richiede una
 * modifica qui.
 */

/** Prezzi del gateway per il modello in uso, in dollari per milione di token. */
const PRICE_IN_PER_M = 0.75
const PRICE_OUT_PER_M = 4.5

export function costMicroUsd(tokensIn: number, tokensOut: number): number {
  // Milionesimi di dollaro: in centesimi ogni singola estrazione sarebbe 0 e
  // il totale non tornerebbe mai.
  const usd = (tokensIn / 1_000_000) * PRICE_IN_PER_M + (tokensOut / 1_000_000) * PRICE_OUT_PER_M
  return Math.round(usd * 1_000_000)
}

/**
 * Esclude ciò che non è corrispondenza con una persona.
 *
 * Riusa `isMachineSender`, che è la fonte unica del progetto e guarda SOLO la
 * parte locale dell'indirizzo. Non viene aggiunta una lista di domini: il
 * modulo condiviso documenta che le euristiche per dominio hanno riclassificato
 * 91 contatti veri su 832 come macchine. Qui il danno sarebbe la domanda di un
 * ospite scartata in silenzio, e sui numeri misurati (1.782 escluse, 3.769
 * analizzate) il solo riconoscimento condiviso costa $4,92 di prima passata:
 * non c'è nulla da guadagnare stringendo di più.
 */
export function shouldSkipAsNoise(contactEmail: string | null | undefined): boolean {
  return isMachineSender(contactEmail)
}

function fieldSchema(f: TrackingField): z.ZodTypeAny {
  const describe = (s: z.ZodTypeAny) => (f.hint ? s.describe(f.hint) : s)
  switch (f.type) {
    case "date":
      return describe(
        z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/, "Formato YYYY-MM-DD")
          .nullable(),
      )
    case "number":
      return describe(z.number().nullable())
    case "boolean":
      return describe(z.boolean().nullable())
    case "enum":
      // Un enum senza opzioni non è un enum: degrada a testo invece di
      // far fallire l'intera estrazione per una configurazione incompleta.
      return f.options && f.options.length > 0
        ? describe(z.enum(f.options as [string, ...string[]]).nullable())
        : describe(z.string().nullable())
    default:
      return describe(z.string().nullable())
  }
}

export function buildExtractionSchema(fields: TrackingField[]) {
  const shape: Record<string, z.ZodTypeAny> = {}
  for (const f of fields) shape[f.key] = fieldSchema(f)
  return z.object({
    /**
     * Prima domanda, non ultima: se la conversazione non contiene domanda,
     * il modello deve poterlo dire invece di riempire i campi per obbedienza.
     * Il "niente" registrato evita anche di rianalizzare la stessa email a
     * ogni passata.
     */
    contiene_domanda: z
      .boolean()
      .describe(
        "true SOLO se il cliente esprime una richiesta, un interesse o una prenotazione pertinente al reparto. false per fatture, PEC, offerte di fornitori, comunicazioni interne, spam.",
      ),
    dati: z.object(shape),
    confidenza: z
      .number()
      .min(0)
      .max(1)
      .describe("Quanto sei sicuro dei dati estratti: 1 se scritti esplicitamente, meno se dedotti."),
  })
}

export interface ExtractionInput {
  subject: string | null
  transcript: string
  fields: TrackingField[]
  /** Contesto del reparto, per disambiguare cosa è pertinente. */
  groupName: string
  presetLabel: string
  /** Oggi, per risolvere "il prossimo weekend" in una data vera. */
  today: string
  /** Permette al cron di interrompere la chiamata modello prima del timeout Vercel. */
  abortSignal?: AbortSignal
}

export interface ExtractionOutput {
  containsDemand: boolean
  data: Record<string, unknown>
  confidence: number
  tokensIn: number
  tokensOut: number
}

export async function extractWithModel(input: ExtractionInput): Promise<ExtractionOutput> {
  const schema = buildExtractionSchema(input.fields)

  const system = [
    `Sei l'analista del reparto "${input.groupName}" di una struttura ricettiva.`,
    `Ambito: ${input.presetLabel}.`,
    `Oggi è ${input.today}: usalo per trasformare riferimenti relativi ("il prossimo weekend", "ad agosto") in date vere.`,
    "Estrai solo ciò che è scritto o deducibile con certezza. Se un dato non c'è, il valore è null.",
    "Non inventare date, numeri o nomi: un dato inventato è peggio di un dato mancante.",
    "Le date sono sempre nel formato YYYY-MM-DD.",
  ].join("\n")

  const { object, usage } = await generateObject({
    model: CHAT_MODEL,
    schema,
    system,
    prompt: `Oggetto: ${input.subject ?? "(nessun oggetto)"}\n\nConversazione:\n${input.transcript}`,
    abortSignal: input.abortSignal,
  })

  return {
    containsDemand: object.contiene_domanda,
    data: object.dati as Record<string, unknown>,
    confidence: object.confidenza,
    tokensIn: usage?.inputTokens ?? 0,
    tokensOut: usage?.outputTokens ?? 0,
  }
}
