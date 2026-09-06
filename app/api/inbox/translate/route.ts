import { generateText } from "ai"
import { type NextRequest, NextResponse } from "next/server"

import { CHAT_MODEL } from "@/lib/ai/config"
import { getAuthenticatedPropertyId } from "@/lib/auth-property"
import { handleServiceError } from "@/lib/errors"

export const runtime = "nodejs"
export const maxDuration = 20

const MAX_TEXT_CHARS = 12_000
const MAX_CONTEXT_CHARS = 8_000

type TranslationMode = "incoming" | "reply"

function cleanText(value: unknown, maxChars: number): string {
  if (typeof value !== "string") return ""
  return value.replace(/\u0000/g, "").trim().slice(0, maxChars)
}

function promptForIncoming(text: string): string {
  return [
    "Sei un traduttore professionale per una inbox alberghiera.",
    "Traduci il testo seguente in italiano naturale e fedele.",
    "Non riassumere, non spiegare e non aggiungere informazioni.",
    "Mantieni nomi propri, numeri, prezzi, date, URL, codici prenotazione e interruzioni di riga.",
    "Se il testo e' gia' in italiano, restituiscilo senza modificarlo.",
    "Restituisci esclusivamente la traduzione, senza virgolette o prefazioni.",
    "",
    "TESTO:",
    text,
  ].join("\n")
}

function promptForReply(reply: string, customerMessage: string): string {
  return [
    "Sei un traduttore professionale per una inbox alberghiera.",
    "Individua la lingua principale usata dal cliente nel suo ultimo messaggio e traduci la bozza dell'operatore in quella stessa lingua.",
    "La traduzione deve essere naturale, cortese e adatta a una comunicazione hotel-cliente, ma deve conservare esattamente il significato della bozza.",
    "Non inventare dettagli, non correggere prezzi/date/codici e non aggiungere formule di saluto che non esistono nella bozza.",
    "Mantieni nomi propri, numeri, prezzi, date, URL, codici prenotazione e interruzioni di riga.",
    "Se il cliente scrive in italiano, restituisci la bozza senza modificarla.",
    "Restituisci esclusivamente il testo da inviare, senza virgolette o prefazioni.",
    "",
    "ULTIMO MESSAGGIO DEL CLIENTE:",
    customerMessage,
    "",
    "BOZZA OPERATORE:",
    reply,
  ].join("\n")
}

export async function POST(request: NextRequest) {
  try {
    // La traduzione e' una funzione della Inbox autenticata: non accettiamo
    // chiamate anonime e non fidiamo di tenant/property passati dal browser.
    await getAuthenticatedPropertyId(request)

    const body = await request.json().catch(() => null)
    const mode = body?.mode as TranslationMode | undefined
    if (mode !== "incoming" && mode !== "reply") {
      return NextResponse.json({ error: "Modalita' di traduzione non valida" }, { status: 400 })
    }

    const text = cleanText(body?.text, MAX_TEXT_CHARS)
    if (!text) {
      return NextResponse.json({ error: "Non c'e' testo da tradurre" }, { status: 400 })
    }

    const customerMessage = cleanText(body?.customerMessage, MAX_CONTEXT_CHARS)
    if (mode === "reply" && !customerMessage) {
      return NextResponse.json(
        { error: "Non trovo un messaggio del cliente da cui capire la lingua" },
        { status: 400 },
      )
    }

    const prompt = mode === "incoming" ? promptForIncoming(text) : promptForReply(text, customerMessage)
    const { text: generated } = await generateText({
      model: CHAT_MODEL,
      prompt,
      temperature: 0,
      maxOutputTokens: 4_000,
    })

    const translation = generated.trim()
    if (!translation) {
      return NextResponse.json({ error: "Traduzione non disponibile" }, { status: 502 })
    }

    return NextResponse.json({
      translation,
      mode,
      target: mode === "incoming" ? "it" : "customer_language",
    })
  } catch (error) {
    return handleServiceError(error)
  }
}
