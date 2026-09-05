import type { ProcedureStatus, Risk } from "@/lib/pms/shadow/procedures"

export type ReviewStatus = "pending" | "approved" | "rejected"

export interface ProcedureKnowledgeInput {
  occurrences: number
  autonomy_threshold: number
  review_status: ReviewStatus
  status: ProcedureStatus
  risk: Risk
}

export interface PmsKnowledgeCoverage {
  unknownPercent: number
  knownPercent: number
  sample: "empty" | "partial" | "sufficient"
  observedProcedures: number
  approvedProcedures: number
  pendingProcedures: number
  rejectedProcedures: number
}

/**
 * Misura la conoscenza OSSERVATA del PMS, non la percentuale assoluta delle
 * funzioni offerte dal gestionale (dato che il PMS non espone un catalogo
 * universale di tutte le operazioni possibili).
 *
 * Ogni procedura contribuisce in base a due evidenze:
 * - ripetizione: fino alla soglia configurata, che dimostra che non era un caso;
 * - revisione: approvata = 100%, in attesa = 50%, rifiutata = 0%.
 *
 * Le procedure hanno lo stesso peso: una operazione fatta 100 volte non deve
 * nascondere una procedura rara ma ancora sconosciuta.
 */
export function calculatePmsKnowledgeCoverage(procedures: ProcedureKnowledgeInput[]): PmsKnowledgeCoverage {
  if (procedures.length === 0) {
    return {
      unknownPercent: 100,
      knownPercent: 0,
      sample: "empty",
      observedProcedures: 0,
      approvedProcedures: 0,
      pendingProcedures: 0,
      rejectedProcedures: 0,
    }
  }

  let total = 0
  let approved = 0
  let pending = 0
  let rejected = 0

  for (const procedure of procedures) {
    const threshold = Math.max(1, procedure.autonomy_threshold || 1)
    const repetition = Math.min(1, Math.max(0, procedure.occurrences) / threshold)
    const reviewFactor = procedure.review_status === "approved" ? 1 : procedure.review_status === "pending" ? 0.5 : 0

    total += repetition * reviewFactor
    if (procedure.review_status === "approved") approved += 1
    else if (procedure.review_status === "rejected") rejected += 1
    else pending += 1
  }

  const knownPercent = Math.max(0, Math.min(100, Math.round((total / procedures.length) * 100)))
  const evidenceAtThreshold = procedures.filter((p) => p.occurrences >= Math.max(1, p.autonomy_threshold || 1)).length
  const sample = procedures.length >= 5 && evidenceAtThreshold >= Math.ceil(procedures.length / 2) ? "sufficient" : "partial"

  return {
    unknownPercent: 100 - knownPercent,
    knownPercent,
    sample,
    observedProcedures: procedures.length,
    approvedProcedures: approved,
    pendingProcedures: pending,
    rejectedProcedures: rejected,
  }
}

export interface DailyObservedTrace {
  id: string
  procedure_id: string | null
  operator_label: string | null
  steps_count: number
  ended_at: string | null
  procedure?: { title?: string | null; review_status?: ReviewStatus | null; risk?: Risk | null } | null
}

export interface DailyPmsActivity {
  key: string
  title: string
  operator: string
  occurrences: number
  steps: number
  lastAt: string | null
  reviewStatus: ReviewStatus | null
  risk: Risk | null
}

export function aggregateDailyPmsActivities(rows: DailyObservedTrace[]): DailyPmsActivity[] {
  const byKey = new Map<string, DailyPmsActivity>()

  for (const row of rows) {
    const operator = row.operator_label?.trim() || "Operatore non identificato"
    const key = `${row.procedure_id ?? row.id}|${operator}`
    const current = byKey.get(key)
    const title = row.procedure?.title?.trim() || `Sequenza PMS (${Math.max(0, row.steps_count)} passi)`

    if (!current) {
      byKey.set(key, {
        key,
        title,
        operator,
        occurrences: 1,
        steps: Math.max(0, row.steps_count),
        lastAt: row.ended_at,
        reviewStatus: row.procedure?.review_status ?? null,
        risk: row.procedure?.risk ?? null,
      })
      continue
    }

    current.occurrences += 1
    current.steps += Math.max(0, row.steps_count)
    if (row.ended_at && (!current.lastAt || row.ended_at > current.lastAt)) current.lastAt = row.ended_at
  }

  return [...byKey.values()].sort((a, b) => (b.lastAt ?? "").localeCompare(a.lastAt ?? ""))
}
