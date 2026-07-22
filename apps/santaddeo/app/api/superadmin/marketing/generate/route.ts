import { generateText } from "ai"
import { NextResponse } from "next/server"

// POST - generate email text or image from a prompt
export async function POST(req: Request) {
  const body = await req.json()
  const { type, topic, tone, language } = body

  if (type === "text") {
    const systemPrompt = `Sei un copywriter esperto in email marketing per il settore hospitality/hotel.
Scrivi email professionali, coinvolgenti e persuasive in ${language || "italiano"}.
Il tono deve essere ${tone || "professionale ma amichevole"}.
Restituisci SOLO il contenuto HTML del body dell'email (senza tag html/head/body).
Usa paragrafi <p>, titoli <h2>, <h3>, elenchi <ul><li> e link <a> dove utile.
Non aggiungere stili inline. Il template wrapper si occupera del design.
Puoi usare {{name}} come placeholder per il nome del destinatario.`

    try {
      const result = await generateText({
        model: "anthropic/claude-sonnet-4-20250514",
        system: systemPrompt,
        prompt: `Scrivi il contenuto di una email marketing su questo argomento: ${topic}`,
        maxTokens: 2000,
      })

      return NextResponse.json({ html: result.text })
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      return NextResponse.json({ error: msg }, { status: 500 })
    }
  }

  if (type === "subject") {
    try {
      const result = await generateText({
        model: "anthropic/claude-sonnet-4-20250514",
        system: `Sei un copywriter esperto. Genera 5 oggetti email diversi per email marketing in ${language || "italiano"}. Restituisci SOLO un JSON array di stringhe. Nessuna spiegazione.`,
        prompt: `Argomento: ${topic}`,
        maxTokens: 500,
      })

      try {
        const subjects = JSON.parse(result.text)
        return NextResponse.json({ subjects })
      } catch {
        return NextResponse.json({ subjects: [result.text.trim()] })
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      return NextResponse.json({ error: msg }, { status: 500 })
    }
  }

  return NextResponse.json({ error: "type must be 'text' or 'subject'" }, { status: 400 })
}
