import { randomUUID } from "node:crypto"
import { type NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { authenticateInbound } from "@/lib/telephony/inbound-auth"
import { answerVoiceQuestion } from "@/lib/telephony/voice-agent"
import { VOICE_FALLBACK_EXTENSION } from "@/lib/telephony/voice-products"
import { takeVoiceRequest } from "@/lib/telephony/voice-rate-limit"
import { serviceErrorVoiceResponse } from "@/lib/telephony/voice-response"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

const requestSchema = z.object({
  question: z.string().trim().min(1).max(1_500),
  caller_number: z.string().trim().max(40).optional(),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().trim().min(1).max(1_000),
      }),
    )
    .max(8)
    .default([]),
})

const NO_STORE = { "Cache-Control": "no-store, max-age=0" }

function authError(status: 401 | 403 | 500) {
  if (status === 401) return NextResponse.json({ error: "Non autorizzato" }, { status, headers: NO_STORE })
  if (status === 403) {
    return NextResponse.json({ error: "Canale telefono disattivato" }, { status, headers: NO_STORE })
  }
  return NextResponse.json({ error: "Errore interno" }, { status, headers: NO_STORE })
}

/**
 * Contratto v1 chiamato dallo strumento personalizzato dell'agente vocale 3CX.
 *
 * La base e' fissata nella query dell'URL configurato sul route point, non nel
 * testo deciso dal modello: un agente non puo' interrogare una base diversa.
 * Il tenant e' ricavato esclusivamente dal segreto 3CX.
 */
export async function POST(request: NextRequest) {
  const requestId = request.headers.get("x-request-id")?.slice(0, 100) || randomUUID()
  const auth = await authenticateInbound(request)
  if (!auth.ok) return authError(auth.status)

  const knowledgeBaseId = request.nextUrl.searchParams.get("knowledge_base")?.trim() || ""
  if (!z.string().uuid().safeParse(knowledgeBaseId).success) {
    return NextResponse.json({ error: "Base di conoscenza non valida", request_id: requestId }, { status: 400, headers: NO_STORE })
  }
  const agent = { key: knowledgeBaseId, label: "Assistente telefonico" }

  const rate = takeVoiceRequest(auth.propertyId)
  if (!rate.allowed) {
    return NextResponse.json(
      { ...serviceErrorVoiceResponse(agent, VOICE_FALLBACK_EXTENSION, "rate_limited"), request_id: requestId },
      {
        status: 429,
        headers: { ...NO_STORE, "Retry-After": String(rate.retryAfterSeconds) },
      },
    )
  }

  let raw: unknown
  try {
    const text = await request.text()
    if (text.length > 16_000) {
      return NextResponse.json(
        { error: "Corpo della richiesta troppo grande", request_id: requestId },
        { status: 413, headers: NO_STORE },
      )
    }
    raw = JSON.parse(text)
  } catch {
    return NextResponse.json({ error: "Corpo JSON non valido", request_id: requestId }, { status: 400, headers: NO_STORE })
  }

  const parsed = requestSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Richiesta vocale non valida", request_id: requestId },
      { status: 400, headers: NO_STORE },
    )
  }

  try {
    const response = await answerVoiceQuestion({
      propertyId: auth.propertyId,
      knowledgeBaseId,
      question: parsed.data.question,
      history: parsed.data.history,
      callerNumber: parsed.data.caller_number,
    })

    return NextResponse.json({ ...response, request_id: requestId }, { headers: NO_STORE })
  } catch (error) {
    // Non si registra il testo del chiamante né il token. Il dettaglio tecnico
    // resta nel log server; al centralino arriva sempre un fallback eseguibile.
    console.error("[3cx-voice] query failed", {
      requestId,
      propertyId: auth.propertyId,
      knowledgeBaseId,
      error: error instanceof Error ? error.message : "unknown",
    })
    return NextResponse.json(
      { ...serviceErrorVoiceResponse(agent, VOICE_FALLBACK_EXTENSION, "provider_error"), request_id: requestId },
      { status: 502, headers: NO_STORE },
    )
  }
}
