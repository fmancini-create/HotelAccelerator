import type { GenerateReplyResult } from "@/lib/ai/generate"
import type { VoiceProduct } from "@/lib/telephony/voice-products"

export type VoiceTransferReason = "none" | "staff_requested" | "not_grounded" | "no_answer" | "service_error"

export interface VoiceResponseDecision {
  speech: string
  confidence: number
  grounded: boolean
  sources: Array<{ id: string; title: string }>
  transfer: {
    required: boolean
    destination: string
    reason: VoiceTransferReason
  }
}

const DEFAULT_HANDOFF_SPEECH = "Non ho una risposta sufficientemente sicura. La metto in contatto con un operatore."

/** Toglie sintassi e URL che, letti da una voce sintetica, diventano incomprensibili. */
export function sanitizeVoiceSpeech(value: string): string {
  return value
    .replace(/\[([^\]]+)]\(https?:\/\/[^)]+\)/gi, "$1")
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/[*_`#>]+/g, "")
    .replace(/\s+/g, " ")
    .trim()
}

function handoffSpeech(fallbackMessage: string | null | undefined): string {
  const configured = sanitizeVoiceSpeech(fallbackMessage ?? "")
  return configured || DEFAULT_HANDOFF_SPEECH
}

export function buildVoiceResponse(
  result: GenerateReplyResult,
  fallbackDestination: string,
  fallbackMessage?: string | null,
): VoiceResponseDecision {
  let reason: VoiceTransferReason = "none"
  if (result.staffRequested) reason = "staff_requested"
  else if (!result.answer) reason = "no_answer"
  else if (!result.grounded && !result.greetingOnly) reason = "not_grounded"

  const shouldTransfer = reason !== "none"
  const generatedSpeech = sanitizeVoiceSpeech(result.answer ?? "")
  const speech = shouldTransfer ? handoffSpeech(fallbackMessage) : generatedSpeech || handoffSpeech(fallbackMessage)
  const sourcesById = new Map<string, string>()
  for (const chunk of result.usedChunks) {
    if (!sourcesById.has(chunk.source_id)) sourcesById.set(chunk.source_id, chunk.source_title?.trim() ?? "")
  }

  return {
    speech,
    confidence: result.confidence,
    grounded: result.grounded,
    sources: [...sourcesById].map(([id, title]) => ({ id, title })),
    transfer: {
      required: shouldTransfer || !generatedSpeech,
      destination: fallbackDestination,
      reason: shouldTransfer ? reason : generatedSpeech ? "none" : "no_answer",
    },
  }
}

export function serviceErrorVoiceResponse(
  product: VoiceProduct,
  destination: string,
  diagnosticCode: string,
) {
  return {
    ok: false as const,
    product: { key: product.key, label: product.label },
    speech: DEFAULT_HANDOFF_SPEECH,
    confidence: 0,
    grounded: false,
    sources: [] as Array<{ id: string; title: string }>,
    transfer: { required: true as const, destination, reason: "service_error" as const },
    diagnostic_code: diagnosticCode,
  }
}
