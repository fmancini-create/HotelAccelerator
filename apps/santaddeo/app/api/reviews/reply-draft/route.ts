import { NextRequest, NextResponse } from "next/server"
import { createClient, createServiceRoleClient } from "@/lib/supabase/server"
import { generateText } from "ai"
import { buildSettingsPromptParts, settingsFromRow } from "@/lib/reviews/reply-settings"

export const dynamic = "force-dynamic"
export const maxDuration = 60

/**
 * Assistente AI alla risposta delle recensioni.
 *
 * NB sorgente dati: le recensioni arrivano via scraping Apify (sola lettura),
 * quindi NON si pubblica direttamente sull'OTA. Questo endpoint genera/salva
 * una BOZZA che l'albergatore rifinisce e copia nell'extranet (o, in futuro,
 * pubblica via API ufficiale del canale quando disponibile).
 *
 *  POST  -> genera una bozza con l'AI (non salva nulla)
 *  PATCH -> salva/aggiorna la bozza modificata dall'utente
 */

const LANG_NAMES: Record<string, string> = {
  it: "italiano",
  en: "inglese",
  de: "tedesco",
  fr: "francese",
  es: "spagnolo",
  nl: "olandese",
  pt: "portoghese",
  ru: "russo",
}

async function loadReview(supabase: Awaited<ReturnType<typeof createClient>>, reviewId: string) {
  const { data, error } = await supabase
    .from("hotel_reviews")
    .select(
      "id, hotel_id, platform, author_name, rating, original_rating, original_scale, title, text, language, review_date, response_text, draft_response",
    )
    .eq("id", reviewId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data
}

export async function POST(request: NextRequest) {
  try {
    const { reviewId, instructions } = (await request.json()) as {
      reviewId?: string
      instructions?: string
    }
    if (!reviewId) {
      return NextResponse.json({ error: "reviewId required" }, { status: 400 })
    }

    const supabase = await createClient()
    const review = await loadReview(supabase, reviewId)
    if (!review) {
      return NextResponse.json({ error: "Recensione non trovata" }, { status: 404 })
    }

    // Nome struttura per firmare la risposta in modo naturale.
    const { data: hotel } = await supabase
      .from("hotels")
      .select("name")
      .eq("id", review.hotel_id)
      .maybeSingle()

    // Impostazioni di personalizzazione del tenant (firma, tono, lunghezza,
    // linee guida, lingua, emoji). Lettura via service role: la pagina che
    // chiama questo endpoint ha gia' superato l'auth hotel-scoped.
    const svc = await createServiceRoleClient()
    const { data: settingsRow } = await svc
      .from("hotel_review_reply_settings")
      .select("*")
      .eq("hotel_id", review.hotel_id)
      .maybeSingle()
    const settings = settingsFromRow(settingsRow)

    const langCode = (review.language || "it").toLowerCase().slice(0, 2)
    const langName = LANG_NAMES[langCode] || "la stessa lingua della recensione"
    const rating = review.rating ?? null
    const ratingTone =
      rating == null
        ? "professionale e cordiale"
        : rating >= 4
          ? "caloroso e grato"
          : rating >= 3
            ? "cortese, equilibrato, che ringrazia e prende in carico gli spunti"
            : "empatico e professionale, che si scusa con sincerità senza essere difensivo e propone di rimediare"

    const { rules: settingRules, languageInstruction } = buildSettingsPromptParts(settings, langName)

    const prompt = [
      `Sei il responsabile relazioni con gli ospiti dell'hotel "${hotel?.name || "la struttura"}".`,
      `Scrivi una risposta pubblica alla seguente recensione lasciata su ${review.platform}.`,
      "",
      "REGOLE:",
      languageInstruction,
      // Il tono per-rating resta la base modificabile: applicato solo se il
      // tenant non lo ha disattivato.
      settings.keepRatingTone ? `- Tono di base (in base alla valutazione): ${ratingTone}.` : "",
      "- Rivolgiti all'ospite per nome se disponibile, altrimenti in modo cortese.",
      "- Ringrazia per il feedback. Se ci sono critiche, affrontale con concretezza e senza scuse generiche.",
      "- Niente elenchi puntati.",
      "- Non inventare fatti o promesse non verificabili. Resta sincero e umano.",
      ...settingRules,
      "- Restituisci SOLO il testo della risposta, senza virgolette o intestazioni.",
      instructions ? `\nIndicazioni aggiuntive dell'albergatore per questa risposta: ${instructions}` : "",
      "",
      "=== RECENSIONE ===",
      `Autore: ${review.author_name || "Ospite"}`,
      `Valutazione: ${rating ?? "n/d"}${review.original_rating ? ` (originale ${review.original_rating}/${review.original_scale || "?"})` : ""}`,
      review.title ? `Titolo: ${review.title}` : "",
      `Testo: ${review.text || "(nessun testo, solo valutazione numerica)"}`,
    ]
      .filter(Boolean)
      .join("\n")

    const { text, usage } = await generateText({
      model: "openai/gpt-4o-mini",
      prompt,
      temperature: 0.5,
    })

    return NextResponse.json({
      ok: true,
      draft: text.trim(),
      language: langCode,
      usage: { input: usage?.inputTokens ?? null, output: usage?.outputTokens ?? null },
    })
  } catch (err) {
    console.error("[reviews/reply-draft] POST error:", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Errore interno" },
      { status: 500 },
    )
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const { reviewId, draft, status } = (await request.json()) as {
      reviewId?: string
      draft?: string
      status?: string
    }
    if (!reviewId) {
      return NextResponse.json({ error: "reviewId required" }, { status: 400 })
    }

    const supabase = await createClient()
    const { error } = await supabase
      .from("hotel_reviews")
      .update({
        draft_response: draft ?? null,
        draft_response_at: new Date().toISOString(),
        draft_response_status: status || "draft",
      })
      .eq("id", reviewId)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[reviews/reply-draft] PATCH error:", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Errore interno" },
      { status: 500 },
    )
  }
}
