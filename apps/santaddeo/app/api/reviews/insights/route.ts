import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { generateObject } from "ai"
import { z } from "zod"

export const dynamic = "force-dynamic"
export const maxDuration = 60

const INSIGHT_TTL_HOURS = 24
const LOOKBACK_DAYS = 180
const MAX_REVIEWS_FOR_AI = 120 // keep prompt bounded

const InsightsSchema = z.object({
  strengths: z
    .array(
      z.object({
        title: z.string().describe("Breve titolo in italiano (max 40 char)"),
        description: z.string().describe("Dettaglio 1-2 frasi in italiano"),
        mentions: z.number().int().min(0).describe("Quante recensioni lo menzionano"),
      })
    )
    .max(5),
  weaknesses: z
    .array(
      z.object({
        title: z.string(),
        description: z.string(),
        mentions: z.number().int().min(0),
      })
    )
    .max(5),
  recurring_topics: z
    .array(
      z.object({
        topic: z.string().describe("Parola/tema ricorrente in italiano"),
        count: z.number().int().min(0),
        sentiment: z.enum(["positive", "neutral", "negative", "mixed"]),
      })
    )
    .max(10),
  summary: z
    .string()
    .describe(
      "Riassunto 2-3 frasi in italiano della percezione complessiva degli ospiti"
    ),
})

/**
 * GET returns cached insights if fresh (< 24h), otherwise triggers regeneration.
 * POST forces regeneration (used from the UI "Ricalcola" button and the cron).
 */
export async function GET(request: NextRequest) {
  try {
    const hotelId = new URL(request.url).searchParams.get("hotelId")
    if (!hotelId)
      return NextResponse.json({ error: "hotelId required" }, { status: 400 })

    const supabase = await createClient()
    const { data } = await supabase
      .from("review_ai_insights")
      .select("*")
      .eq("hotel_id", hotelId)
      .maybeSingle()

    if (!data) return NextResponse.json({ insights: null, fresh: false })

    const ageMs = Date.now() - new Date(data.generated_at).getTime()
    const fresh = ageMs < INSIGHT_TTL_HOURS * 3_600_000
    return NextResponse.json({ insights: data, fresh })
  } catch (err) {
    console.error("[reviews/insights] GET error:", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Errore interno" },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const { hotelId } = (await request.json()) as { hotelId?: string }
    if (!hotelId)
      return NextResponse.json({ error: "hotelId required" }, { status: 400 })

    const supabase = await createClient()

    const since = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000)
      .toISOString()
      .split("T")[0]

    const { data: reviews } = await supabase
      .from("hotel_reviews")
      .select("rating, title, text, review_date, platform, sentiment")
      .eq("hotel_id", hotelId)
      .gte("review_date", since)
      .not("text", "is", null)
      .order("review_date", { ascending: false })
      .limit(MAX_REVIEWS_FOR_AI)

    const items = reviews || []

    if (items.length === 0) {
      return NextResponse.json(
        { error: "Nessuna recensione sufficiente per generare insights" },
        { status: 422 }
      )
    }

    const prompt = [
      "Sei un assistente di revenue management per un hotel. Analizza le recensioni reali degli ultimi mesi e restituisci i punti di forza, le criticita ricorrenti, i topic piu menzionati e un breve riassunto complessivo.",
      "Rispondi sempre in italiano. Sii concreto: cita aspetti operativi (pulizia, colazione, check-in, rumore, staff, posizione, arredo, prezzo).",
      `Recensioni analizzate: ${items.length}`,
      "",
      "=== RECENSIONI ===",
      ...items.slice(0, MAX_REVIEWS_FOR_AI).map((r, i) => {
        const parts: string[] = []
        parts.push(`#${i + 1} [${r.platform}] rating=${r.rating ?? "n/a"}`)
        if (r.title) parts.push(`Titolo: ${r.title}`)
        if (r.text) parts.push(`Testo: ${String(r.text).slice(0, 600)}`)
        return parts.join(" | ")
      }),
    ].join("\n")

    const { object, usage } = await generateObject({
      model: "openai/gpt-4o-mini",
      schema: InsightsSchema,
      prompt,
      temperature: 0.2,
    })

    const { error: upsertErr } = await supabase.from("review_ai_insights").upsert(
      {
        hotel_id: hotelId,
        generated_at: new Date().toISOString(),
        reviews_count: items.length,
        lookback_days: LOOKBACK_DAYS,
        strengths: object.strengths,
        weaknesses: object.weaknesses,
        recurring_topics: object.recurring_topics,
        summary: object.summary,
        model: "openai/gpt-4o-mini",
        input_tokens: usage?.inputTokens ?? null,
        output_tokens: usage?.outputTokens ?? null,
      },
      { onConflict: "hotel_id" }
    )

    if (upsertErr) {
      return NextResponse.json({ error: upsertErr.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, insights: object })
  } catch (err) {
    console.error("[reviews/insights] POST error:", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Errore interno" },
      { status: 500 }
    )
  }
}
