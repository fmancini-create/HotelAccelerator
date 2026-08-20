import "server-only"
import { generateReply, type ConversationTurn } from "@/lib/ai/generate"
import { getKnowledgeBases } from "@/lib/ai/knowledge-bases"
import { trovaAnagraficaPerNumero } from "@/lib/crm/contact-identity"
import { createServiceClient } from "@/lib/supabase/server"
import {
  getVoiceProduct,
  resolveVoiceKnowledgeBase,
  VOICE_FALLBACK_EXTENSION,
  type VoiceProductKey,
} from "@/lib/telephony/voice-products"
import { buildVoiceResponse, serviceErrorVoiceResponse } from "@/lib/telephony/voice-response"

export interface VoiceQuestionInput {
  propertyId: string
  productKey: VoiceProductKey
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
  const product = getVoiceProduct(input.productKey)
  if (!product) throw new Error("Prodotto vocale non valido")

  const bases = await getKnowledgeBases(input.propertyId)
  const resolution = resolveVoiceKnowledgeBase(product, bases)

  if (!resolution.ok) {
    return serviceErrorVoiceResponse(
      product,
      VOICE_FALLBACK_EXTENSION,
      resolution.reason === "ambiguous" ? "knowledge_base_ambiguous" : "knowledge_base_not_found",
    )
  }

  const base = resolution.base
  if (base.source_count < 1) {
    return serviceErrorVoiceResponse(product, VOICE_FALLBACK_EXTENSION, "knowledge_base_empty")
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
    product: { key: product.key, label: product.label },
    knowledge_base: { id: base.id, name: base.name, matched_by: resolution.matchedBy },
    speech: decision.speech,
    confidence: decision.confidence,
    grounded: decision.grounded,
    sources: decision.sources,
    transfer: decision.transfer,
    diagnostic_code: decision.transfer.required ? decision.transfer.reason : null,
  }
}
