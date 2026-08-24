import { randomUUID } from "node:crypto"
import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { VOICE_PRODUCT_TO_SUITE_PRODUCT } from "@/lib/customer-codes/product"
import { normalizeCustomerCode } from "@/lib/telephony/customer-code"
import { authenticateInbound } from "@/lib/telephony/inbound-auth"
import { answerVoiceQuestion } from "@/lib/telephony/voice-agent"
import { getVoiceProduct, VOICE_FALLBACK_EXTENSION } from "@/lib/telephony/voice-products"
import { takeVoiceRequest } from "@/lib/telephony/voice-rate-limit"
import { serviceErrorVoiceResponse } from "@/lib/telephony/voice-response"
import { findVoiceSupportCustomer, isVoiceSupportHub } from "@/lib/telephony/voice-support-customer"
import { invalidCustomerCodeSpeech, resolveSupportHandoff } from "@/lib/telephony/voice-support"

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
  const auth = await authenticateInbound(request)
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
        speech: "Codice cliente verificato. Mi dica come posso aiutarla.",
        handoff: { action: "none", destination: null, mode: null },
        transfer: { required: false, destination: VOICE_FALLBACK_EXTENSION, reason: "none" },
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
  })

  try {
    const response = await answerVoiceQuestion({
      propertyId: customer.propertyId,
      productKey: product.key,
      question: parsed.data.question,
      history: parsed.data.history,
      callerNumber: parsed.data.caller_number,
      fallbackDestination: afterHoursHandoff.destination ?? VOICE_FALLBACK_EXTENSION,
    })
    const handoff = response.transfer.required
      ? afterHoursHandoff
      : { action: "none" as const, destination: null, mode: null, speech: null }
    const shouldRecord = handoff.action === "record_message"

    return NextResponse.json(
      {
        ...response,
        customer: { recognized: true },
        speech: shouldRecord ? handoff.speech : response.speech,
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
