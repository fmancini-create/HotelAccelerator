import "server-only"

import type { ConversationTurn } from "@/lib/ai/generate"
import { extractContactDetails, mergeHandoffContacts, splitFullName } from "@/lib/ai/handoff-utils"
import { trovaAnagraficaPerNumero } from "@/lib/crm/contact-identity"
import { createServiceClient } from "@/lib/supabase/server"

export type ProspectQualificationStage = "name" | "email" | null

export interface ProspectQualificationDecision {
  prompt: string | null
  stage: ProspectQualificationStage
  nameKnown: boolean
  emailKnown: boolean
}

const NAME_PROMPT = "Per non farle ripetere tutto al commerciale, mi dice nome e cognome?"
const EMAIL_PROMPT = "Grazie. Se vuole, mi lascia anche un'email di lavoro? Così il team può ricontattarla con i dettagli senza farle ripetere tutto."

function meaningful(value: string | null | undefined): boolean {
  return Boolean(value?.trim())
}

function hasFullName(value: string | null | undefined): boolean {
  if (!meaningful(value)) return false
  const parts = String(value).trim().split(/\s+/).filter(Boolean)
  return parts.length >= 2
}

function assistantAskedName(text: string): boolean {
  return /(?:nome\s+e\s+cognome|mi\s+(?:dice|indica|lascia)\s+(?:il\s+)?(?:suo\s+)?nome|come\s+si\s+chiama)/i.test(text)
}

function assistantAskedEmail(text: string): boolean {
  return /(?:e-?mail|posta\s+elettronica)/i.test(text) && /(?:lascia|dice|indica|fornisce|recapito)/i.test(text)
}

function declinedAfterQuestion(history: ConversationTurn[], question: string, kind: "name" | "email"): boolean {
  const previousAssistant = [...history].reverse().find((turn) => turn.role === "assistant" && turn.content.trim())
  if (!previousAssistant) return false
  const asked = kind === "name" ? assistantAskedName(previousAssistant.content) : assistantAskedEmail(previousAssistant.content)
  if (!asked) return false
  return /^(?:no|no\s+grazie|preferisco\s+di\s+no|preferirei\s+di\s+no|non\s+(?:voglio|desidero|preferisco|posso))(?:[.!?\s].*)?$/i.test(question.trim())
}

/**
 * Decide il prossimo dato da chiedere in modo deterministico. Il modello puo'
 * ancora formulare spontaneamente una domanda, ma il flusso non dipende piu'
 * dalla probabilita' che lo faccia: dopo la risposta utile si chiede una sola
 * cosa per turno, senza ripetere dati gia' noti o una domanda rifiutata.
 */
export function decideProspectQualification(input: {
  existingName?: string | null
  existingEmail?: string | null
  history: ConversationTurn[]
  question: string
  currentSpeech: string
}): ProspectQualificationDecision {
  const userTurns = input.history
    .filter((turn) => turn.role === "user")
    .map((turn) => extractContactDetails(turn.content))
  const captured = mergeHandoffContacts(...userTurns, extractContactDetails(input.question))

  const existingName = splitFullName(input.existingName)
  const nameKnown = Boolean(
    (meaningful(captured.firstName) && meaningful(captured.lastName))
    || (meaningful(existingName.firstName) && meaningful(existingName.lastName))
    || hasFullName(input.existingName),
  )
  const emailKnown = meaningful(captured.email) || meaningful(input.existingEmail)

  const assistantTurns = input.history.filter((turn) => turn.role === "assistant").map((turn) => turn.content)
  const nameAlreadyAsked = assistantTurns.some(assistantAskedName) || assistantAskedName(input.currentSpeech)
  const emailAlreadyAsked = assistantTurns.some(assistantAskedEmail) || assistantAskedEmail(input.currentSpeech)

  if (!nameKnown && !nameAlreadyAsked && !declinedAfterQuestion(input.history, input.question, "name")) {
    return { prompt: NAME_PROMPT, stage: "name", nameKnown, emailKnown }
  }

  if (nameKnown && !emailKnown && !emailAlreadyAsked && !declinedAfterQuestion(input.history, input.question, "email")) {
    return { prompt: EMAIL_PROMPT, stage: "email", nameKnown, emailKnown }
  }

  return { prompt: null, stage: null, nameKnown, emailKnown }
}

function callerDigits(value: string | undefined): string | null {
  const digits = value?.replace(/\D/g, "") ?? ""
  return digits.length >= 6 ? digits : null
}

export async function resolveProspectQualification(input: {
  propertyId: string
  callerNumber?: string
  history: ConversationTurn[]
  question: string
  currentSpeech: string
}): Promise<ProspectQualificationDecision> {
  const digits = callerDigits(input.callerNumber)
  let existingName: string | null = null
  let existingEmail: string | null = null

  if (digits) {
    try {
      const contact = await trovaAnagraficaPerNumero(createServiceClient(), input.propertyId, digits)
      existingName = contact?.name ?? null
      existingEmail = contact?.email ?? null
    } catch (error) {
      // La qualifica non deve mai bloccare una risposta commerciale gia' pronta.
      console.error("[3cx-voice] prospect qualification lookup failed", {
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }

  return decideProspectQualification({
    existingName,
    existingEmail,
    history: input.history,
    question: input.question,
    currentSpeech: input.currentSpeech,
  })
}
