/**
 * OTA report extractor (PDF + XLSX support)
 * 
 * Extracts KPI snapshots from performance/production reports sent by:
 * - Booking.com Extranet (PDF "Report sull'andamento" + manual Dashboard ranking)
 * - Expedia Partner Central (xlsx/PDF Performance reports)
 * 
 * Uses unpdf + AI SDK 6 structured output with retry for PDFs,
 * and xlsx for Excel files (Expedia's preferred format).
 * 
 * FASE 2 refactor 12/05/2026: parametrized prompt by platform,
 * added xlsx support for Expedia (Partner Central exports are .xlsx by default).
 */

import { generateObject } from "ai"
import { z } from "zod"
import { extractText } from "unpdf"
import * as xlsx from "xlsx"

// gpt-4o-mini era troppo debole per le tabelle Expedia multi-sezione con i
// numeri concatenati senza separatori: scambiava la riga "Fatturato" con le
// "Notti prenotate" (es. 134.659 letto come camere invece che come revenue).
// gpt-4o e' molto piu' affidabile nell'allineare label->riga.
const OPENAI_MODEL = "openai/gpt-4o" as const

// The Zod schema must be strict (no `.default()`) because OpenAI strict mode
// requires all fields to be explicitly included. All fields are nullable to
// handle partial reports (performance-only, production-only, or mixed).
const SchemaKpi = z.object({
  // Period covered by the report (mandatory for all OTA platforms)
  period_start: z.string().nullable().describe("Start date of the period (YYYY-MM-DD)"),
  period_end: z.string().nullable().describe("End date of the period (YYYY-MM-DD)"),
  
  // === Performance Report (traffic/ranking) ===
  search_views: z.number().nullable().describe("Impressions in search results"),
  property_views: z.number().nullable().describe("Property page views"),
  bookings_count: z.number().nullable().describe("Number of bookings"),
  prev_search_views: z.number().nullable().describe("Search views same period last year"),
  prev_property_views: z.number().nullable().describe("Property views same period last year"),
  prev_bookings_count: z.number().nullable().describe("Bookings same period last year"),
  ranking_score: z.number().nullable().describe("Visibility score / search ranking score"),
  ranking_position: z.number().nullable().describe("Position in search vs competitors"),
  total_competitors: z.number().nullable().describe("Total competitors in the market"),
  
  // === Production Report (nights/revenue/ADR) ===
  total_room_nights: z.number().nullable().describe("Total room nights sold"),
  total_revenue: z.number().nullable().describe("Total revenue in EUR"),
  adr: z.number().nullable().describe("Average daily rate (ADR) in EUR"),
  prev_total_room_nights: z.number().nullable().describe("Room nights same period last year"),
  prev_total_revenue: z.number().nullable().describe("Revenue same period last year"),
  prev_adr: z.number().nullable().describe("ADR same period last year"),
  
  // === Monthly breakdown (optional) ===
  monthly_breakdown: z
    .array(
      z.object({
        month: z.string().describe("Month in YYYY-MM format"),
        nights: z.number().nullable().describe("Room nights for the month"),
        adr: z.number().nullable().describe("ADR for the month"),
        revenue: z.number().nullable().describe("Revenue for the month"),
      }),
    )
    .nullable()
    .describe("Month-by-month breakdown if available"),
})

type ExtractedKpi = z.infer<typeof SchemaKpi>

export interface OtaReportExtractorOptions {
  platform: "booking_com" | "expedia"
  fileBuffer: Buffer
  fileName: string
  mimeType?: string
}

export interface OtaReportExtractorResult {
  success: boolean
  data?: ExtractedKpi
  error?: string
  report_type?: "performance" | "production" | "mixed" | null
  /** Plausibility warnings: values that were rejected as physically impossible. */
  warnings?: string[]
}

/**
 * Main entry point: detects file type (PDF vs XLSX) and delegates to the
 * appropriate extractor. Returns the KPI snapshot with period + metrics.
 */
export async function extractOtaReport(
  opts: OtaReportExtractorOptions,
): Promise<OtaReportExtractorResult> {
  try {
    const isPdf = opts.mimeType?.includes("pdf") || opts.fileName.endsWith(".pdf")
    const isXlsx =
      opts.mimeType?.includes("spreadsheet") ||
      opts.mimeType?.includes("excel") ||
      opts.fileName.match(/\.(xlsx|xls)$/i)
    const isImage =
      opts.mimeType?.startsWith("image/") ||
      /\.(png|jpe?g|webp|gif|heic|heif)$/i.test(opts.fileName)

    if (isPdf) {
      return await extractFromPdf(opts)
    } else if (isXlsx) {
      return await extractFromXlsx(opts)
    } else if (isImage) {
      return await extractFromImage(opts)
    } else {
      return {
        success: false,
        error: `Tipo file non supportato: ${opts.mimeType || opts.fileName}. Carica un PDF, un file Excel (.xlsx) o uno screenshot (PNG/JPG).`,
      }
    }
  } catch (err) {
    console.error("[ota-report-extractor] Fatal error", err)
    return {
      success: false,
      error: err instanceof Error ? err.message : "Errore sconosciuto durante l'estrazione",
    }
  }
}

/**
 * PDF extraction flow: unpdf → truncate → AI structured output.
 * Works for both Booking.com and Expedia (prompt is parametrized).
 */
async function extractFromPdf(
  opts: OtaReportExtractorOptions,
): Promise<OtaReportExtractorResult> {
  // unpdf requires Uint8Array (not Node Buffer directly because of instanceof checks).
  const uint8 = new Uint8Array(opts.fileBuffer)
  const { text: rawText } = await extractText(uint8, { mergePages: true })
  
  // AI model has token limits: cap at ~20k chars (fits gpt-4o-mini context window comfortably).
  const text = rawText.slice(0, 20_000)

  const platformLabel = opts.platform === "expedia" ? "Expedia Partner Central" : "Booking.com Extranet"
  const prompt = buildPrompt(platformLabel, text)

  const { object: data } = await generateObject({
    model: OPENAI_MODEL,
    schema: SchemaKpi,
    prompt,
    maxRetries: 1,
  })

  // Reject physically-impossible values before anything downstream uses them.
  const warnings = sanitizeExtractedKpi(data)

  // Derive missing period from monthly_breakdown if the LLM failed to extract the header dates.
  derivePeriodFromBreakdown(data)

  // Classify the report type by looking at which fields are populated.
  const reportType = classifyReportType(data)

  return {
    success: true,
    data,
    report_type: reportType,
    warnings,
  }
}

/**
 * XLSX extraction flow: xlsx.read() → sheet_to_json() → concat all cells → AI structured output.
 * Expedia Partner Central exports performance/production reports as .xlsx by default.
 */
async function extractFromXlsx(
  opts: OtaReportExtractorOptions,
): Promise<OtaReportExtractorResult> {
  const workbook = xlsx.read(opts.fileBuffer, { type: "buffer" })
  
  // Concat all sheets into a single text block: for multi-sheet reports
  // (e.g. Expedia's "Summary" + "Monthly Details") we want the AI to see everything.
  let text = ""
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName]
    const jsonRows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: "" })
    text += `\n\n=== SHEET: ${sheetName} ===\n`
    text += jsonRows.map((row: any) => (row as any[]).join("\t")).join("\n")
  }

  // Truncate for AI model (xlsx can be large with 1000s of rows if historical data is included).
  text = text.slice(0, 20_000)

  const platformLabel = opts.platform === "expedia" ? "Expedia Partner Central" : "Booking.com Extranet"
  const prompt = buildPrompt(platformLabel, text)

  const { object: data } = await generateObject({
    model: OPENAI_MODEL,
    schema: SchemaKpi,
    prompt,
    maxRetries: 1,
  })

  const warnings = sanitizeExtractedKpi(data)
  derivePeriodFromBreakdown(data)
  const reportType = classifyReportType(data)

  return {
    success: true,
    data,
    report_type: reportType,
    warnings,
  }
}

/**
 * IMAGE (screenshot) extraction flow: pass the picture straight to the
 * multimodal model (gpt-4o) via a vision message. Used for the Expedia
 * "Dati e informazioni" dashboard, which has NO export button — the user
 * screenshots the traffic/visibility cards (Entrate, Tasso di conversione,
 * Visite della pagina, Notti prenotate, ranking) and, if the "vs. anno scorso"
 * toggle is on, the "Scorso anno" comparison values too.
 */
async function extractFromImage(
  opts: OtaReportExtractorOptions,
): Promise<OtaReportExtractorResult> {
  const platformLabel = opts.platform === "expedia" ? "Expedia Partner Central" : "Booking.com Extranet"
  const prompt = buildPrompt(platformLabel, "", { sourceIsImage: true })
  const mediaType = opts.mimeType?.startsWith("image/") ? opts.mimeType : "image/png"

  const { object: data } = await generateObject({
    model: OPENAI_MODEL,
    schema: SchemaKpi,
    maxRetries: 1,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          { type: "image", image: opts.fileBuffer, mediaType },
        ],
      },
    ],
  })

  const warnings = sanitizeExtractedKpi(data)
  derivePeriodFromBreakdown(data)
  const reportType = classifyReportType(data)

  return {
    success: true,
    data,
    report_type: reportType,
    warnings,
  }
}

/**
 * Builds the AI prompt, parametrized by platform.
 * 
 * Both Booking and Expedia have similar structure (performance vs production reports),
 * but column names / terminology differ. The generic prompt covers both.
 */
function buildPrompt(platformLabel: string, text: string, opts?: { sourceIsImage?: boolean }): string {
  const sourceIsImage = opts?.sourceIsImage ?? false
  return `You are an expert data extraction agent for hotel revenue management systems.

Extract KPIs from the following ${platformLabel} report. The report may contain:

**Performance metrics** (search impressions, property views, bookings, conversion rates, ranking/visibility scores)
**Production metrics** (room nights, revenue, ADR, year-over-year comparisons, monthly breakdown)

Some reports contain only performance, some only production, and some contain both (mixed).

**Output requirements:**
- period_start and period_end: YYYY-MM-DD format (mandatory)
- All numeric fields: extract as numbers (remove currency symbols, percentage signs, thousand separators)
- NUMBER FORMAT: detect the separator style from context, do not assume.
  - Expedia PDF exports typically use US format: comma = thousands, dot = decimals
    (e.g. "134,659" means 134659, "1,242" means 1242, "20.6k" means 20600).
  - Italian format uses dot = thousands, comma = decimals (e.g. "1.234,56" = 1234.56).
  - Use the magnitude to disambiguate (a monthly hotel revenue of "1,242" is 1242 EUR,
    not 1.242). When genuinely ambiguous, prefer the value that is internally
    consistent with the row/column totals.
- For YoY comparisons: extract both current period and "same period last year" values
- monthly_breakdown: if present, extract each row with month in YYYY-MM format + nights/ADR/revenue
- Leave fields as null if not present in the report

**Platform-specific notes:**
- ${platformLabel} reports may use terms like:
  - "Visualizzazioni ricerca" / "Visualizzazioni nelle ricerche" / "Search impressions" → search_views
  - "Visualizzazioni struttura" / "Visite della pagina" / "Property views" / "Page views" → property_views
  - "Prenotazioni" / "Bookings" → bookings_count
  - "Punteggio ranking" / "Visibility score" → ranking_score
  - "Posizionamento medio" / "Average position" / "Ranking position" → ranking_position
  - "Notti" / "Notti prenotate" / "Notti prenotate hotel" / "Numero netto di notti" / "Room nights" → total_room_nights
  - "Ricavi" / "Entrate" / "Fatturato" / "Fatturato dell'hotel" / "Revenue" / "Total revenue" → total_revenue
  - "ADR" / "Tariffa giornaliera media" / "Tariffa giornaliera media (ADR)" / "Tariffa media giornaliera" → adr
- For the year-over-year values (prev_*), ${platformLabel} labels them
  "Scorso anno" / "vs. anno scorso" / "rispetto all'anno scorso" / "Stesso periodo dello scorso anno".

**CRITICAL — ignore percentage-only tables:**
Some ${platformLabel} views (e.g. the Italian "Flash Report su base annua") show
ONLY percentage variations like "-3,34%", "+30,1%" with a green/red arrow and NO
absolute value. These are variations, NOT metrics. NEVER treat a percentage as the
metric value. Only extract a field when an ABSOLUTE number is present (e.g.
"Entrate 58.702 €", "Notti prenotate 306", "ADR 229 EUR"). If a metric appears only
as a percentage change, leave that field null.

**CRITICAL — realized data only, never forecasts or competitors:**
A multi-section ${platformLabel} export may mix realized and non-realized data. You MUST:
- Extract ONLY realized/actual figures for THIS hotel.
- IGNORE forecast/future sections: "Produzione soggiorni futuri", "soggiorni futuri",
  "previsti", "effettivi e previsti" (when a value blends actual+forecast), "prossima
  settimana", "prossime 4 settimane", "prossimi 12 mesi". These are projections, NOT KPIs.
- IGNORE all competitor columns/rows: "concorrenza", "concorrenti", "strutture
  concorrenti", "quota equa", "quota di mercato". Never map these to the hotel metrics.
- IGNORE distribution/trend breakdowns ("Tendenze di prenotazione", origin by country,
  brand mix, device, day-of-week): they are percentages, not absolute KPIs.
- Prefer a clearly-labelled realized summary such as the "Totale" column of a realized
  production table (e.g. "Produzione prenotazioni" over the last N days, or the actual
  months of "Soggiorni mensili").

**CRITICAL — never invent a number:**
PDF text extraction can run adjacent table numbers together WITHOUT separators
(e.g. "9001,2424,63310,410..."). If you cannot split a run of digits into
UNAMBIGUOUS values, DO NOT guess: leave that field (or that monthly row) null.
It is REQUIRED to return null rather than a plausible-but-uncertain number.
Prefer values that are explicitly labelled (next to a clear label like "Totale",
"Entrate", "Notti prenotate", "ADR") over values you would have to infer by
splitting a concatenated string.

**CRITICAL — Expedia "Soggiorni mensili" table row mapping (DO NOT MIX ROWS):**
This table stacks THREE separate metric blocks, each with monthly columns
(gen…dic) and a final "Totale" column. Map them to the RIGHT field:
- Block "Fatturato" → row "2026 (effettivi e previsti)" is REVENUE in EUR
  (e.g. "…1,2020 134,659" → total_revenue = 134659). This is NOT room nights.
- Block "Notti prenotate" → use ONLY its "Totale" sub-row (e.g. "…8 0 700" →
  total_room_nights = 700). Do NOT use "Solo hotel"/"Pacchetto" sub-rows for the total.
- Block "ADR (Tariffa giornaliera media)" → row "Tariffa giornaliera media (ADR)"
  (e.g. "…183 0 235" → adr = 235).
So for THIS hotel a whole year is on the order of a few HUNDRED room nights, tens
to hundreds of thousands EUR revenue, and ADR in the low hundreds of EUR.
NEVER put the Fatturato figure into total_room_nights. NEVER compute a value by
multiplying nights × ADR — only read revenue directly from the Fatturato row.
For monthly_breakdown, take nights from the "Notti prenotate → Totale" monthly
cells, revenue from the "Fatturato" monthly cells, and adr from the "ADR" row.
IGNORE the "% growth" rows ("Crescita annuale…"), "Promozioni", "Quota equa/
mercato", and "2025 (intero anno)"/"2025 (reale…)" (those are prev-year → only
use them for the prev_* fields if clearly the same-period comparison).

${
  sourceIsImage
    ? `**SOURCE IS A SCREENSHOT (image attached):**
This is a screenshot of the ${platformLabel} "Dati e informazioni" dashboard (or a
Performance page). Read the metric CARDS. Typical cards and their mapping:
- "Entrate" / "Revenue" (a € amount) → total_revenue
- "Visite della pagina" / "Visite pagina" → property_views
- "Visualizzazioni nelle ricerche" → search_views
- "Prenotazioni" → bookings_count
- "Notti prenotate" → total_room_nights
- "Tariffa giornaliera media" / "ADR" → adr
- "Posizionamento medio" → ranking_position
Each card may show a smaller line "Scorso anno: X" (or a "vs. anno scorso"
comparison): put THAT value into the matching prev_* field. The big number is the
CURRENT period; "Scorso anno" is the prev_* value.

PERIOD (very important): today's date is ${new Date().toISOString().slice(0, 10)}.
Determine period_start and period_end like this, in order of preference:
1. If the top filter shows an explicit date range, use it.
2. OTHERWISE read the DATE AXIS of the trend charts: the cards' little line charts
   have a start label on the left and an end label on the right (e.g. "9 apr" …
   "6 lug"). These ARE the exact period boundaries even when the top filter only
   says a relative range like "Soggiorni, ultimi 90 giorni". Use the EARLIEST
   left-axis label as period_start and the LATEST right-axis label as period_end.
   The axis labels usually omit the year: infer the year from today's date (the
   range ends on or just before today, and spans roughly the stated number of
   days). Example: with a "ultimi 90 giorni" filter and axis "9 apr → 6 lug" and
   today ${new Date().toISOString().slice(0, 10)}, that is this year's
   April 9 → July 6.
Only leave period_start/period_end null if NEITHER a filter range NOR chart axis
dates are legible.
Read metric VALUES only from the big card numbers, NOT from the chart lines — but
you MAY read the chart's date-axis labels to establish the period as described.
"Tasso di conversione" is a percentage — there is no field for it, ignore it.`
    : `Report content:\n${text}`
}

Extract the KPI data now.`
}

/**
 * Physical-plausibility guard. A single hotel property has hard physical limits:
 * room nights are bounded by rooms×days, and a nightly rate (ADR) can't be
 * astronomically high. When the LLM mis-maps a table row (classic case: the
 * Expedia "Fatturato"/revenue row read as room nights → "134.659 camere"), the
 * value is physically impossible. Per the "dati certi" rule we NEVER show a fake
 * KPI: we reject the impossible value (set null) and record a warning so the UI
 * can ask the user to verify or enter it manually. We do NOT try to guess the
 * correct value (that would be inventing data).
 */
function sanitizeExtractedKpi(data: ExtractedKpi): string[] {
  const warnings: string[] = []

  // Even a very large single property (a few hundred rooms) tops out well under
  // this over the course of a year (e.g. 200 rooms × 365 = 73k). OTA reports are
  // per-property, so anything above this is not room nights.
  const NIGHTS_YEAR_CEILING = 80_000
  const NIGHTS_MONTH_CEILING = 12_000
  const ADR_CEILING = 10_000 // EUR/night

  if (data.total_room_nights != null && data.total_room_nights > NIGHTS_YEAR_CEILING) {
    warnings.push(
      `Notti totali implausibili (${data.total_room_nights}): valore scartato. Probabile riga sbagliata nel report (es. fatturato letto come notti). Verifica o inserisci a mano.`,
    )
    data.total_room_nights = null
  }
  if (data.prev_total_room_nights != null && data.prev_total_room_nights > NIGHTS_YEAR_CEILING) {
    data.prev_total_room_nights = null
  }
  if (data.adr != null && (data.adr <= 0 || data.adr > ADR_CEILING)) {
    warnings.push(`ADR implausibile (${data.adr}): valore scartato.`)
    data.adr = null
  }
  if (data.prev_adr != null && (data.prev_adr <= 0 || data.prev_adr > ADR_CEILING)) {
    data.prev_adr = null
  }
  if (data.total_revenue != null && data.total_revenue < 0) data.total_revenue = null

  // Monthly breakdown: drop physically-impossible per-month cells (don't nuke the
  // whole array — keep the rows that are plausible).
  if (Array.isArray(data.monthly_breakdown)) {
    for (const m of data.monthly_breakdown) {
      if (m.nights != null && (m.nights < 0 || m.nights > NIGHTS_MONTH_CEILING)) {
        m.nights = null
      }
      if (m.adr != null && (m.adr <= 0 || m.adr > ADR_CEILING)) m.adr = null
      if (m.revenue != null && m.revenue < 0) m.revenue = null
    }
  }

  if (warnings.length > 0) {
    console.warn("[ota-report-extractor] plausibility warnings:", warnings)
  }
  return warnings
}

/**
 * If the LLM failed to extract period_start/period_end from the header,
 * but we have monthly_breakdown data, derive the period from the first and last month.
 */
function derivePeriodFromBreakdown(data: ExtractedKpi): void {
  if (
    (!data.period_start || !data.period_end) &&
    Array.isArray(data.monthly_breakdown) &&
    data.monthly_breakdown.length > 0
  ) {
    const sorted = data.monthly_breakdown
      .filter((m) => m.month)
      .map((m) => m.month!)
      .sort()
    if (sorted.length > 0) {
      const first = sorted[0]
      const last = sorted[sorted.length - 1]
      if (!data.period_start) data.period_start = `${first}-01`
      if (!data.period_end) {
        const [y, m] = last.split("-").map(Number)
        const lastDay = new Date(Date.UTC(y, m, 0)).getDate()
        data.period_end = `${last}-${String(lastDay).padStart(2, "0")}`
      }
    }
  }
}

/**
 * Classifies the report type based on which fields are populated:
 * - performance: has search_views / property_views / bookings_count
 * - production: has total_revenue / total_room_nights / adr
 * - mixed: has both
 * - null: neither (rare, happens when AI extraction fails completely)
 */
function classifyReportType(
  data: ExtractedKpi,
): "performance" | "production" | "mixed" | null {
  const hasPerformance =
    data.search_views != null || data.property_views != null || data.bookings_count != null
  const hasProduction =
    data.total_revenue != null || data.total_room_nights != null || data.adr != null
  if (hasPerformance && hasProduction) return "mixed"
  if (hasPerformance) return "performance"
  if (hasProduction) return "production"
  return null
}
