import { type NextRequest, NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"
import { runTrackingForGroup, type TrackingConfigRow } from "@/lib/demand/run"
import { rebuildDemandCalendar } from "@/lib/demand/aggregate"

// Esecuzione periodica dell'estrazione della domanda.
//
// Senza questo, la scheda "Cervello" salvava una configurazione che nessuno
// eseguiva: interruttori che sembrano accesi e non fanno nulla.
//
// Il lavoro costoso ha tre guardrail: deadline interna prima del timeout
// Vercel, limite di righe per gruppo e tetto di spesa. Le estrazioni sono
// idempotenti e un gruppo fermato avanza comunque il proprio `last_run_at`:
// così il backlog resta riprendibile senza affamare gli altri tenant.
//
// Il calendario materializzato ha inoltre un dirty marker persistente. Se non
// resta tempo per ricostruirlo, il cron successivo lo riprende anche se nel
// frattempo non arriva nessun nuovo messaggio.

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 120

/** La parte AI deve mollare il controllo con margine per rebuild + risposta. */
const EXTRACTION_BUDGET_MS = 70_000
/** Limite complessivo interno, prima del timeout hard di 120s. */
const TOTAL_BUDGET_MS = 108_000
/** Conversazioni/chiamate candidate per gruppo in un giro; la deadline può fermare prima. */
const PER_GROUP = 40
/** Tetto di spesa per giro: 50 centesimi. */
const COST_CAP_MICRO_USD = 500_000
/** Non lasciare che i vecchi rebuild dirty consumino tutta la finestra AI. */
const PRIOR_DIRTY_REBUILD_BUDGET_MS = 20_000

type DirtyRow = { property_id: string; calendar_dirty_at: string | null }

export async function GET(request: NextRequest) {
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
  const extractionDeadlineAt = startedAt + EXTRACTION_BUDGET_MS
  const totalDeadlineAt = startedAt + TOTAL_BUDGET_MS
  const supabase = createServiceClient()

  const [configsResult, dirtyResult] = await Promise.all([
    supabase
      .from("group_tracking_configs")
      .select("*")
      .eq("is_enabled", true)
      .order("last_run_at", { ascending: true, nullsFirst: true }),
    supabase
      .from("group_tracking_configs")
      .select("property_id, calendar_dirty_at")
      .not("calendar_dirty_at", "is", null)
      .order("calendar_dirty_at", { ascending: true }),
  ])

  if (configsResult.error || dirtyResult.error) {
    const error = configsResult.error ?? dirtyResult.error
    console.error("[v0][demand-extract] errore lettura configurazioni:", error?.message)
    return NextResponse.json({ error: "Database error" }, { status: 500 })
  }

  const configs = configsResult.data ?? []
  const reports: Array<Record<string, unknown>> = []
  const rebuilt: Array<Record<string, unknown>> = []
  const deferred = new Set<string>()
  const rebuiltThisRun = new Set<string>()
  let spentMicroUsd = 0
  let stopReason: string | null = null

  async function rebuildAndClear(propertyId: string): Promise<boolean> {
    if (Date.now() >= totalDeadlineAt) {
      deferred.add(propertyId)
      return false
    }

    const rebuildStartedAt = new Date().toISOString()
    try {
      const res = await rebuildDemandCalendar(supabase, propertyId)
      // Non cancellare un marker scritto DURANTE il rebuild: significherebbe
      // dichiarare materializzato un dato che potrebbe essere arrivato dopo la
      // lettura dell'aggregatore.
      const { error: clearError } = await supabase
        .from("group_tracking_configs")
        .update({ calendar_dirty_at: null })
        .eq("property_id", propertyId)
        .not("calendar_dirty_at", "is", null)
        .lte("calendar_dirty_at", rebuildStartedAt)

      if (clearError) throw clearError
      rebuilt.push({ struttura: propertyId, giorni: res.days, estrazioni: res.extractions })
      rebuiltThisRun.add(propertyId)
      deferred.delete(propertyId)
      return true
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error("[v0][demand-extract] calendario", propertyId, "fallito:", message)
      rebuilt.push({ struttura: propertyId, errore: message })
      deferred.add(propertyId)
      return false
    }
  }

  // Recovery prima del nuovo lavoro: una struttura già dirty non deve restare
  // stantia solo perché non riceve altre conversazioni. Deduplichiamo per
  // property perché più gruppi della stessa struttura condividono il calendario.
  const priorDirtyProperties = [
    ...new Set((dirtyResult.data as DirtyRow[]).map((row) => row.property_id).filter(Boolean)),
  ]
  for (const propertyId of priorDirtyProperties) {
    if (Date.now() - startedAt >= PRIOR_DIRTY_REBUILD_BUDGET_MS) {
      deferred.add(propertyId)
      continue
    }
    await rebuildAndClear(propertyId)
  }

  const dirtiedByExtraction = new Set<string>()

  for (const raw of configs) {
    if (Date.now() >= extractionDeadlineAt) {
      stopReason = "tempo estrazione esaurito"
      break
    }
    if (spentMicroUsd >= COST_CAP_MICRO_USD) {
      stopReason = "tetto di spesa raggiunto"
      break
    }

    const config = raw as unknown as TrackingConfigRow
    const { data: group } = await supabase
      .from("user_groups")
      .select("name")
      .eq("id", config.group_id)
      .maybeSingle()

    try {
      const report = await runTrackingForGroup(supabase, config, group?.name ?? "gruppo", {
        limit: PER_GROUP,
        deadlineAt: extractionDeadlineAt,
      })

      // `runTrackingForGroup` aggiorna normalmente last_run_at alla fine. Esiste
      // però un caso limite intenzionale: se la deadline è già scaduta prima o
      // subito dopo il caricamento del set idempotente, il helper restituisce
      // presto per non iniziare altro I/O. Il cron garantisce comunque la
      // rotazione del gruppo così un backlog non monopolizza il primo posto.
      if (report.stoppedForDeadline) {
        const { error: rotationError } = await supabase
          .from("group_tracking_configs")
          .update({ last_run_at: new Date().toISOString() })
          .eq("id", config.id)
          .eq("property_id", config.property_id)
        if (rotationError) throw new Error(`Demand rotation marker: ${rotationError.message}`)
      }

      spentMicroUsd += report.costMicroUsd

      const changedCalendarInputs = report.withDemand > 0 || report.calls > 0
      if (changedCalendarInputs) {
        const dirtyAt = new Date().toISOString()
        const { error: dirtyError } = await supabase
          .from("group_tracking_configs")
          .update({ calendar_dirty_at: dirtyAt })
          .eq("id", config.id)
          .eq("property_id", config.property_id)
        if (dirtyError) throw new Error(`Demand dirty marker: ${dirtyError.message}`)
        dirtiedByExtraction.add(config.property_id)
        deferred.add(config.property_id)
      }

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
        fermatoPerDeadline: report.stoppedForDeadline,
      })

      if (report.stoppedForDeadline) {
        stopReason = "deadline gruppo raggiunta"
        break
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error("[v0][demand-extract] gruppo", config.group_id, "fallito:", message)
      reports.push({ gruppo: config.group_id, errore: message })
    }
  }

  // Prova a materializzare subito ciò che è cambiato in questa passata. Se non
  // resta margine il marker rimane persistente e verrà processato all'inizio del
  // prossimo cron, risolvendo il caso "estrazione salvata ma calendario stale".
  for (const propertyId of dirtiedByExtraction) {
    if (Date.now() >= totalDeadlineAt) {
      deferred.add(propertyId)
      continue
    }
    await rebuildAndClear(propertyId)
  }

  return NextResponse.json({
    ok: true,
    configurazioniAttive: configs.length,
    elaborate: reports.length,
    costoTotaleUsd: Number((spentMicroUsd / 1e6).toFixed(4)),
    fermatoPerche: stopReason,
    durataMs: Date.now() - startedAt,
    gruppi: reports,
    calendario: rebuilt,
    calendariDifferiti: [...deferred],
    calendariRicostruiti: [...rebuiltThisRun],
  })
}
