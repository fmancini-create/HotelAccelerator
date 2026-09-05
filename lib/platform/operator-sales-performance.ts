import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

export type OperatorSalesPerformance = {
  closedDeals30: number
  closedDealsMissingValue30: number
  closedRevenueCents30: number
  quotesSent30: number
  quotesSentToday: number
  completedCalls30: number | null
  completedCallsToday: number | null
  completedTasks30: number | null
  completedTasksToday: number | null
  conversionRate30: number | null
  conversionRateToday: number | null
}

type SalesRow = {
  quote_sent_at: string | null
  closed_at: string | null
  amount_cents: number | null
}

type OperatorSalesOptions = {
  includeCalls?: boolean
  includeTasks?: boolean
}

function atOrAfter(value: string | null, startMs: number): boolean {
  if (!value) return false
  const time = Date.parse(value)
  return Number.isFinite(time) && time >= startMs
}

function conversionRate(rows: SalesRow[], startMs: number): number | null {
  // Cohort: fra i preventivi attribuiti e inviati nel periodo, quanti risultano
  // poi chiusi vinti. In questo modo il rapporto non può superare il 100% anche
  // quando una vendita chiusa oggi deriva da un preventivo più vecchio.
  const quoted = rows.filter((row) => atOrAfter(row.quote_sent_at, startMs))
  if (quoted.length === 0) return null
  const won = quoted.filter((row) => Boolean(row.closed_at)).length
  return Math.round((won / quoted.length) * 100)
}

async function exactCount(query: any): Promise<number> {
  const result = await query
  if (result.error) throw result.error
  return result.count ?? 0
}

export async function computeOperatorSalesPerformance(
  sb: SupabaseClient,
  propertyId: string,
  userId: string,
  workdayStartIso: string,
  rollingStartIso: string,
  options: OperatorSalesOptions = {},
): Promise<OperatorSalesPerformance> {
  const workdayStartMs = Date.parse(workdayStartIso)
  const rollingStartMs = Date.parse(rollingStartIso)

  const salesPromise = sb
    .from("crm_operator_sales_attributions")
    .select("quote_sent_at,closed_at,amount_cents")
    .eq("property_id", propertyId)
    .eq("user_id", userId)
    .eq("verification_status", "confirmed")
    .or(`quote_sent_at.gte.${rollingStartIso},closed_at.gte.${rollingStartIso}`)
    .limit(5000)

  const calls30Promise = options.includeCalls
    ? exactCount(
        sb
          .from("phone_calls")
          .select("id", { count: "exact", head: true })
          .eq("property_id", propertyId)
          .eq("user_id", userId)
          .eq("status", "completed")
          .gte("started_at", rollingStartIso),
      )
    : Promise.resolve(null)
  const callsTodayPromise = options.includeCalls
    ? exactCount(
        sb
          .from("phone_calls")
          .select("id", { count: "exact", head: true })
          .eq("property_id", propertyId)
          .eq("user_id", userId)
          .eq("status", "completed")
          .gte("started_at", workdayStartIso),
      )
    : Promise.resolve(null)
  const tasks30Promise = options.includeTasks
    ? exactCount(
        sb
          .from("todos")
          .select("id", { count: "exact", head: true })
          .eq("property_id", propertyId)
          .eq("assigned_to", userId)
          .eq("status", "done")
          .gte("completed_at", rollingStartIso),
      )
    : Promise.resolve(null)
  const tasksTodayPromise = options.includeTasks
    ? exactCount(
        sb
          .from("todos")
          .select("id", { count: "exact", head: true })
          .eq("property_id", propertyId)
          .eq("assigned_to", userId)
          .eq("status", "done")
          .gte("completed_at", workdayStartIso),
      )
    : Promise.resolve(null)

  const [sales, completedCalls30, completedCallsToday, completedTasks30, completedTasksToday] = await Promise.all([
    salesPromise,
    calls30Promise,
    callsTodayPromise,
    tasks30Promise,
    tasksTodayPromise,
  ])

  if (sales.error) throw sales.error
  const rows = (sales.data ?? []) as SalesRow[]
  const closed30 = rows.filter((row) => atOrAfter(row.closed_at, rollingStartMs))

  return {
    closedDeals30: closed30.length,
    closedDealsMissingValue30: closed30.filter((row) => row.amount_cents === null).length,
    closedRevenueCents30: closed30.reduce((sum, row) => sum + (row.amount_cents ?? 0), 0),
    quotesSent30: rows.filter((row) => atOrAfter(row.quote_sent_at, rollingStartMs)).length,
    quotesSentToday: rows.filter((row) => atOrAfter(row.quote_sent_at, workdayStartMs)).length,
    completedCalls30,
    completedCallsToday,
    completedTasks30,
    completedTasksToday,
    conversionRate30: conversionRate(rows, rollingStartMs),
    conversionRateToday: conversionRate(rows, workdayStartMs),
  }
}
