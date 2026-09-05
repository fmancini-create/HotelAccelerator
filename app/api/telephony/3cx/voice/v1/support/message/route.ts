import { randomUUID } from "node:crypto"
import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { VOICE_PRODUCT_TO_SUITE_PRODUCT } from "@/lib/customer-codes/product"
import { normalizeCustomerCode } from "@/lib/telephony/customer-code"
import { authenticateVoiceInbound } from "@/lib/telephony/inbound-auth"
import { getVoiceProduct } from "@/lib/telephony/voice-products"
import { takeVoiceRequest } from "@/lib/telephony/voice-rate-limit"
import { createVoiceSupportMessage, findVoiceSupportCustomer, isVoiceSupportHub } from "@/lib/telephony/voice-support-customer"
import { normalizeVoiceSupportAliases } from "@/lib/telephony/voice-request"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const requestSchema = z
  .object({
    customer_code: z.union([z.string(), z.number().int()]).transform((value) => String(value)),
    call_id: z.string().trim().min(1).max(160),
    caller_number: z.string().trim().max(40).optional(),
    recording_reference: z.string().trim().max(2_000).optional(),
    transcript: z.string().trim().max(4_000).optional(),
  })
  .refine((value) => Boolean(value.recording_reference || value.transcript), {
    message: "Serve una registrazione o una trascrizione",
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

/**
 * Callback dopo la registrazione 3CX. `call_id` rende l'operazione idempotente:
 * se il PBX ritenta la richiesta, nella coda supporto resta un solo ticket.
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

  const rate = takeVoiceRequest(`${auth.propertyId}:support-message`)
  if (!rate.allowed) return NextResponse.json({ error: "Troppe richieste", request_id: requestId }, { status: 429, headers: NO_STORE })

  const raw = await readVoiceBody(request)
  const parsed = requestSchema.safeParse(normalizeVoiceSupportAliases(raw))
  if (!parsed.success) return NextResponse.json({ error: "Messaggio vocale non valido", request_id: requestId }, { status: 400, headers: NO_STORE })

  const suiteProductKey = VOICE_PRODUCT_TO_SUITE_PRODUCT[product.key]
  const customerCode = normalizeCustomerCode(parsed.data.customer_code, suiteProductKey)
  if (!customerCode) return NextResponse.json({ error: "Messaggio vocale non valido", request_id: requestId }, { status: 400, headers: NO_STORE })

  try {
    const customer = await findVoiceSupportCustomer(customerCode, suiteProductKey)
    if (!customer) return NextResponse.json({ error: "Messaggio vocale non valido", request_id: requestId }, { status: 400, headers: NO_STORE })

    const supportCase = await createVoiceSupportMessage({
      hubPropertyId: auth.propertyId,
      customer,
      callId: parsed.data.call_id,
      productKey: product.key,
      callerNumber: parsed.data.caller_number,
      recordingReference: parsed.data.recording_reference,
      transcript: parsed.data.transcript,
    })
    return NextResponse.json({ ok: true, case_id: supportCase.id, request_id: requestId }, { status: 201, headers: NO_STORE })
  } catch (error) {
    console.error("[3cx-support] message registration failed", { requestId, error: error instanceof Error ? error.message : "unknown" })
    return NextResponse.json({ error: "Errore interno", request_id: requestId }, { status: 502, headers: NO_STORE })
  }
}
