import { randomUUID } from "node:crypto"
import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { VOICE_PRODUCT_TO_SUITE_PRODUCT } from "@/lib/customer-codes/product"
import { normalizeCustomerCode } from "@/lib/telephony/customer-code"
import { authenticateVoiceInbound } from "@/lib/telephony/inbound-auth"
import { answerVoiceQuestion } from "@/lib/telephony/voice-agent"
import { getVoiceProduct, VOICE_FALLBACK_EXTENSION } from "@/lib/telephony/voice-products"
import { takeVoiceRequest } from "@/lib/telephony/voice-rate-limit"
import { serviceErrorVoiceResponse } from "@/lib/telephony/voice-response"
import { getVoiceIvrRoute, isMissingVoiceRoutingSchema } from "@/lib/telephony/voice-routing"
import { findVoiceSupportCustomer, isVoiceSupportHub } from "@/lib/telephony/voice-support-customer"
import { invalidCustomerCodeSpeech, resolveSupportHandoff } from "@/lib/telephony/voice-support"
import { captureSharedPbxVoiceExchange, touchSharedPbxRouteHint } from "@/lib/telephony/shared-pbx-routing"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const requestSchema = z.object({
  customer_code: z.union([z.string(), z.number().int()]).transform((value) => String(value)),
  question: z.string().trim().max(1_500).default(""),
  caller_number: z.string().trim().max(40).optional(),
  after_hours: z.boolean().default(false),
  history: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().trim().min(1).max(1_000) })).max(8).default([]),
})

const NO_STORE = { "Cache-Control": "no-store, max-age=0" }

async function readVoiceBody(request: NextRequest): Promise<unknown | null> {
  const text = await request.text()
  if (text.length > 16_000) return null
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function unauthenticatedCodeResponse(requestId: string) {
  return NextResponse.json(
    {
      ok: true,
      customer: { recognized: false },
      speech: invalidCustomerCodeSpeech(),
      handoff: { action: "retry_customer_code", destination: null, mode: null },
      transfer: { required: false, destination: VOICE_FALLBACK_EXTENSION, reason: "none" },
      request_id: requestId,
    },
    { headers: NO_STORE },
  )
}

/**
 * Supporto per clienti: il codice e' risolto solo dopo l'autenticazione del
 * centralino 4 BID, poi ogni retrieval riparte dal property_id del cliente.
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
  if (!product) return NextResponse.json({ error: "Prodotto vocale non valido", request_id: requestId }, { status: 400, headers: NO_STORE })

  let route = null
  let routingSchemaAvailable = true
  try {
    route = await getVoiceIvrRoute(auth.propertyId, "customer_support", product.key)
  } catch (error) {
    if (!isMissingVoiceRoutingSchema(error)) {
      console.error("[3cx-support] route lookup failed", { requestId, product: product.key })
      return NextResponse.json(
        { ...serviceErrorVoiceResponse(product, VOICE_FALLBACK_EXTENSION, "route_lookup_failed"), request_id: requestId },
        { status: 502, headers: NO_STORE },
      )
    }
    routingSchemaAvailable = false
  }

  if (routingSchemaAvailable && !route) {
    return NextResponse.json(
      { ...serviceErrorVoiceResponse(product, VOICE_FALLBACK_EXTENSION, "route_not_configured"), request_id: requestId },
      { status: 503, headers: NO_STORE },
    )
  }

  if (route && !route.is_active) {
    return NextResponse.json(
      { ...serviceErrorVoiceResponse({ key: product.key, label: route.agent_label }, route.fallback_destination, "route_disabled"), request_id: requestId },
      { status: 503, headers: NO_STORE },
    )
  }

  const rate = takeVoiceRequest(`${auth.propertyId}:support`)
  if (!rate.allowed) {
    return NextResponse.json(
      { ...serviceErrorVoiceResponse(product, VOICE_FALLBACK_EXTENSION, "rate_limited"), request_id: requestId },
      { status: 429, headers: { ...NO_STORE, "Retry-After": String(rate.retryAfterSeconds) } },
    )
  }

  const raw = await readVoiceBody(request)
  const parsed = requestSchema.safeParse(raw)
  if (!parsed.success) return unauthenticatedCodeResponse(requestId)

  await touchSharedPbxRouteHint({
    targetPropertyId: auth.propertyId,
    callerNumber: parsed.data.caller_number,
  })

  const suiteProductKey = VOICE_PRODUCT_TO_SUITE_PRODUCT[product.key]
  const customerCode = normalizeCustomerCode(parsed.data.customer_code, suiteProductKey)
  if (!customerCode) return unauthenticatedCodeResponse(requestId)

  let customer
  try {
    customer = await findVoiceSupportCustomer(customerCode, suiteProductKey)
  } catch (error) {
    console.error("[3cx-support] customer lookup failed", { requestId, error: error instanceof Error ? error.message : "unknown" })
    return NextResponse.json({ error: "Errore interno", request_id: requestId }, { status: 502, headers: NO_STORE })
  }
  if (!customer) return unauthenticatedCodeResponse(requestId)

  // Dopo l'identificazione il flow puo' chiedere la domanda in un secondo
  // turno: non chiamiamo il modello inutilmente e non salviamo il codice.
  if (!parsed.data.question) {
    return NextResponse.json(
      {
        ok: true,
        customer: { recognized: true },
        product: { key: product.key, label: product.label },
        agent: { key: product.key, label: route?.agent_label ?? product.label },
        crm_tool: { key: route?.crm_tool_key ?? "customer_code_lookup", executed: true },
        speech: "Codice cliente verificato. Mi dica come posso aiutarla.",
        handoff: { action: "none", destination: null, mode: null },
        transfer: { required: false, destination: route?.fallback_destination ?? VOICE_FALLBACK_EXTENSION, reason: "none" },
        request_id: requestId,
      },
      { headers: NO_STORE },
    )
  }

  const afterHoursHandoff = resolveSupportHandoff({
    humanHelpRequired: true,
    afterHours: parsed.data.after_hours,
    plan: customer.plan,
    configuredMode: customer.supportAfterHoursMode,
    configuredExtension: customer.supportAfterHoursExtension,
    operatorExtension: route?.fallback_destination,
  })

  try {
    const response = await answerVoiceQuestion({
      propertyId: customer.propertyId,
      productKey: product.key,
      question: parsed.data.question,
      history: parsed.data.history,
      callerNumber: parsed.data.caller_number,
      fallbackDestination: afterHoursHandoff.destination ?? VOICE_FALLBACK_EXTENSION,
      agentLabel: route?.agent_label,
      crmToolKey: route?.crm_tool_key,
    })
    const handoff = response.transfer.required
      ? afterHoursHandoff
      : { action: "none" as const, destination: null, mode: null, speech: null }
    const shouldRecord = handoff.action === "record_message"
    const speech = shouldRecord ? handoff.speech || response.speech : response.speech

    await captureSharedPbxVoiceExchange({
      targetPropertyId: auth.propertyId,
      callerNumber: parsed.data.caller_number,
      history: parsed.data.history,
      question: parsed.data.question,
      responseSpeech: speech,
      agentLabel: route?.agent_label ?? product.label,
    })

    return NextResponse.json(
      {
        ...response,
        customer: { recognized: true },
        speech,
        transfer: shouldRecord
          ? { required: false, destination: VOICE_FALLBACK_EXTENSION, reason: "none" }
          : response.transfer,
        handoff: { action: handoff.action, destination: handoff.destination, mode: handoff.mode },
        request_id: requestId,
      },
      { headers: NO_STORE },
    )
  } catch (error) {
    console.error("[3cx-support] query failed", { requestId, product: product.key, error: error instanceof Error ? error.message : "unknown" })
    const shouldRecord = afterHoursHandoff.action === "record_message"
    return NextResponse.json(
      {
        ...serviceErrorVoiceResponse(product, afterHoursHandoff.destination ?? VOICE_FALLBACK_EXTENSION, "provider_error"),
        customer: { recognized: true },
        speech: shouldRecord ? afterHoursHandoff.speech : "Non riesco a completare la richiesta. La metto in contatto con un operatore.",
        transfer: shouldRecord
          ? { required: false, destination: VOICE_FALLBACK_EXTENSION, reason: "none" }
          : { required: true, destination: afterHoursHandoff.destination ?? VOICE_FALLBACK_EXTENSION, reason: "service_error" },
        handoff: { action: afterHoursHandoff.action, destination: afterHoursHandoff.destination, mode: afterHoursHandoff.mode },
        request_id: requestId,
      },
      { status: 502, headers: NO_STORE },
    )
  }
}
