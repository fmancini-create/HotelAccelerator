/**
 * POST /api/ai-report/generate
 *
 * Genera un rapporto AI sull'andamento prenotazioni di un hotel su un range di
 * date scelto dall'utente, con confronto opzionale (anno precedente, periodo
 * precedente, o entrambi).
 *
 * Risposta: text/plain con questo formato:
 *
 *   <JSON aggregati>
 *   ---REPORT---
 *   <testo AI in streaming>
 *
 * La prima riga e' il summary numerico completo (KPI box + dettagli tabellari)
 * cosi' la UI puo' mostrare i numeri immediatamente. La parte dopo ---REPORT---
 * e' il testo narrativo del modello, che si scrive in tempo reale.
 *
 * Modello: openai/gpt-5-mini via Vercel AI Gateway (zero config, no API key
 * da chiedere all'utente). Costo per report ~ €0.001-0.003.
 */

import { createClient, createServiceRoleClient } from "@/lib/supabase/server"
import { generateText, streamText } from "ai"
import { NextRequest, NextResponse } from "next/server"
import {
  aggregateBookingsForRange,
  pctDelta,
  shiftRangePeriodBefore,
  shiftRangeYearAgo,
  type AggregateSummary,
  type DateMode,
} from "@/lib/ai-report/aggregate"

export const dynamic = "force-dynamic"
export const maxDuration = 60

interface RequestBody {
  hotelId: string
  from: string // YYYY-MM-DD
  to: string
  dateMode: DateMode
  compareYoY?: boolean
  comparePeriodBefore?: boolean
}

export async function POST(request: NextRequest) {
  let body: RequestBody
  try {
    body = (await request.json()) as RequestBody
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 })
  }

  const { hotelId, from, to, dateMode } = body
  if (!hotelId || !from || !to || !dateMode) {
    return NextResponse.json(
      { error: "missing_params", required: ["hotelId", "from", "to", "dateMode"] },
      { status: 400 },
    )
  }
  if (dateMode !== "booking" && dateMode !== "stay") {
    return NextResponse.json({ error: "invalid_dateMode", expected: ["booking", "stay"] }, { status: 400 })
  }
  // Sanity check date validi (YYYY-MM-DD)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return NextResponse.json({ error: "invalid_date_format" }, { status: 400 })
  }
  if (from > to) {
    return NextResponse.json({ error: "from_after_to" }, { status: 400 })
  }

  const supabase = await createClient()

  // Auth: l'utente deve essere autenticato + avere accesso a quell'hotel.
  // RLS sulla tabella `bookings` fa il check automaticamente, ma verifichiamo
  // esplicitamente il sessionato per dare un errore chiaro.
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 })
  }
  const userId = user.id

  // Carico il nome hotel per il prompt
  const { data: hotel } = await supabase
    .from("hotels")
    .select("name")
    .eq("id", hotelId)
    .maybeSingle()
  const hotelName = hotel?.name || "Hotel"

  // Aggregazioni: corrente + opzionali (yoy, period prev)
  const current = await aggregateBookingsForRange({ supabase, hotelId, from, to, dateMode })

  let yoy: AggregateSummary | undefined
  if (body.compareYoY) {
    const r = shiftRangeYearAgo(from, to)
    yoy = await aggregateBookingsForRange({ supabase, hotelId, from: r.from, to: r.to, dateMode })
  }

  let prev: AggregateSummary | undefined
  if (body.comparePeriodBefore) {
    const r = shiftRangePeriodBefore(from, to)
    prev = await aggregateBookingsForRange({ supabase, hotelId, from: r.from, to: r.to, dateMode })
  }

  // KPI compatti per la UI: 5 numeri chiave + delta vs confronto attivo (yoy
  // ha precedenza se entrambi sono attivi). I dettagli completi vanno nel
  // blocco "details" cosi la UI puo' mostrare tabelle se vuole.
  const compareForKpi = yoy ?? prev
  const compareLabel = yoy ? "YoY" : prev ? "Periodo prec." : null
  // Diagnostica: se l'utente ha richiesto un confronto ma quel periodo non
  // ha booking (es. Casanova/Bedzzle senza dati storici), il client lo deve
  // mostrare come banner e disabilitare i delta KPI (che sarebbero null
  // ambiguo o 100% irrilevanti).
  const compareDataAvailable = compareForKpi != null && compareForKpi.bookingsCount > 0
  const compareRequested = compareForKpi != null
  const kpiPayload = {
    hotelName,
    range: current.range,
    compareLabel,
    compareRequested,
    compareDataAvailable,
    kpis: {
      revenueTotal: current.revenueTotal,
      revenueDeltaPct: compareForKpi ? pctDelta(current.revenueTotal, compareForKpi.revenueTotal) : null,
      roomNights: current.roomNights,
      roomNightsDeltaPct: compareForKpi ? pctDelta(current.roomNights, compareForKpi.roomNights) : null,
      revpor: current.revpor,
      revporDeltaPct: compareForKpi ? pctDelta(current.revpor, compareForKpi.revpor) : null,
      leadTimeAvgDays: current.leadTimeAvgDays,
      leadTimeDeltaPct:
        compareForKpi && current.leadTimeAvgDays != null && compareForKpi.leadTimeAvgDays != null
          ? pctDelta(current.leadTimeAvgDays, compareForKpi.leadTimeAvgDays)
          : null,
      cancelRatePct: current.cancelRatePct,
      cancelRateDeltaPp:
        compareForKpi != null
          ? Math.round((current.cancelRatePct - compareForKpi.cancelRatePct) * 10) / 10
          : null,
    },
    details: {
      current,
      yoy: yoy ?? null,
      prev: prev ?? null,
    },
  }

  // Diagnostica usabilita' confronti: anche se l'utente ha richiesto YoY,
  // se i dati storici sono assenti (es. Casanova/Bedzzle che ha solo dati
  // da poche settimane) il modello deve dirlo invece di inventare delta.
  const yoyHasData = yoy != null && yoy.bookingsCount > 0
  const prevHasData = prev != null && prev.bookingsCount > 0

  // Costruisco il prompt dell'AI: gli passo SOLO numeri aggregati, mai raw
  // bookings. Dimensione tipica ~3 KB.
  const promptPayload = JSON.stringify(
    {
      hotel: hotelName,
      attuale: summarizeForPrompt(current),
      annoPrecedente: yoy ? { ...summarizeForPrompt(yoy), _datiDisponibili: yoyHasData } : null,
      periodoPrecedente: prev ? { ...summarizeForPrompt(prev), _datiDisponibili: prevHasData } : null,
      _meta: {
        bookingCorrenti: current.bookingsCount,
        confrontiAttivi: {
          annoPrecedente: !!yoy,
          periodoPrecedente: !!prev,
        },
        confrontiUtili: {
          annoPrecedente: yoyHasData,
          periodoPrecedente: prevHasData,
        },
      },
    },
    null,
    2,
  )

  const systemPrompt = buildSystemPrompt(dateMode, !!yoy, !!prev, current.bookingsCount, yoyHasData, prevHasData)

  // Stream AI text con prefisso JSON per i KPI.
  // Uso un ReadableStream custom: prima riga = JSON dei KPI + separatore, poi
  // inoltra textStream del modello.
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        // 1) Prefisso KPI
        controller.enqueue(encoder.encode(JSON.stringify(kpiPayload) + "\n---REPORT---\n"))

        // 2) Stream AI.
        //
        // FIX 30/04/2026 (v3): hotel diversi avevano comportamenti diversi:
        //   - Massabò: tutto OK
        //   - Barronci, Moriano: stream chiudeva con 0 chunk (niente testo)
        //   - Rondini Blu: testo troppo sintetico
        //   - Casanova: dati storici mancanti -> il modello taceva sui confronti
        //
        // Cause individuate:
        //   1. `result.textStream` di AI SDK 6 NON propaga error parts del
        //      provider al loop `for await`: se il modello rifiuta o va in
        //      timeout, il loop termina silenziosamente con 0 chunk. Bisogna
        //      iterare su `result.fullStream` che espone le parti `error`.
        //   2. maxOutputTokens=1800 era troppo basso per coprire 7 sezioni.
        //   3. Il prompt non istruiva a scrivere comunque le sezioni quando
        //      mancano dati (es. 0 booking nel range YoY).
        //
        // Strategia robusta:
        //   a. Usa `fullStream` per catturare error parts.
        //   b. Aumenta budget output a 3500 token.
        //   c. Se 0 chunk al termine, fallback su `generateText` sincrono che
        //      di solito ha success rate maggiore (no streaming overhead).
        //   d. Prompt aggiornato per gestire dati assenti.
        const promptSize = promptPayload.length
        console.log(
          "[ai-report] generating",
          { hotelName, promptBytes: promptSize, dateMode, hasYoy: !!yoy, hasPrev: !!prev,
            curBookings: current.bookingsCount, yoyBookings: yoy?.bookingsCount, prevBookings: prev?.bookingsCount },
        )

        const result = streamText({
          model: "openai/gpt-4o-mini",
          system: systemPrompt,
          prompt: promptPayload,
          temperature: 0.4,
          maxOutputTokens: 3500,
        })

        let chunkCount = 0
        let totalChars = 0
        let providerError: unknown = null
        // Accumulo del testo completo per la persistenza a fine stream.
        // Lo streaming inoltra i delta al client immediatamente; in
        // parallelo li concateniamo per salvare in `ai_reports`.
        let accumulatedText = ""

        // fullStream emette parti tipizzate. text-delta = chunk di testo da
        // inoltrare. error = errore del provider che textStream NASCONDE.
        for await (const part of result.fullStream) {
          if (part.type === "text-delta") {
            // Property name in AI SDK 6 = "text" (gia' decoded delta).
            // Difensivo: prova entrambi (delta legacy + text v6).
            const delta = (part as { text?: string; delta?: string }).text
              ?? (part as { delta?: string }).delta
              ?? ""
            if (delta) {
              chunkCount++
              totalChars += delta.length
              accumulatedText += delta
              controller.enqueue(encoder.encode(delta))
            }
          } else if (part.type === "error") {
            providerError = (part as { error: unknown }).error
            console.error("[ai-report] provider error part:", providerError)
          }
        }

        console.log("[ai-report] stream done", { chunkCount, totalChars, providerError: !!providerError })

        // Fallback: se 0 chunk (Barronci/Moriano case) tento un retry sincrono
        // con generateText. Spesso quando lo streaming fallisce, generateText
        // dello stesso modello completa correttamente.
        if (chunkCount === 0) {
          console.warn("[ai-report] stream produced 0 chunks, falling back to generateText")
          try {
            const fb = await generateText({
              model: "openai/gpt-4o-mini",
              system: systemPrompt,
              prompt: promptPayload,
              temperature: 0.4,
              maxOutputTokens: 3500,
            })
            if (fb.text && fb.text.length > 0) {
              console.log("[ai-report] fallback generateText OK", { chars: fb.text.length })
              accumulatedText = fb.text
              controller.enqueue(encoder.encode(fb.text))
            } else {
              console.error("[ai-report] fallback also empty", { finishReason: fb.finishReason })
              controller.enqueue(
                encoder.encode(
                  `_Il modello non ha prodotto testo (finish: ${fb.finishReason ?? "unknown"}). ` +
                    `Riprova oppure restringi il range di date._`,
                ),
              )
            }
          } catch (fbErr) {
            console.error("[ai-report] fallback generateText failed", fbErr)
            const msg = fbErr instanceof Error ? fbErr.message : "errore sconosciuto"
            controller.enqueue(
              encoder.encode(
                `_Errore generazione (fallback): ${msg}. Riprova tra qualche istante._`,
              ),
            )
          }
        }

        // Persistenza in `ai_reports`: lo facciamo SOLO se abbiamo testo
        // utile (>200 char e non l'errore-fallback). Saltiamo dataset
        // vuoti (0 booking nel range) per non inquinare la storia con
        // "report" privi di valore. Errore non bloccante: il client ha
        // gia' visto il rapporto, l'eventuale fallimento di insert non
        // deve fallire la response.
        if (accumulatedText.length > 200 && current.bookingsCount > 0) {
          try {
            const svc = await createServiceRoleClient()
            const { error: insErr } = await svc.from("ai_reports").insert({
              hotel_id: hotelId,
              user_id: userId,
              hotel_name: hotelName,
              range_from: from,
              range_to: to,
              date_mode: dateMode,
              compare_yoy: !!body.compareYoY,
              compare_period_before: !!body.comparePeriodBefore,
              kpi_payload: kpiPayload,
              report_text: accumulatedText,
            })
            if (insErr) {
              console.error("[ai-report] persist error:", insErr.message)
            } else {
              console.log("[ai-report] persisted", { chars: accumulatedText.length })
            }
          } catch (persErr) {
            console.error("[ai-report] persist exception:", persErr)
          }
        } else {
          console.log("[ai-report] skipping persist", {
            textLen: accumulatedText.length,
            curBookings: current.bookingsCount,
          })
        }

        controller.close()
      } catch (err) {
        console.error("[ai-report] stream error:", err)
        try {
          controller.enqueue(
            encoder.encode(
              `\n\n_Errore durante la generazione del rapporto: ${err instanceof Error ? err.message : "errore sconosciuto"}. Riprova tra qualche istante._`,
            ),
          )
          controller.close()
        } catch {
          /* already closed */
        }
      }
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  })
}

// ──────────────────────────────────────────────────────────────────────────
// Prompt builder
// ──────────────────────────────────────────────────────────────────────────

/**
 * Compatta il summary per il modello: rimuove campi che il prompt non usa
 * ed evita di mandare due rappresentazioni della stessa cosa (revpor==adr).
 */
function summarizeForPrompt(s: AggregateSummary) {
  return {
    range: s.range,
    volumi: {
      prenotazioni: s.bookingsCount,
      cancellazioni: s.cancellationsCount,
      tassoCancellazioniPct: s.cancelRatePct,
      camereNotte: s.roomNights,
      ospitiNotteApprox: s.guestNightsApprox,
    },
    revenue: {
      totaleEur: s.revenueTotal,
      adrEur: s.adr,
    },
    soggiorno: {
      losMedio: s.losAvgDays,
      losMediano: s.losP50,
    },
    pickup: {
      leadMedioGiorni: s.leadTimeAvgDays,
      leadP25: s.leadTimeP25,
      leadP50: s.leadTimeP50,
      leadP75: s.leadTimeP75,
      distribuzione: s.pickupBuckets,
    },
    canali: s.channelMix,
    tariffe: s.rateMix,
    mercati: s.marketMix,
    cancellazioni: {
      leadMedioCancellazioneGiorni: s.cancellationLeadAvgDays,
      perCanale: s.cancellationsByChannel,
    },
  }
}

function buildSystemPrompt(
  dateMode: DateMode,
  hasYoy: boolean,
  hasPrev: boolean,
  curBookings: number,
  yoyHasData: boolean,
  prevHasData: boolean,
): string {
  const dateModeNote =
    dateMode === "booking"
      ? "Il filtro e' BOOKING DATE: i numeri rappresentano cosa abbiamo VENDUTO nel periodo (anche per soggiorni futuri). E' una pickup analysis."
      : "Il filtro e' STAY DATE: i numeri rappresentano cosa abbiamo CONSUNTIVATO (camere effettivamente dormite nel periodo)."

  const compareLines: string[] = []
  if (hasYoy) {
    compareLines.push(
      yoyHasData
        ? "- Confronto YoY (anno precedente, stesso periodo): DATI DISPONIBILI, usalo per ogni metrica."
        : "- Confronto YoY richiesto ma DATI NON DISPONIBILI per il periodo anno-1 (probabilmente l'hotel non era ancora collegato al sistema). Segnalalo ESPLICITAMENTE in 'Quadro generale' con una frase tipo 'Il confronto YoY non e' disponibile: l'hotel non aveva dati sincronizzati a fine $anno_precedente'. NON inventare delta YoY.",
    )
  }
  if (hasPrev) {
    compareLines.push(
      prevHasData
        ? "- Confronto periodo precedente (stessi N giorni precedenti): DATI DISPONIBILI."
        : "- Confronto periodo precedente richiesto ma DATI NON DISPONIBILI. Segnalalo invece di inventare delta.",
    )
  }
  if (compareLines.length === 0) {
    compareLines.push("- Nessun confronto richiesto: analizza solo lo snapshot corrente.")
  }

  // Avviso speciale per dataset molto piccoli: invece di tacere, il modello
  // deve dichiarare che il volume e' troppo basso e adattare il tono delle
  // raccomandazioni (no decisioni big bet su 10 booking).
  const sizeNote =
    curBookings === 0
      ? "ATTENZIONE: il periodo corrente ha 0 prenotazioni nel filtro selezionato. Scrivi un rapporto BREVE che dica chiaramente che non ci sono dati nel periodo, suggerisci all'utente di estendere il range o cambiare il filtro tra 'Data prenotazione' e 'Data soggiorno'."
      : curBookings < 10
        ? `ATTENZIONE: dataset molto piccolo (${curBookings} prenotazioni). Mantieni l'analisi sintetica ma SCRIVI COMUNQUE TUTTE LE SEZIONI con i dati disponibili. Indica esplicitamente che il volume e' basso e i pattern visti sono indicativi, non statisticamente robusti.`
        : `Dataset di ${curBookings} prenotazioni: scrivi tutte le sezioni con il livello di dettaglio appropriato.`

  return `Sei un revenue manager italiano esperto di hotel indipendenti. Il tuo compito e' produrre un rapporto operativo, sintetico e azionabile sull'andamento delle prenotazioni di un hotel.

CONTESTO PERIODO:
- ${dateModeNote}
${compareLines.map((l) => l).join("\n")}
- ${sizeNote}

REGOLE DI SCRITTURA:
- Scrivi in italiano. Tono professionale, diretto, MAI da assistente AI generico ("Certo!", "Spero", "credo che").
- Usa SEMPRE numeri concreti dal payload (non inventare nulla, non arrotondare con cifre tonde di comodo). Se un dato non c'e', DILLO ("dato non disponibile") invece di sorvolare.
- Format: heading markdown ### per le sezioni, frasi corte, bullet con "-".
- Quando confronti, usa la variazione % e l'unita' (es. "+12%, +€34.500"). Se il delta e' tra -3% e +3% scrivi "in linea". Se i dati di confronto NON sono disponibili, NON inventare delta: scrivi "confronto non disponibile per questa metrica".

SEZIONI OBBLIGATORIE — scrivile TUTTE in questo ordine, anche se brevi (2-3 righe ciascuna minimo). Salta una sezione SOLO se l'intero payload non ha proprio nulla da dire (es. mercati con tutti "Sconosciuto"):

### Quadro generale
Riassumi l'andamento: produzione, camere-notte, RevPOR/ADR, lead time medio, tasso cancellazioni. Se i confronti sono attivi citali (con delta o "non disponibile"). Massimo 4 frasi.

### Pickup e finestra di prenotazione
Lead time medio + percentili (P25/P50/P75). Distribuzione bucket (0-7gg, 8-30, 31-60, 61-180, 180+). Indica se il mercato sta prenotando piu' anticipo o piu' last-minute (vs confronto). Se i bucket sono concentrati su un range (es. 70% nel 0-7gg) sottolinealo.

### Mix canali
Top 3 canali per camere-notte con %. Segnala dipendenza da singoli OTA, livello di Diretto, canali emergenti. Se quasi tutto e' un solo canale dillo come rischio.

### Mix tariffe
Top tariffe per camere-notte e revenue. Indica se NR/Non Refundable sta trainando a scapito di BAR (margine vs flessibilita'). Tariffe pochissimo usate vanno menzionate come opportunita' di pulizia.

### Mercati
Top 3 paesi per camere-notte con %. Indica concentrazione/diversificazione. Se il dato e' "Sconosciuto" per la maggioranza, dillo (= problema di import).

### Cancellazioni
Tasso, tempo medio cancellazione (giorni tra cancellazione e check-in originale), canali piu' problematici. Se 0 cancellazioni dillo positivamente.

### Considerazioni operative
3-5 bullet point AZIONABILI (non generici). Esempi BUONI:
- "La quota Booking.com e' al 62% (+8pp YoY), valuta una promo direct -10% per il prossimo trimestre"
- "Lead time sceso a 18gg (-30% YoY), il last-minute sta crescendo: prepara price ladder pre-arrivo"
- "Le cancellazioni sono concentrate su Expedia con tempo medio 5gg, valuta policy piu' restrittive su quel canale"
NIENTE bullet generici tipo "monitorare il mix canali", "ottimizzare la strategia tariffaria" o "valutare i prezzi": vietati.

Inizia direttamente con "### Quadro generale", senza preamboli, senza saluti, senza conclusioni generiche.`
}
