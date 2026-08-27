import "server-only"
import { generateReply, type ConversationTurn } from "@/lib/ai/generate"
import { getKnowledgeBases } from "@/lib/ai/knowledge-bases"
import { trovaAnagraficaPerNumero } from "@/lib/crm/contact-identity"
import { createServiceClient } from "@/lib/supabase/server"
import {
  getVoiceProduct,
  resolveSharedVoiceKnowledgeBases,
  resolveVoiceKnowledgeBase,
  VOICE_FALLBACK_EXTENSION,
  type VoiceProductKey,
} from "@/lib/telephony/voice-products"
import { buildVoiceResponse, serviceErrorVoiceResponse } from "@/lib/telephony/voice-response"

export interface VoiceQuestionInput {
  propertyId: string
  /** Agente generico: base gia' scelta nell'URL configurato in 3CX. */
  knowledgeBaseId?: string
  /** Configurazione IVR: primaria e basi aggiuntive, tutte gia' autorizzate. */
  knowledgeBaseIds?: string[]
  primaryKnowledgeBaseId?: string
  /** Hub 4 BID: prodotto scelto dal chiamante, risolto solo nel tenant autorizzato. */
  productKey?: VoiceProductKey
  question: string
  history: ConversationTurn[]
  callerNumber?: string
  /** Interno scelto dal flusso chiamante quando serve una persona. */
  fallbackDestination?: string
  agentLabel?: string
  crmToolKey?: "customer_code_lookup" | "caller_lookup"
}

const VOICE_PERSONA_RULES = [
  "Sei al telefono: usa frasi brevi, naturali e facilmente comprensibili all'ascolto.",
  "Rispondi di norma in 1-2 frasi e vai subito al punto: evita preamboli, riepiloghi e ripetizioni.",
  "Non leggere URL, simboli, elenchi in markdown o riferimenti alle fonti.",
  "Non inventare dati. Quando una risposta non e' sicura, lascia intervenire l'operatore.",
].join(" ")

function digits(value: string | undefined): string | null {
  const normalized = value?.replace(/\D/g, "") ?? ""
  return normalized.length >= 6 ? normalized : null
}

export async function answerVoiceQuestion(input: VoiceQuestionInput) {
  const fallbackDestination = input.fallbackDestination?.trim() || VOICE_FALLBACK_EXTENSION
  const bases = await getKnowledgeBases(input.propertyId)

  let base = input.knowledgeBaseId ? bases.find((candidate) => candidate.id === input.knowledgeBaseId) : undefined
  let selectedBases = base ? [base] : []
  let product = null as ReturnType<typeof getVoiceProduct>
  let matchedBy: "marker" | "name" | null = null
  let agent = { key: input.knowledgeBaseId ?? "", label: "Assistente telefonico" }

  if (input.productKey) {
    product = getVoiceProduct(input.productKey)
    if (!product) throw new Error("Prodotto vocale non valido")
    const explicitlySelected = input.primaryKnowledgeBaseId?.trim()
    if (explicitlySelected) {
      base = bases.find((candidate) => candidate.id === explicitlySelected)
      const requestedIds = [...new Set([explicitlySelected, ...(input.knowledgeBaseIds ?? [])])]
      selectedBases = requestedIds
        .map((id) => bases.find((candidate) => candidate.id === id))
        .filter((candidate): candidate is (typeof bases)[number] => Boolean(candidate))
      if (!base || selectedBases.length !== requestedIds.length) {
        return serviceErrorVoiceResponse(
          { key: product.key, label: input.agentLabel?.trim() || product.label },
          fallbackDestination,
          "knowledge_base_invalid_reference",
        )
      }
    } else {
      const resolution = resolveVoiceKnowledgeBase(product, bases)
      if (!resolution.ok) {
        return serviceErrorVoiceResponse(
          { key: product.key, label: input.agentLabel?.trim() || product.label },
          fallbackDestination,
          resolution.reason === "ambiguous" ? "knowledge_base_ambiguous" : "knowledge_base_not_found",
        )
      }
      base = resolution.base
      matchedBy = resolution.matchedBy
      selectedBases = [resolution.base, ...resolveSharedVoiceKnowledgeBases(product, bases)]
    }
    agent = { key: product.key, label: input.agentLabel?.trim() || product.label }
  }

  if (!base) return serviceErrorVoiceResponse(agent, fallbackDestination, "knowledge_base_not_found")
  const primaryBase = base
  if (!input.productKey) agent = { key: input.knowledgeBaseId ?? base.id, label: base.name ?? "Assistente telefonico" }
  if (base.source_count < 1) return serviceErrorVoiceResponse(agent, fallbackDestination, "knowledge_base_empty")
  const usableBases = selectedBases.filter((candidate) => candidate.source_count > 0)
  if (usableBases.length < 1) return serviceErrorVoiceResponse(agent, fallbackDestination, "knowledge_base_empty")

  const callerNumber = digits(input.callerNumber)
  const contact = callerNumber
    ? await trovaAnagraficaPerNumero(createServiceClient(), input.propertyId, callerNumber)
    : null
  const result = await generateReply(
    {
      baseIds: usableBases.map((candidate) => candidate.id),
      persona: [base.persona?.trim(), VOICE_PERSONA_RULES].filter(Boolean).join("\n"),
      language: base.language,
      confidenceThreshold: base.confidence_threshold,
      datiNoti: { nome: null, email: null, numero: null, daAnagraficaEsistente: Boolean(contact) },
    },
    input.question,
    input.history.slice(-4),
  )
  const decision = buildVoiceResponse(result, fallbackDestination, primaryBase.fallback_message)

  return {
    ok: true as const,
    agent,
    ...(product ? { product: { key: product.key, label: product.label } } : {}),
    knowledge_base: { id: primaryBase.id, name: primaryBase.name, ...(matchedBy ? { matched_by: matchedBy } : {}) },
    shared_knowledge_bases: usableBases
      .filter((candidate) => candidate.id !== primaryBase.id)
      .map((candidate) => ({ id: candidate.id, name: candidate.name })),
    ...(input.crmToolKey
      ? {
          crm_tool: {
            key: input.crmToolKey,
            executed: input.crmToolKey === "customer_code_lookup" || Boolean(callerNumber),
            matched: input.crmToolKey === "customer_code_lookup" || Boolean(contact),
          },
        }
      : {}),
    speech: decision.speech,
    confidence: decision.confidence,
    grounded: decision.grounded,
    sources: decision.sources,
    transfer: decision.transfer,
    diagnostic_code: decision.transfer.required ? decision.transfer.reason : null,
  }
}
