import { type NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { runTrackingForGroup, type TrackingConfigRow } from "@/lib/demand/run"
import { rebuildDemandCalendar } from "@/lib/demand/aggregate"

// Esecuzione periodica dell'estrazione della domanda.
//
// Senza questo, la scheda "Cervello" salvava una configurazione che nessuno
// eseguiva: interruttori che sembrano accesi e non fanno nulla.
//
// Tre limiti, perche' questo cron SPENDE denaro (chiama un modello):
//
//  1. tempo: la funzione ha un tetto di durata e va chiusa prima, non interrotta
//     a metà, altrimenti il calendario resta indietro senza dirlo;
//  2. conversazioni per gruppo: un giro breve che riparte, invece di uno lungo
//     che rischia di morire;
//  3. spesa complessiva: misurato $0,0013 per conversazione, cioe' $4,92 per le
//     3.769 in archivio. Con dieci gruppi abilitati un giro senza tetto
//     moltiplicherebbe quella cifra a ogni passata. Il tetto ferma il giro, non
//     la funzione: quel che resta lo fa il giro dopo.
//
// L'estrazione e' idempotente (indice UNIQUE su conversazione+gruppo+versione e
// controllo di cio' che e' già fatto), quindi fermarsi a metà non perde nulla e
// non fa pagare due volte.

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60

const BUDGET_MS = 50_000
/** Conversazioni per gruppo in un giro. */
const PER_GROUP = 40
/** Tetto di spesa per giro: 50 centesimi. */
const COST_CAP_MICRO_USD = 500_000

export async function GET(request: NextRequest) {
  // Difesa a chiusura, non ad apertura. Lo schema usato dagli altri tre cron
  // (`if (cronSecret) { ...verifica... }`) lascia la rotta APERTA quando la
  // variabile non e' impostata. Su una rotta che chiama un modello a pagamento,
  // aperta significa che un estraneo puo' far spendere denaro chiamandola in
  // continuazione. `CRON_SECRET` ora E' impostata (verificato: la guardia
  // risponde 401 senza segreto e 200 con quello giusto), ma la chiusura resta
  // perche' il giorno in cui la variabile venisse rimossa la rotta deve
  // fermarsi, non spalancarsi.
  //
  // Quindi: senza segreto si passa solo in sviluppo locale, dove la rotta non
  // e' raggiungibile da fuori. In produzione senza segreto si risponde 401 e il
  // motivo e' scritto nella risposta, cosi' il guasto si legge subito invece di
  // sembrare un cron che "non trova lavoro".
  const cronSecret = process.env.CRON_SECRET
  const host = (request.headers.get("host") || "").split(":")[0].trim().toLowerCase()
  const isLocalDev =
    process.env.NODE_ENV === "development" && (host === "localhost" || host === "127.0.0.1")

  if (cronSecret) {
    if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
  } else if (!isLocalDev) {
    console.error("[v0][demand-extract] CRON_SECRET non impostata: rotta chiusa per prudenza")
    return NextResponse.json(
      { error: "CRON_SECRET non impostata: estrazione disattivata" },
      { status: 401 },
    )
  }

  const startedAt = Date.now()
  const supabase = createServiceClient()

  // Solo le configurazioni accese. La colonna e' `is_enabled`: verificata sulla
  // tabella, non dedotta dal nome piu' probabile.
  const { data: configs, error } = await supabase
    .from("group_tracking_configs")
    .select("*")
    .eq("is_enabled", true)
    .order("last_run_at", { ascending: true, nullsFirst: true })

  if (error) {
    console.error("[v0][demand-extract] errore lettura configurazioni:", error.message)
    return NextResponse.json({ error: "Database error" }, { status: 500 })
  }

  const reports: Array<Record<string, unknown>> = []
  const touchedProperties = new Set<string>()
  let spentMicroUsd = 0
  let stopReason: string | null = null

  for (const raw of configs ?? []) {
    if (Date.now() - startedAt >= BUDGET_MS) {
      stopReason = "tempo esaurito"
      break
    }
    if (spentMicroUsd >= COST_CAP_MICRO_USD) {
      stopReason = "tetto di spesa raggiunto"
      break
    }

    const config = raw as unknown as TrackingConfigRow

    // Il nome serve solo alle istruzioni del modello: se manca si continua,
    // perche' un nome assente non e' una ragione per non estrarre.
    const { data: group } = await supabase
      .from("user_groups")
      .select("name")
      .eq("id", config.group_id)
      .maybeSingle()

    try {
      const report = await runTrackingForGroup(supabase, config, group?.name ?? "gruppo", {
        limit: PER_GROUP,
      })
      spentMicroUsd += report.costMicroUsd
      // Si segna la struttura solo se qualcosa e' stato scritto. Segnarla sempre
      // avrebbe ricostruito il calendario a ogni giro anche quando tutte le
      // conversazioni erano gia' state lette: lavoro inutile ogni ora, e con
      // molte strutture il giro sarebbe finito per il tempo invece che per il
      // lavoro svolto. Le chiamate contano quanto le richieste, perche' anche
      // loro finiscono nel calendario.
      if (report.withDemand > 0 || report.calls > 0) touchedProperties.add(config.property_id)
      reports.push({
        gruppo: config.group_id,
        esaminate: report.scanned,
        conRegole: report.byRules,
        conModello: report.byModel,
        giaFatte: report.alreadyDone,
        conDomanda: report.withDemand,
        chiamate: report.calls,
        falliti: report.failed,
        costoUsd: Number((report.costMicroUsd / 1e6).toFixed(4)),
      })
    } catch (err) {
      // Un gruppo che fallisce non deve fermare gli altri: la sua
      // configurazione puo' essere rotta mentre le altre funzionano.
      const message = err instanceof Error ? err.message : String(err)
      console.error("[v0][demand-extract] gruppo", config.group_id, "fallito:", message)
      reports.push({ gruppo: config.group_id, errore: message })
    }
  }

  // Il calendario si ricostruisce DOPO le estrazioni, una volta per struttura:
  // ricostruirlo dentro il ciclo rifarebbe lo stesso lavoro a ogni gruppo.
  const rebuilt: Array<Record<string, unknown>> = []
  for (const propertyId of touchedProperties) {
    try {
      const res = await rebuildDemandCalendar(supabase, propertyId)
      rebuilt.push({ struttura: propertyId, giorni: res.days, estrazioni: res.extractions })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error("[v0][demand-extract] calendario", propertyId, "fallito:", message)
      rebuilt.push({ struttura: propertyId, errore: message })
    }
  }

  return NextResponse.json({
    ok: true,
    configurazioniAttive: configs?.length ?? 0,
    elaborate: reports.length,
    costoTotaleUsd: Number((spentMicroUsd / 1e6).toFixed(4)),
    fermatoPerche: stopReason,
    durataMs: Date.now() - startedAt,
    gruppi: reports,
    calendario: rebuilt,
  })
}
