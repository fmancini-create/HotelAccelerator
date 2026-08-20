import "server-only"
import { generateReply, type ConversationTurn } from "@/lib/ai/generate"
import { getKnowledgeBases } from "@/lib/ai/knowledge-bases"
import { trovaAnagraficaPerNumero } from "@/lib/crm/contact-identity"
import { createServiceClient } from "@/lib/supabase/server"
import { VOICE_FALLBACK_EXTENSION } from "@/lib/telephony/voice-products"
import { buildVoiceResponse, serviceErrorVoiceResponse } from "@/lib/telephony/voice-response"

export interface VoiceQuestionInput {
  propertyId: string
  knowledgeBaseId: string
  question: string
  history: ConversationTurn[]
  callerNumber?: string
}

const VOICE_PERSONA_RULES = [
  "Sei al telefono: usa frasi brevi, naturali e facilmente comprensibili all'ascolto.",
  "Non leggere URL, simboli, elenchi in markdown o riferimenti alle fonti.",
  "Non inventare dati. Quando una risposta non e' sicura, lascia intervenire l'operatore.",
].join(" ")

function digits(value: string | undefined): string | null {
  const normalized = value?.replace(/\D/g, "") ?? ""
  return normalized.length >= 6 ? normalized : null
}

export async function answerVoiceQuestion(input: VoiceQuestionInput) {
  const bases = await getKnowledgeBases(input.propertyId)
  const base = bases.find((candidate) => candidate.id === input.knowledgeBaseId)
  const agent = { key: input.knowledgeBaseId, label: base?.name ?? "Assistente telefonico" }

  if (!base) {
    return serviceErrorVoiceResponse(agent, VOICE_FALLBACK_EXTENSION, "knowledge_base_not_found")
  }

  if (base.source_count < 1) {
    return serviceErrorVoiceResponse(agent, VOICE_FALLBACK_EXTENSION, "knowledge_base_empty")
  }

  const callerNumber = digits(input.callerNumber)
  const contact = callerNumber
    ? await trovaAnagraficaPerNumero(createServiceClient(), input.propertyId, callerNumber)
    : null

  const result = await generateReply(
    {
      baseIds: [base.id],
      persona: [base.persona?.trim(), VOICE_PERSONA_RULES].filter(Boolean).join("\n"),
      language: base.language,
      confidenceThreshold: base.confidence_threshold,
      datiNoti: {
        // Il numero viene confrontato col CRM soltanto dentro HotelAccelerator.
        // Nome, email e telefono non devono uscire verso il provider AI: per
        // il flusso vocale basta sapere se il chiamante e' gia' in anagrafica.
        nome: null,
        email: null,
        numero: null,
        daAnagraficaEsistente: Boolean(contact),
      },
    },
    input.question,
    input.history,
  )

  const decision = buildVoiceResponse(result, VOICE_FALLBACK_EXTENSION, base.fallback_message)

  return {
    ok: true as const,
    agent,
    knowledge_base: { id: base.id, name: base.name },
    speech: decision.speech,
    confidence: decision.confidence,
    grounded: decision.grounded,
    sources: decision.sources,
    transfer: decision.transfer,
    diagnostic_code: decision.transfer.required ? decision.transfer.reason : null,
  }
}
