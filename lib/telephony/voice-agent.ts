import "server-only"
import { generateReply, type ConversationTurn } from "@/lib/ai/generate"
import { getKnowledgeBases } from "@/lib/ai/knowledge-bases"
import {
  datiNotiDaAnagrafica,
  trovaAnagraficaPerEmail,
  trovaAnagraficaPerNumero,
  type AnagraficaTrovata,
} from "@/lib/crm/contact-identity"
import { contactFullName, extractContactDetails, mergeHandoffContacts, type HandoffContact } from "@/lib/ai/handoff-utils"
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
  "Vai subito al punto: evita preamboli, riepiloghi e ripetizioni. Di norma usa 1-2 frasi; puoi arrivare a 3 se dopo la risposta fai una sola domanda di qualificazione.",
  "Se il chiamante fa PIU' DOMANDE nello stesso turno, rispondi a TUTTE le parti prima di fare eventuali domande tue. Non scegliere solo l'ultima o solo quella piu' semplice.",
  "Non leggere URL, simboli, elenchi in markdown o riferimenti alle fonti.",
  "Non inventare dati. Quando una risposta non e' sicura, lascia intervenire l'operatore.",
].join(" ")

const PROSPECT_QUALIFICATION_RULES = [
  "PERCORSO COMMERCIALE: la priorita' e' rispondere bene alla domanda del prospect; solo DOPO puoi raccogliere un dato utile.",
  "Durante la conversazione cerca con naturalezza di ottenere nome e cognome e, se possibile, un'email di lavoro. Chiedi UNA sola cosa per turno e solo se manca davvero.",
  "Se mancano nome e cognome, dopo aver risposto puoi chiedere: 'Per non farle ripetere tutto al commerciale, mi dice nome e cognome?'.",
  "Se nome e cognome sono gia' noti ma manca l'email, puoi chiedere in modo facoltativo: 'Se vuole, mi lascia anche un'email di lavoro? Cosi' il team puo' ricontattarla con i dettagli senza farle ripetere tutto.'.",
  "Non chiedere MAI il numero di telefono quando il numero del chiamante e' gia' disponibile dal centralino.",
  "Non chiedere dati gia' pronunciati nella conversazione. Se il chiamante rifiuta o evita una domanda personale, non insistere e continua ad aiutarlo normalmente.",
  "Non usare scuse false e non promettere invii o ricontatti gia' avvenuti: spiega soltanto il motivo reale per cui il dato puo' essere utile.",
].join(" ")

type PublicHotelProfitPlan = {
  name?: unknown
  price_monthly?: unknown
  price_yearly?: unknown
  currency?: unknown
  trial_days?: unknown
  is_free?: unknown
}

function digits(value: string | undefined): string | null {
  const normalized = value?.replace(/\D/g, "") ?? ""
  return normalized.length >= 6 ? normalized : null
}

function amount(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""))
  return Number.isFinite(parsed) ? parsed : null
}

function euro(value: number): string {
  return new Intl.NumberFormat("it-IT", { maximumFractionDigits: 0 }).format(value) + " euro"
}

/**
 * HotelProfitAI gestisce prezzi e piani nel proprio database. La base 4BID puo'
 * contenere una pagina indicizzata qualche ora prima: per la voce commerciale
 * leggiamo quindi la stessa fonte pubblica machine-readable usata dal sito.
 * Un guasto del sito non deve mai bloccare la telefonata: in quel caso si torna
 * alla sola knowledge base e il modello non deve inventare il prezzo.
 */
async function loadLiveCommercialFacts(productKey: VoiceProductKey | undefined): Promise<string | null> {
  if (productKey !== "hotel-profit-ai") return null

  try {
    const response = await fetch("https://www.hotelprofitai.com/api/public/plans", {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: AbortSignal.timeout(2_500),
    })
    if (!response.ok) return null

    const body = (await response.json().catch(() => null)) as { plans?: PublicHotelProfitPlan[] } | null
    const plans = body && Array.isArray(body.plans) ? body.plans : []
    if (plans.length === 0) return null

    const labels = plans.flatMap((plan) => {
      const name = typeof plan.name === "string" ? plan.name.trim() : ""
      if (!name) return []
      const monthly = amount(plan.price_monthly)
      const yearly = amount(plan.price_yearly)
      const trialDays = amount(plan.trial_days)
      if (plan.is_free === true) {
        return [`${name}: gratuito${trialDays && trialDays > 0 ? ` per ${trialDays} giorni` : ""}`]
      }
      if (monthly === null) return []
      return [`${name}: ${euro(monthly)} al mese${yearly && yearly > 0 ? ` oppure ${euro(yearly)} all'anno` : ""}`]
    })
    if (labels.length === 0) return null

    return [
      "DATI COMMERCIALI LIVE HOTELPROFITAI, AUTORIZZATI E AGGIORNATI:",
      "HotelProfitAI e' una piattaforma di controllo di gestione per strutture ricettive: aiuta a leggere ricavi e costi, budget, marginalita', forecast e insight AI per capire dove si guadagna, dove si perde e prendere decisioni economiche piu' rapidamente.",
      labels.join("; ") + ".",
      "Questi prezzi prevalgono su eventuali vecchie informazioni che dicano 'prezzo su richiesta'. Se il cliente chiede quanto costa HotelProfitAI, cita i piani pertinenti e aggiungi sempre una brevissima frase su a cosa serve HotelProfitAI, anche se la domanda ricevuta dal call-flow contiene soltanto la parte sul prezzo.",
    ].join(" ")
  } catch {
    return null
  }
}

function usefulEmail(value?: string | null): string | null {
  const email = value?.trim() ?? ""
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null
}

function capturedFromConversation(history: ConversationTurn[], question: string, modelContact: HandoffContact): HandoffContact {
  const fromHistory = history
    .filter((turn) => turn.role === "user")
    .map((turn) => extractContactDetails(turn.content))
  return mergeHandoffContacts(...fromHistory, extractContactDetails(question), modelContact)
}

type ProspectCaptureResult = {
  contactId: string | null
  nameCaptured: boolean
  emailCaptured: boolean
}

/**
 * Trasforma i dati pronunciati volontariamente al telefono in una scheda CRM
 * utile al commerciale. Non sovrascrive mai nome/email/telefono gia' curati da
 * una persona e non abilita alcun consenso marketing.
 */
async function persistProspectContact(input: {
  propertyId: string
  callerNumber: string | null
  callerNumberRaw?: string
  existing: AnagraficaTrovata | null
  captured: HandoffContact
  productKey?: VoiceProductKey
}): Promise<ProspectCaptureResult> {
  const supabase = createServiceClient()
  const fullName = contactFullName(input.captured)?.trim() || null
  const email = usefulEmail(input.captured.email)
  const phone = input.callerNumberRaw?.trim() || input.callerNumber

  let target = input.existing
  if (!target && email) target = await trovaAnagraficaPerEmail(supabase, input.propertyId, email)

  if (target) {
    const update: Record<string, unknown> = {}
    if (!target.name?.trim() && fullName) update.name = fullName
    if (!target.email?.trim() && email) update.email = email
    if (!target.phone?.trim() && phone) update.phone = phone

    if (Object.keys(update).length > 0) {
      update.updated_at = new Date().toISOString()
      const { error } = await supabase
        .from("contacts")
        .update(update)
        .eq("id", target.id)
        .eq("property_id", input.propertyId)
      if (error) console.error("[3cx-voice] prospect contact update failed", { message: error.message })
    }

    return {
      contactId: target.id,
      nameCaptured: Boolean(fullName),
      emailCaptured: Boolean(email),
    }
  }

  // Il solo numero chiamante non basta a creare rumore nel CRM: apriamo una
  // scheda quando il prospect ci ha dato almeno nome/cognome oppure email.
  if (!fullName && !email) return { contactId: null, nameCaptured: false, emailCaptured: false }

  const { data, error } = await supabase
    .from("contacts")
    .insert({
      property_id: input.propertyId,
      name: fullName,
      email,
      phone: phone || null,
      source: "phone",
      tags: ["prospect", "3cx", ...(input.productKey ? [input.productKey] : [])],
      notes: input.productKey ? `Prospect telefonico interessato a ${input.productKey}.` : "Prospect telefonico 3CX.",
    })
    .select("id")
    .single()

  if (error) {
    // Un altro turno puo' avere creato la stessa email fra lookup e insert: la
    // telefonata non deve fallire per un problema di deduplica CRM.
    console.error("[3cx-voice] prospect contact insert failed", { message: error.message })
    return { contactId: null, nameCaptured: Boolean(fullName), emailCaptured: Boolean(email) }
  }

  return { contactId: data?.id ?? null, nameCaptured: Boolean(fullName), emailCaptured: Boolean(email) }
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
  const supabase = createServiceClient()
  const [contact, commercialFacts] = await Promise.all([
    callerNumber ? trovaAnagraficaPerNumero(supabase, input.propertyId, callerNumber) : Promise.resolve(null),
    loadLiveCommercialFacts(input.productKey),
  ])
  const datiNoti = datiNotiDaAnagrafica(contact, callerNumber, null)
  const personaRules = [
    base.persona?.trim(),
    VOICE_PERSONA_RULES,
    input.crmToolKey === "caller_lookup" ? PROSPECT_QUALIFICATION_RULES : null,
    commercialFacts,
  ]
    .filter(Boolean)
    .join("\n")

  const result = await generateReply(
    {
      baseIds: usableBases.map((candidate) => candidate.id),
      persona: personaRules,
      language: base.language,
      confidenceThreshold: base.confidence_threshold,
      datiNoti,
    },
    input.question,
    input.history.slice(-4),
  )

  let prospectCapture: ProspectCaptureResult | null = null
  if (input.crmToolKey === "caller_lookup") {
    const captured = capturedFromConversation(input.history, input.question, result.contact)
    try {
      prospectCapture = await persistProspectContact({
        propertyId: input.propertyId,
        callerNumber,
        callerNumberRaw: input.callerNumber,
        existing: contact,
        captured,
        productKey: input.productKey,
      })
    } catch (error) {
      console.error("[3cx-voice] prospect qualification persistence failed", {
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }

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
            matched: input.crmToolKey === "customer_code_lookup" || Boolean(contact) || Boolean(prospectCapture?.contactId),
            ...(input.crmToolKey === "caller_lookup"
              ? {
                  captured_name: prospectCapture?.nameCaptured ?? false,
                  captured_email: prospectCapture?.emailCaptured ?? false,
                  contact_id: prospectCapture?.contactId ?? contact?.id ?? null,
                }
              : {}),
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