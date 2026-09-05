import { randomUUID } from "node:crypto"
import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { VOICE_PRODUCT_TO_SUITE_PRODUCT } from "@/lib/customer-codes/product"
import { CUSTOMER_CODE_DIGITS, normalizeCustomerCode } from "@/lib/telephony/customer-code"
import { authenticateVoiceInbound } from "@/lib/telephony/inbound-auth"
import { answerVoiceQuestion } from "@/lib/telephony/voice-agent"
import { getVoiceProduct, VOICE_4BID_FALLBACK_EXTENSION } from "@/lib/telephony/voice-products"
import { takeVoiceRequest } from "@/lib/telephony/voice-rate-limit"
import { serviceErrorVoiceResponse } from "@/lib/telephony/voice-response"
import {
  getVoiceIvrRoute,
  getVoiceIvrSharedBaseIds,
  isMissingVoiceRoutingSchema,
} from "@/lib/telephony/voice-routing"
import { findVoiceSupportCustomer, isVoiceSupportHub } from "@/lib/telephony/voice-support-customer"
import { invalidCustomerCodeSpeech } from "@/lib/telephony/voice-support"
import { captureSharedPbxVoiceExchange, touchSharedPbxRouteHint } from "@/lib/telephony/shared-pbx-routing"
import { normalizeVoiceSupportAliases } from "@/lib/telephony/voice-request"
import { resolveProspectQualification } from "@/lib/telephony/prospect-qualification"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const requestSchema = z.object({
  question: z.string().trim().max(1_500).default(""),
  customer_code: z.union([z.string(), z.number().int()]).transform((value) => String(value)).optional(),
  caller_number: z.string().trim().max(40).optional(),
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().trim().min(1).max(1_000) })).max(8).default([]),
})

const NO_STORE = { "Cache-Control": "no-store, max-age=0" }
const CUSTOMER_CODE_INPUT = {
  digits: CUSTOMER_CODE_DIGITS,
  modes: ["dtmf", "speech"] as const,
  canonical_field: "customer_code",
}

async function readVoiceBody(request: NextRequest): Promise<unknown | null> {
  const text = await request.text()
  if (text.length > 16_000) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function codeRetryResponse(requestId: string, destination = VOICE_4BID_FALLBACK_EXTENSION) {
  return NextResponse.json(
    {
      ok: true,
      customer: { recognized: false },
      customer_code_input: CUSTOMER_CODE_INPUT,
      speech: invalidCustomerCodeSpeech(),
      handoff: { action: "retry_customer_code", destination: null, mode: null },
      transfer: { required: false, destination, reason: "none" },
      request_id: requestId,
    },
    { headers: NO_STORE },
  )
}

function conciseBeforeQualification(speech: string): string {
  const clean = speech.trim().replace(/\s+/g, " ")
  if (clean.length <= 320) return clean
  const sentences = clean.match(/[^.!?]+[.!?]?/g)?.map((part) => part.trim()).filter(Boolean) ?? []
  const firstTwo = sentences.slice(0, 2).join(" ")
  if (firstTwo && firstTwo.length <= 360) return firstTwo
  const clipped = clean.slice(0, 320)
  const lastSpace = clipped.lastIndexOf(" ")
  return `${clipped.slice(0, lastSpace > 220 ? lastSpace : 320).trim()}…`
}

/**
 * Informazioni commerciali 4BID. Se il PBX inoltra per errore le cifre della
 * licenza a questo endpoint, il backend le intercetta e passa in modalita'
 * cliente invece di ignorarle: il routing non dipende quindi dal nome del
 * campo DTMF usato nel call-flow 3CX.
 */
export async function POST(request: NextRequest) {
  const requestId = request.headers.get("x-request-id")?.slice(0, 100) || randomUUID()
  const auth = await authenticateVoiceInbound(request)
  if (!auth.ok) return NextResponse.json({ error: "Non autorizzato" }, { status: auth.status, headers: NO_STORE })

  try {
    if (!(await isVoiceSupportHub(auth.propertyId))) {
      return NextResponse.json({ error: "Canale telefono non disponibile" }, { status: 403, headers: NO_STORE })
    }
  } catch {
    return NextResponse.json({ error: "Errore interno" }, { status: 500, headers: NO_STORE })
  }

  const product = getVoiceProduct(request.nextUrl.searchParams.get("product"))
  if (!product) {
    return NextResponse.json({ error: "Prodotto vocale non valido", request_id: requestId }, { status: 400, headers: NO_STORE })
  }

  const raw = await readVoiceBody(request)
  const parsed = requestSchema.safeParse(normalizeVoiceSupportAliases(raw))
  if (!parsed.success) {
    return NextResponse.json({ error: "Richiesta vocale non valida", request_id: requestId }, { status: 400, headers: NO_STORE })
  }

  const suiteProductKey = VOICE_PRODUCT_TO_SUITE_PRODUCT[product.key]
  const codeFromQuestion = parsed.data.question
    ? normalizeCustomerCode(parsed.data.question, suiteProductKey)
    : null
  const codeInput = parsed.data.customer_code ?? (codeFromQuestion ? parsed.data.question : undefined)
  const normalizedCustomerCode = codeInput ? normalizeCustomerCode(codeInput, suiteProductKey) : null
  const customerMode = Boolean(codeInput)
  const question = codeFromQuestion && !parsed.data.customer_code ? "" : parsed.data.question

  if (!question && !customerMode) {
    return NextResponse.json({ error: "Richiesta vocale non valida", request_id: requestId }, { status: 400, headers: NO_STORE })
  }

  // Log diagnostico volutamente booleano: serve a verificare se 3CX sta
  // inoltrando il DTMF senza mai scrivere le cifre della licenza nei log.
  console.info("[3cx-voice] inbound mode", {
    requestId,
    product: product.key,
    endpoint: "prospect",
    customerCodeProvided: customerMode,
  })

  const intent = customerMode ? "customer_support" : "prospect_information"
  let route: Awaited<ReturnType<typeof getVoiceIvrRoute>> = null
  let routingSchemaAvailable = true
  try {
    route = await getVoiceIvrRoute(auth.propertyId, intent, product.key)
  } catch (error) {
    if (!isMissingVoiceRoutingSchema(error)) {
      console.error("[3cx-prospect] route lookup failed", { requestId, product: product.key, intent })
      return NextResponse.json(
        { ...serviceErrorVoiceResponse(product, VOICE_4BID_FALLBACK_EXTENSION, "route_lookup_failed"), request_id: requestId },
        { status: 502, headers: NO_STORE },
      )
    }
    routingSchemaAvailable = false
  }

  if (routingSchemaAvailable && !route) {
    return NextResponse.json(
      { ...serviceErrorVoiceResponse(product, VOICE_4BID_FALLBACK_EXTENSION, "route_not_configured"), request_id: requestId },
      { status: 503, headers: NO_STORE },
    )
  }

  if (route && !route.is_active) {
    return NextResponse.json(
      { ...serviceErrorVoiceResponse({ key: product.key, label: route.agent_label }, route.fallback_destination, "route_disabled"), request_id: requestId },
      { status: 503, headers: NO_STORE },
    )
  }

  if (!customerMode && route && !route.primary_knowledge_base_id) {
    return NextResponse.json(
      { ...serviceErrorVoiceResponse({ key: product.key, label: route.agent_label }, route.fallback_destination, "knowledge_base_not_configured"), request_id: requestId },
      { status: 503, headers: NO_STORE },
    )
  }

  const rate = takeVoiceRequest(`${auth.propertyId}:${customerMode ? "support" : "prospect"}`)
  if (!rate.allowed) {
    return NextResponse.json(
      { ...serviceErrorVoiceResponse(product, VOICE_4BID_FALLBACK_EXTENSION, "rate_limited"), request_id: requestId },
      { status: 429, headers: { ...NO_STORE, "Retry-After": String(rate.retryAfterSeconds) } },
    )
  }

  if (!parsed.data.caller_number) {
    console.warn("[3cx-prospect] caller number missing", { requestId, product: product.key })
  }

  await touchSharedPbxRouteHint({
    targetPropertyId: auth.propertyId,
    callerNumber: parsed.data.caller_number,
  })

  if (customerMode) {
    if (!normalizedCustomerCode) return codeRetryResponse(requestId, route?.fallback_destination)

    let customer
    try {
      customer = await findVoiceSupportCustomer(normalizedCustomerCode, suiteProductKey)
    } catch (error) {
      console.error("[3cx-prospect] customer lookup failed", {
        requestId,
        product: product.key,
        error: error instanceof Error ? error.message : "unknown",
      })
      return NextResponse.json({ error: "Errore interno", request_id: requestId }, { status: 502, headers: NO_STORE })
    }
    if (!customer) return codeRetryResponse(requestId, route?.fallback_destination)

    if (!question) {
      return NextResponse.json(
        {
          ok: true,
          customer: { recognized: true, property_name: customer.propertyName },
          customer_code_input: CUSTOMER_CODE_INPUT,
          product: { key: product.key, label: product.label },
          agent: { key: product.key, label: route?.agent_label ?? product.label },
          crm_tool: { key: route?.crm_tool_key ?? "customer_code_lookup", executed: true },
          speech: `Licenza verificata: risulta associata a ${customer.propertyName}. Mi dica come posso aiutarla.`,
          handoff: { action: "none", destination: null, mode: null },
          transfer: { required: false, destination: route?.fallback_destination ?? VOICE_4BID_FALLBACK_EXTENSION, reason: "none" },
          audience: "customer",
          request_id: requestId,
        },
        { headers: NO_STORE },
      )
    }

    try {
      const response = await answerVoiceQuestion({
        propertyId: customer.propertyId,
        productKey: product.key,
        question,
        history: parsed.data.history,
        callerNumber: parsed.data.caller_number,
        fallbackDestination: route?.fallback_destination,
        agentLabel: route?.agent_label,
        crmToolKey: route?.crm_tool_key ?? "customer_code_lookup",
      })

      await captureSharedPbxVoiceExchange({
        targetPropertyId: auth.propertyId,
        callerNumber: parsed.data.caller_number,
        history: parsed.data.history,
        question,
        responseSpeech: response.speech,
        agentLabel: route?.agent_label ?? product.label,
      })

      return NextResponse.json(
        {
          ...response,
          customer: { recognized: true, property_name: customer.propertyName },
          customer_code_input: CUSTOMER_CODE_INPUT,
          audience: "customer",
          request_id: requestId,
        },
        { headers: NO_STORE },
      )
    } catch (error) {
      console.error("[3cx-prospect] customer query failed", {
        requestId,
        product: product.key,
        error: error instanceof Error ? error.message : "unknown",
      })
      return NextResponse.json(
        { ...serviceErrorVoiceResponse(product, route?.fallback_destination ?? VOICE_4BID_FALLBACK_EXTENSION, "provider_error"), audience: "customer", request_id: requestId },
        { status: 502, headers: NO_STORE },
      )
    }
  }

  try {
    const sharedBaseIds = route ? await getVoiceIvrSharedBaseIds(route.id) : []
    const response = await answerVoiceQuestion({
      propertyId: auth.propertyId,
      productKey: product.key,
      primaryKnowledgeBaseId: route?.primary_knowledge_base_id ?? undefined,
      knowledgeBaseIds: route?.primary_knowledge_base_id
        ? [route.primary_knowledge_base_id, ...sharedBaseIds]
        : undefined,
      question,
      history: parsed.data.history,
      callerNumber: parsed.data.caller_number,
      fallbackDestination: route?.fallback_destination,
      agentLabel: route?.agent_label,
      crmToolKey: route?.crm_tool_key,
    })

    const qualification = response.transfer.required
      ? null
      : await resolveProspectQualification({
          propertyId: auth.propertyId,
          callerNumber: parsed.data.caller_number,
          history: parsed.data.history,
          question,
          currentSpeech: response.speech,
        })

    const answerSpeech = qualification?.prompt ? conciseBeforeQualification(response.speech) : response.speech
    const speech = qualification?.prompt
      ? `${answerSpeech} ${qualification.prompt}`.trim()
      : response.speech

    await captureSharedPbxVoiceExchange({
      targetPropertyId: auth.propertyId,
      callerNumber: parsed.data.caller_number,
      history: parsed.data.history,
      question,
      responseSpeech: speech,
      agentLabel: route?.agent_label ?? product.label,
    })

    if (response.transfer.required) {
      return NextResponse.json(
        {
          ...response,
          speech,
          transfer: { ...response.transfer, required: false },
          audience: "prospect",
          qualification: { requested: null },
          request_id: requestId,
        },
        { headers: NO_STORE },
      )
    }

    return NextResponse.json(
      {
        ...response,
        speech,
        audience: "prospect",
        qualification: {
          requested: qualification?.stage ?? null,
          name_known: qualification?.nameKnown ?? false,
          email_known: qualification?.emailKnown ?? false,
        },
        request_id: requestId,
      },
      { headers: NO_STORE },
    )
  } catch (error) {
    console.error("[3cx-prospect] query failed", {
      requestId,
      product: product.key,
      error: error instanceof Error ? error.message : "unknown",
    })
    return NextResponse.json(
      { ...serviceErrorVoiceResponse(product, VOICE_4BID_FALLBACK_EXTENSION, "provider_error"), audience: "prospect", request_id: requestId },
      { status: 502, headers: NO_STORE },
    )
  }
}