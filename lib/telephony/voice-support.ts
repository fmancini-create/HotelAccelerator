import { CUSTOMER_CODE_DIGITS } from "@/lib/telephony/customer-code"

export const CENTRAL_SUPPORT_SLUG = "4bid"
export const DEFAULT_SUPPORT_OPERATOR_EXTENSION = "200"

export type SupportAfterHoursMode = "plan_default" | "on_call" | "voicemail"
export type SupportHandoffAction = "none" | "transfer" | "record_message"

export interface SupportHandoff {
  action: SupportHandoffAction
  destination: string | null
  mode: Exclude<SupportAfterHoursMode, "plan_default"> | null
  speech: string | null
}

/**
 * Il piano definisce una politica iniziale; la colonna sul tenant permette a
 * commerciale/supporto di derogare senza ramificare i flow 3CX.
 */
export function resolveAfterHoursMode(plan: string | null | undefined, configured: string | null | undefined) {
  if (configured === "on_call" || configured === "voicemail") return configured
  return plan === "enterprise" ? "on_call" : "voicemail"
}

export function resolveSupportHandoff(input: {
  humanHelpRequired: boolean
  afterHours: boolean
  plan: string | null | undefined
  configuredMode: string | null | undefined
  configuredExtension: string | null | undefined
  operatorExtension?: string
}): SupportHandoff {
  if (!input.humanHelpRequired) {
    return { action: "none", destination: null, mode: null, speech: null }
  }

  const operatorExtension = input.operatorExtension?.trim() || DEFAULT_SUPPORT_OPERATOR_EXTENSION
  if (!input.afterHours) {
    return { action: "transfer", destination: operatorExtension, mode: null, speech: null }
  }

  const mode = resolveAfterHoursMode(input.plan, input.configuredMode)
  if (mode === "on_call") {
    return {
      action: "transfer",
      destination: input.configuredExtension?.trim() || operatorExtension,
      mode,
      speech: null,
    }
  }

  return {
    action: "record_message",
    destination: null,
    mode,
    speech: "Il supporto e' momentaneamente fuori orario. Lasci un messaggio dopo il segnale: un operatore lo prenderà in carico appena possibile.",
  }
}

export function invalidCustomerCodeSpeech() {
  return `Non riesco a verificare il codice cliente. Digiti di nuovo le ${CUSTOMER_CODE_DIGITS} cifre del codice 4 B.`
}
