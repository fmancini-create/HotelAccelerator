import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { generateText } from "ai"
import { gateway } from "@ai-sdk/gateway"
import { isDevAuthAsync } from "@/lib/env/dev-auth"

// Usa unpdf (già installato) per estrarre testo dal PDF
async function parsePdf(data: Uint8Array): Promise<string> {
  const { extractText } = await import("unpdf")
  const result = await extractText(data)
  console.log("[v0] unpdf result type:", typeof result.text, Array.isArray(result.text))
  // result.text può essere string o string[] a seconda della versione
  if (Array.isArray(result.text)) {
    return result.text.join("\n")
  }
  if (typeof result.text === "string") {
    return result.text
  }
  // Fallback: prova a convertire in stringa
  return String(result.text || "")
}

export const maxDuration = 60

/**
 * Endpoint per estrarre automaticamente i dati da una fattura PDF usando AI.
 * Riceve il PDF come FormData, estrae il testo e usa un LLM per identificare:
 * - Numero fattura
 * - Data emissione
 * - Imponibile
 * - IVA
 * - Totale
 * - Nome fornitore (per identificare la struttura)
 */
export async function POST(req: NextRequest) {
  // Dev bypass: in v0 preview non c'è sessione utente reale
  const isV0Preview = await isDevAuthAsync()
  
  if (!isV0Preview) {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: "Non autorizzato" }, { status: 401 })
    }

    // Verifica che sia super_admin
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single()
    if (profile?.role !== "super_admin") {
      return NextResponse.json({ error: "Accesso negato" }, { status: 403 })
    }
  }

  try {
    const formData = await req.formData()
    const file = formData.get("file") as File | null

    if (!file || file.type !== "application/pdf") {
      return NextResponse.json({ error: "File PDF richiesto" }, { status: 400 })
    }

    // Estrai il testo dal PDF
    const arrayBuffer = await file.arrayBuffer()
    const uint8Array = new Uint8Array(arrayBuffer)
    
    let pdfText = ""
    try {
      pdfText = await parsePdf(uint8Array)
    } catch (pdfErr) {
      console.error("[v0] PDF parse error:", pdfErr)
      return NextResponse.json({ error: "Impossibile leggere il PDF" }, { status: 422 })
    }

    if (!pdfText || pdfText.trim().length < 10) {
      return NextResponse.json({ error: "PDF vuoto o non leggibile" }, { status: 422 })
    }

    // Tronca il testo se troppo lungo (max ~8000 caratteri per sicurezza)
    const truncatedText = pdfText.substring(0, 8000)

    // Usa LLM per estrarre i dati strutturati dal testo
    const { text } = await generateText({
      model: gateway("google/gemini-2.5-flash"),
      prompt: `Analizza il seguente testo estratto da una fattura italiana e estrai i dati in formato JSON.

TESTO FATTURA:
${truncatedText}

Estrai e restituisci SOLO un oggetto JSON con questi campi:
{
  "invoice_number": "numero completo della fattura (es. '11-C', 'FT-2024-001')",
  "issue_date": "data di emissione in formato YYYY-MM-DD",
  "supplier_name": "nome/ragione sociale del fornitore che emette la fattura",
  "customer_name": "nome/ragione sociale del cliente destinatario",
  "subtotal": numero imponibile (solo il numero, senza simbolo €),
  "tax_rate": aliquota IVA percentuale (es. 22),
  "tax": importo IVA (solo il numero),
  "total": totale fattura (solo il numero)
}

IMPORTANTE:
- Se un campo non è presente o non riesci a identificarlo, usa null
- I numeri devono essere numeri, non stringhe (es. 2328.86, non "2328.86")
- La data deve essere in formato ISO (YYYY-MM-DD)
- Rispondi SOLO con il JSON, senza markdown, senza spiegazioni`,
    })

    // Parse la risposta JSON
    let parsed: Record<string, unknown>
    try {
      // Rimuovi eventuale markdown code block
      const jsonStr = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim()
      parsed = JSON.parse(jsonStr)
    } catch {
      console.error("[v0] Failed to parse AI response:", text)
      return NextResponse.json(
        {
          error: "Impossibile parsare la risposta AI",
          raw: text,
        },
        { status: 422 }
      )
    }

    // Helper per parsare numeri (gestisce stringhe, numeri, e formati italiani con virgola)
    function parseNumber(val: unknown): number | null {
      if (val === null || val === undefined) return null
      if (typeof val === "number") return val
      if (typeof val === "string") {
        // Rimuovi simboli valuta e spazi
        let cleaned = val.replace(/[€$\s]/g, "").trim()
        // Gestisci formato italiano: 1.234,56 -> 1234.56
        if (cleaned.includes(",") && cleaned.includes(".")) {
          // Formato 1.234,56 (italiano)
          cleaned = cleaned.replace(/\./g, "").replace(",", ".")
        } else if (cleaned.includes(",")) {
          // Solo virgola come decimale: 1234,56
          cleaned = cleaned.replace(",", ".")
        }
        const num = parseFloat(cleaned)
        return isNaN(num) ? null : num
      }
      return null
    }

    // Helper per parsare date (gestisce vari formati)
    function parseDate(val: unknown): string | null {
      if (!val || typeof val !== "string") return null
      // Se già in formato ISO YYYY-MM-DD
      if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return val
      // Formato DD/MM/YYYY o DD-MM-YYYY
      const match = val.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/)
      if (match) {
        const [, d, m, y] = match
        return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`
      }
      return null
    }

    console.log("[v0] AI parsed response:", JSON.stringify(parsed, null, 2))

    // Normalizza i dati
    const result = {
      invoice_number: typeof parsed.invoice_number === "string" ? parsed.invoice_number : null,
      issue_date: parseDate(parsed.issue_date),
      supplier_name: typeof parsed.supplier_name === "string" ? parsed.supplier_name : null,
      customer_name: typeof parsed.customer_name === "string" ? parsed.customer_name : null,
      subtotal: parseNumber(parsed.subtotal),
      tax_rate: parseNumber(parsed.tax_rate),
      tax: parseNumber(parsed.tax),
      total: parseNumber(parsed.total),
    }

    console.log("[v0] Normalized result:", JSON.stringify(result, null, 2))

    return NextResponse.json({ success: true, data: result })
  } catch (err) {
    console.error("[v0] PDF parse error:", err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Errore durante l'analisi del PDF" },
      { status: 500 }
    )
  }
}
