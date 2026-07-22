import { type NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { isDevAuthAsync } from "@/lib/env/dev-auth"
import { generateText } from "ai"
import { gateway } from "@ai-sdk/gateway"

export const maxDuration = 60

async function assertSuperAdmin(): Promise<NextResponse | null> {
  if (await isDevAuthAsync()) return null
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle()
  if (profile?.role !== "super_admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  return null
}

async function pdfToText(data: Uint8Array): Promise<string> {
  const { extractText } = await import("unpdf")
  const result = await extractText(data)
  if (Array.isArray(result.text)) return result.text.join("\n")
  return typeof result.text === "string" ? result.text : String(result.text || "")
}

async function spreadsheetToText(data: Uint8Array): Promise<string> {
  const XLSX = await import("xlsx")
  const wb = XLSX.read(data, { type: "array" })
  const out: string[] = []
  for (const name of wb.SheetNames) {
    const sheet = wb.Sheets[name]
    out.push(XLSX.utils.sheet_to_csv(sheet))
  }
  return out.join("\n")
}

interface ParsedEntry {
  date: string | null
  amount: number | null
  sender: string | null
  description: string | null
}

/**
 * POST /api/superadmin/payments/parse-statement
 * Riceve un estratto conto (PDF / CSV / Excel) come FormData "file".
 * Estrae il testo e usa un LLM per restituire SOLO le entrate (accrediti):
 * data, importo, mittente, descrizione. Le uscite vengono ignorate.
 */
export async function POST(req: NextRequest) {
  const forbidden = await assertSuperAdmin()
  if (forbidden) return forbidden

  let file: File | null = null
  try {
    const fd = await req.formData()
    file = fd.get("file") as File | null
  } catch {
    return NextResponse.json({ error: "FormData non valido" }, { status: 400 })
  }
  if (!file) return NextResponse.json({ error: "File richiesto" }, { status: 400 })

  const buf = new Uint8Array(await file.arrayBuffer())
  const name = (file.name || "").toLowerCase()
  const isPdf = file.type === "application/pdf" || name.endsWith(".pdf")
  const isSheet =
    name.endsWith(".csv") ||
    name.endsWith(".xls") ||
    name.endsWith(".xlsx") ||
    file.type.includes("spreadsheet") ||
    file.type.includes("excel") ||
    file.type === "text/csv"

  let rawText = ""
  try {
    if (isPdf) rawText = await pdfToText(buf)
    else if (isSheet) rawText = await spreadsheetToText(buf)
    else return NextResponse.json({ error: "Formato non supportato. Usa PDF, CSV o Excel." }, { status: 400 })
  } catch (err) {
    console.error("[v0] parse-statement extract error:", err)
    return NextResponse.json({ error: "Impossibile leggere il file" }, { status: 422 })
  }

  if (!rawText || rawText.trim().length < 10) {
    return NextResponse.json({ error: "File vuoto o non leggibile" }, { status: 422 })
  }

  const truncated = rawText.substring(0, 16000)

  let text: string
  try {
    const res = await generateText({
      model: gateway("google/gemini-2.5-flash"),
      prompt: `Sei un assistente contabile. Analizza il seguente estratto conto bancario italiano ed estrai ESCLUSIVAMENTE le ENTRATE (accrediti / importi positivi ricevuti). IGNORA tutte le uscite, addebiti, spese, commissioni, prelievi e importi negativi.

ESTRATTO CONTO:
${truncated}

Restituisci SOLO un array JSON. Ogni elemento è un'entrata con questi campi:
[
  {
    "date": "data dell'operazione in formato YYYY-MM-DD",
    "amount": importo accreditato come numero positivo (senza simbolo €),
    "sender": "nome di chi ha effettuato il pagamento / ordinante / mittente, se presente",
    "description": "causale / descrizione dell'operazione"
  }
]

REGOLE:
- SOLO entrate/accrediti. Nessuna uscita.
- "amount" deve essere un numero positivo (es. 1250.50).
- Se il mittente non è chiaro, usa null per "sender" ma includi comunque l'entrata.
- date in formato ISO YYYY-MM-DD.
- Rispondi SOLO con l'array JSON, senza markdown e senza spiegazioni. Se non ci sono entrate, rispondi [].`,
    })
    text = res.text
  } catch (err) {
    console.error("[v0] parse-statement AI error:", err)
    return NextResponse.json({ error: "Errore durante l'analisi AI" }, { status: 502 })
  }

  let parsed: unknown
  try {
    const jsonStr = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim()
    parsed = JSON.parse(jsonStr)
  } catch {
    console.error("[v0] parse-statement bad AI JSON:", text.slice(0, 500))
    return NextResponse.json({ error: "Risposta AI non interpretabile" }, { status: 422 })
  }

  const arr: ParsedEntry[] = Array.isArray(parsed) ? (parsed as ParsedEntry[]) : []

  function normAmount(v: unknown): number | null {
    if (typeof v === "number" && Number.isFinite(v)) return Math.abs(v)
    if (typeof v === "string") {
      let c = v.replace(/[€$\s]/g, "").trim()
      if (c.includes(",") && c.includes(".")) c = c.replace(/\./g, "").replace(",", ".")
      else if (c.includes(",")) c = c.replace(",", ".")
      const n = Number.parseFloat(c)
      return Number.isFinite(n) ? Math.abs(n) : null
    }
    return null
  }
  function normDate(v: unknown): string | null {
    if (typeof v !== "string") return null
    const t = v.trim()
    if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t
    const m = t.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/)
    if (m) {
      let [, d, mo, y] = m
      if (y.length === 2) y = `20${y}`
      return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`
    }
    return null
  }

  const entries = arr
    .map((e) => ({
      date: normDate(e?.date),
      amount: normAmount(e?.amount),
      sender: typeof e?.sender === "string" && e.sender.trim() ? e.sender.trim() : null,
      description: typeof e?.description === "string" && e.description.trim() ? e.description.trim() : null,
    }))
    .filter((e) => e.amount !== null && e.amount > 0)

  return NextResponse.json({ entries, count: entries.length })
}
