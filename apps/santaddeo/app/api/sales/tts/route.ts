import { type NextRequest, NextResponse } from "next/server"
import { createHash } from "crypto"
import { put, list, get } from "@vercel/blob"

// TTS neurale per l'audio guida del Disco Vendita.
// L'AI Gateway di Vercel NON supporta la generazione audio, quindi usiamo
// l'API diretta OpenAI (gpt-4o-mini-tts, voce naturale anche in italiano).
// Ogni testo viene generato UNA sola volta e messo in cache su Vercel Blob:
// la chiave e' l'hash del (testo + voce + istruzioni), cosi' ascolti
// successivi servono direttamente l'MP3 dalla cache senza ricosti.
//
// Lo store Blob del progetto e' PRIVATO: gli MP3 si salvano con access
// "private" e si servono in streaming tramite il GET di questa stessa route
// (get() + autenticazione del path). Il client riceve dalla POST un URL di
// delivery relativo (/api/sales/tts?p=<pathname>) e lo passa a <audio>.

export const runtime = "nodejs"
export const maxDuration = 60

const MODEL = "gpt-4o-mini-tts"
const DEFAULT_VOICE = "alloy"
const VOICE_INSTRUCTIONS =
  "Parla in italiano con tono caldo, professionale e naturale, come un consulente vendite esperto e rassicurante. Ritmo calmo, pause naturali tra le frasi, nessun tono robotico."

// Voci OpenAI ammesse (whitelist per evitare input arbitrari).
const ALLOWED_VOICES = new Set([
  "alloy",
  "ash",
  "ballad",
  "coral",
  "echo",
  "fable",
  "onyx",
  "nova",
  "sage",
  "shimmer",
  "verse",
])

const MAX_INPUT = 4000
const PREFIX = "sales-tts/"

function deliveryUrl(pathname: string) {
  return `/api/sales/tts?p=${encodeURIComponent(pathname)}`
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null)
    const text = typeof body?.text === "string" ? body.text.trim() : ""
    const voice =
      typeof body?.voice === "string" && ALLOWED_VOICES.has(body.voice)
        ? body.voice
        : DEFAULT_VOICE

    if (!text) {
      return NextResponse.json({ error: "Testo mancante" }, { status: 400 })
    }
    if (text.length > MAX_INPUT) {
      return NextResponse.json(
        { error: `Testo troppo lungo (max ${MAX_INPUT} caratteri)` },
        { status: 400 },
      )
    }

    // Chiave di cache deterministica: stesso testo+voce+istruzioni -> stesso MP3.
    const hash = createHash("sha256")
      .update(`${MODEL}|${voice}|${VOICE_INSTRUCTIONS}|${text}`)
      .digest("hex")
      .slice(0, 32)
    const pathname = `${PREFIX}${hash}.mp3`

    // 1) Cache hit: se l'MP3 esiste gia' su Blob, rispondi con l'URL di delivery.
    try {
      const existing = await list({ prefix: pathname, limit: 1 })
      const hit = existing.blobs.find((b) => b.pathname === pathname)
      if (hit) {
        return NextResponse.json({ url: deliveryUrl(pathname), cached: true })
      }
    } catch {
      // Se il check cache fallisce, proseguiamo con la generazione.
    }

    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      return NextResponse.json(
        { error: "OPENAI_API_KEY non configurata" },
        { status: 500 },
      )
    }

    // 2) Cache miss: genera l'audio con OpenAI TTS.
    const ttsRes = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        voice,
        input: text,
        instructions: VOICE_INSTRUCTIONS,
        response_format: "mp3",
      }),
    })

    if (!ttsRes.ok) {
      const detail = await ttsRes.text().catch(() => "")
      console.error("[sales/tts] OpenAI error", ttsRes.status, detail.slice(0, 300))
      const status = ttsRes.status === 429 ? 429 : 502
      return NextResponse.json(
        { error: "Generazione audio non riuscita" },
        { status },
      )
    }

    const audio = Buffer.from(await ttsRes.arrayBuffer())

    // 3) Salva su Blob PRIVATO (lo store del progetto e' privato).
    await put(pathname, audio, {
      access: "private",
      contentType: "audio/mpeg",
      addRandomSuffix: false,
      cacheControlMaxAge: 60 * 60 * 24 * 365,
    })

    return NextResponse.json({ url: deliveryUrl(pathname), cached: false })
  } catch (error) {
    console.error("[sales/tts] error", error)
    return NextResponse.json({ error: "Errore interno" }, { status: 500 })
  }
}

// Delivery: streama l'MP3 privato. Conditional request (ETag) cosi' il browser
// mette in cache e rivalida senza riscaricare l'audio invariato.
export async function GET(req: NextRequest) {
  try {
    const p = req.nextUrl.searchParams.get("p")
    if (!p || !p.startsWith(PREFIX) || !p.endsWith(".mp3")) {
      return NextResponse.json({ error: "Path non valido" }, { status: 400 })
    }

    const result = await get(p, {
      access: "private",
      ifNoneMatch: req.headers.get("if-none-match") ?? undefined,
    })

    if (!result) {
      return new NextResponse("Not found", { status: 404 })
    }

    if (result.statusCode === 304) {
      return new NextResponse(null, {
        status: 304,
        headers: {
          ETag: result.blob.etag,
          "Cache-Control": "private, max-age=31536000",
        },
      })
    }

    return new NextResponse(result.stream, {
      headers: {
        "Content-Type": result.blob.contentType || "audio/mpeg",
        ETag: result.blob.etag,
        "Cache-Control": "private, max-age=31536000",
      },
    })
  } catch (error) {
    console.error("[sales/tts] GET error", error)
    return NextResponse.json({ error: "Errore interno" }, { status: 500 })
  }
}
